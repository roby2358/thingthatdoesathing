// R-69 — the browser telemetry recorder (telemetry.js, GameTelemetry, D-65).
//
// The recorder runs in a vm with stubbed document, location, navigator (sendBeacon), fetch,
// crypto, window and timers; the game it records is a real engine game (flatGame) in another vm,
// its commands' results handed over as GameUI's commit() hands them. Cases:
//   - nothing before startGame: no record, timer or listener
//   - the game record's fields; the timer and the pagehide / visibilitychange listeners start with it
//   - one event record per place, remove, discard (pick and slot), move, scrap, bomb and blast,
//     accepted or refused, with the args given and the snapshot after the tick; none for wait or rotate
//   - a milestone a wait reaches gets a milestone record with the snapshot
//   - sending: fetch(keepalive) when the timer fires or at TELEMETRY_FLUSH_RECORDS records, sendBeacon
//     on pagehide and on a hidden tab; every batch carries the game record and one player; the
//     live endpoint from anywhere but localhost, which posts to its own origin
//   - a new game sends the last game's records under its own record; switchIdentity sends under
//     the old player, then the next batch carries a new one
//   - nothing recorded or sent without data-version, from file:, or with Global Privacy Control
//   - a throwing fetch, a rejecting fetch or a throwing sendBeacon throws nothing into play
//   - every batch the recorder sent is one the Worker takes (204, rows written)
'use strict';

const vm = require('vm');
const path = require('path');
const { pathToFileURL } = require('url');
const { check, done } = require('../helpers/check');
const { flatGame, source, DIR } = require('../helpers/load');

let unhandled = 0;
process.on('unhandledRejection', () => { unhandled++; });

// A page with the recorder loaded. opts: version (null = unstamped), protocol, hostname, origin,
// gpc, fetch (replaces the recording stub), beacon (replaces it).
function page(opts = {}) {
    const p = { sent: [], beacons: [], timers: [], winL: {}, docL: {} };
    let ids = 0;
    const doc = {
        documentElement: { dataset: opts.version === null ? {} : { version: opts.version || 'abc1234' } },
        visibilityState: 'visible',
        addEventListener: (t, fn) => (p.docL[t] ||= []).push(fn),
    };
    p.doc = doc;
    const ctx = vm.createContext({
        console,
        document: doc,
        location: { protocol: opts.protocol || 'https:', hostname: opts.hostname || 'ttdat.yuwakisa.com', origin: opts.origin || 'https://ttdat.yuwakisa.com' },
        navigator: {
            userAgent: 'TestBrowser/1.0', globalPrivacyControl: !!opts.gpc,
            sendBeacon: opts.beacon || ((url, body) => { p.beacons.push({ url, batch: JSON.parse(body) }); return true; }),
        },
        fetch: opts.fetch || ((url, init) => { p.sent.push({ url, init, batch: JSON.parse(init.body) }); return Promise.resolve({ status: 204 }); }),
        crypto: { randomUUID: () => 'uuid-' + (++ids) },
        window: { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2, addEventListener: (t, fn) => (p.winL[t] ||= []).push(fn) },
        setTimeout: (fn, ms) => { p.timers.push({ fn, ms, live: true }); return p.timers.length; },
        clearTimeout: id => { if (id && p.timers[id - 1]) p.timers[id - 1].live = false; },
    });
    vm.runInContext(['artifacts.js', 'displayartifacts.js', 'telemetry.js'].map(source).join('\n;\n') +
        '\n;globalThis.__x = { GameTelemetry, GameDisplayArtifacts, GameArtifacts };', ctx);
    Object.assign(p, ctx.__x);
    p.T = p.GameTelemetry;
    p.live = () => p.timers.filter(t => t.live);
    p.fire = () => { const due = p.live(); due.forEach(t => { t.live = false; t.fn(); }); return due.length; };
    p.hide = () => (p.winL.pagehide || []).forEach(fn => fn({}));
    return p;
}

const card = kind => ({ kind });
const g = flatGame();
const { state, engine, put, piece } = g;
const WHITE = g.g.GameArtifacts.WHITE;
const snapOf = s => ({ turn: s.turn, delivered: s.delivered, lost: s.lost, exGremlins: s.exGremlins, trapped: s.trapped,
    things: s.things.length, crates: s.pieces.filter(x => x.kind !== 'gremlin').length });
const picked = r => ({ turn: r.turn, delivered: r.delivered, lost: r.lost, exGremlins: r.exGremlins, trapped: r.trapped, things: r.things, crates: r.crates });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- nothing before a board is picked ----
const p = page();
p.T.command('place', { kind: 'BELT', q: 2, r: 4, facing: 0, color: WHITE }, { ok: true, events: [] }, state);
p.T.switchIdentity();
check('before startGame: no record, no timer, no listener, nothing sent',
    p.T.pending() === null && p.timers.length === 0 && !p.winL.pagehide && !p.docL.visibilitychange && p.sent.length === 0 && p.beacons.length === 0);

// ---- the game record ----
p.T.startGame({ seed: state.seed, size: 'small' });
const first = p.T.pending();
const rec = first && first.games[0];
check('startGame queues the game record: key, seed, size, version, rules version, user agent, screen',
    rec && typeof rec.gameKey === 'string' && rec.gameKey.length > 0 && rec.seed === state.seed && rec.size === 'small' &&
    rec.version === 'abc1234' && rec.rulesVersion === p.GameArtifacts.RULES_VERSION && p.GameArtifacts.RULES_VERSION === 1 &&
    rec.userAgent === 'TestBrowser/1.0' && rec.screen === '1280x720@2' && Number.isSafeInteger(rec.startedUnixSeconds) &&
    Math.abs(rec.startedUnixSeconds - Date.now() / 1000) < 5);
check('the batch: format, a player, no events yet', first.format === p.GameDisplayArtifacts.TELEMETRY_FORMAT &&
    typeof first.player === 'string' && first.player !== rec.gameKey && first.events.length === 0 && first.milestones.length === 0);
check('startGame starts the flush timer (TELEMETRY_FLUSH_MS) and the pagehide / visibilitychange listeners',
    p.live().length === 1 && p.live()[0].ms === p.GameDisplayArtifacts.TELEMETRY_FLUSH_MS && p.GameDisplayArtifacts.TELEMETRY_FLUSH_MS === 30000 &&
    p.winL.pagehide.length === 1 && p.docL.visibilitychange.length === 1);

// ---- one record per command, as GameUI's commit() hands them ----
const run = (command, args, res) => { p.T.command(command, args, res, state); return res; };
state.hand = [card('BELT'), card('WALL'), card('TRAP')];
const placed = run('place', { kind: 'BELT', q: 2, r: 4, facing: DIR.E, color: WHITE }, engine.place(0, 2, 4, DIR.E, WHITE));
const afterPlace = snapOf(state);
run('place', { kind: 'WALL', q: 10, r: 8, facing: null, color: WHITE }, engine.place(1, 10, 8, null, WHITE));   // on a target: refused
run('rotate', { q: 2, r: 4 }, engine.rotate(2, 4));
run('wait', undefined, engine.wait());
const thing = engine.thingAt(2, 4).kind;
run('remove', { q: 2, r: 4, kind: thing }, engine.remove(2, 4));
run('discard', { kind: state.hand[0].kind, how: 'pick' }, engine.discard(0));
run('discard', { kind: state.hand[2].kind, how: 'slot' }, engine.discard(2));
put('BELT', 3, 4, DIR.E);
state.hand = [card('MOVER'), card('MOVER'), card('BOMB')];
run('move', { kind: 'BELT', fromQ: 3, fromR: 4, q: 5, r: 4, facing: DIR.W }, engine.move(0, 3, 4, 5, 4, DIR.W));
run('scrap', { kind: 'BELT', q: 5, r: 4 }, engine.scrap(1, 5, 4));
put('WALL', 6, 2);
run('bomb', { hexes: [{ q: 6, r: 2 }] }, engine.bomb(2, [{ q: 6, r: 2 }]));
piece('crate', 7, 3);
run('blast', { q: 7, r: 3 }, engine.blast(7, 3));
const afterBlast = snapOf(state);
const evs = p.T.pending().events;
check('one event per recorded command, in order; none for rotate or wait',
    same(evs.map(e => e.command), ['place', 'place', 'remove', 'discard', 'discard', 'move', 'scrap', 'bomb', 'blast']));
check('the first place: accepted, its args as given, the snapshot after its tick',
    placed.ok && evs[0].accepted === true && same(evs[0].args, { kind: 'BELT', q: 2, r: 4, facing: DIR.E, color: WHITE }) &&
    same(picked(evs[0]), afterPlace) && evs[0].gameKey === rec.gameKey && Number.isSafeInteger(evs[0].unixSeconds) &&
    same(evs[0].deliveredByColor, { red: 0 }));
check('a refused command is recorded with accepted false', evs[1].accepted === false && evs[1].args.kind === 'WALL');
check('every other command accepted, with its args (remove names the Thing, discard how, move from and to, bomb its hexes)',
    evs.slice(2).every(e => e.accepted) && evs[2].args.kind === 'BELT' && evs[3].args.how === 'pick' && evs[4].args.how === 'slot' &&
    evs[5].args.fromQ === 3 && evs[5].args.q === 5 && same(evs[7].args.hexes, [{ q: 6, r: 2 }]) && evs[8].args.q === 7);
check('the last snapshot is the board after the blast (the crate gone)', same(picked(evs[8]), afterBlast) && evs[8].crates === 0);

// ---- a milestone from a wait ----
const goal = g.g.GameArtifacts.FIRST_MILESTONE;
state.delivered = goal - 1;
state.targets[0].delivered = goal - 1;
state.spawnCycle = [null];
piece('crate', 9, 8);
put('BELT', 9, 8, DIR.E);
const waited = run('wait', undefined, engine.wait());
const ms = p.T.pending().milestones;
check('a wait that reaches a milestone: no event, one milestone record with the snapshot',
    waited.events.some(e => e.type === 'milestone') && p.T.pending().events.length === evs.length && ms.length === 1 &&
    ms[0].milestone === goal && ms[0].delivered === goal && same(ms[0].deliveredByColor, { red: goal }) &&
    same(picked(ms[0]), snapOf(state)) && ms[0].gameKey === rec.gameKey);

// ---- sending ----
const pendingBefore = p.T.pending();
check('the timer sends the queue by fetch(keepalive) to the live endpoint', p.fire() === 1 && p.sent.length === 1 &&
    p.sent[0].url === 'https://ttdat.yuwakisa.com/t' && p.sent[0].init.method === 'POST' && p.sent[0].init.keepalive === true &&
    same(p.sent[0].batch, pendingBefore));
check('then the queue is empty and no timer runs', p.T.pending() === null && p.live().length === 0);
const N = p.GameDisplayArtifacts.TELEMETRY_FLUSH_RECORDS;
for (let i = 0; i < N; i++) run('blast', { q: 0, r: 0 }, { ok: false });
check(`at TELEMETRY_FLUSH_RECORDS (${N}) records it sends at once, the game record again`,
    N === 50 && p.sent.length === 2 && p.sent[1].batch.events.length === N && same(p.sent[1].batch.games[0], rec) &&
    p.sent[1].batch.player === p.sent[0].batch.player && p.T.pending() === null);
run('blast', { q: 0, r: 0 }, { ok: false });
p.hide();
check('pagehide sends the rest by sendBeacon', p.beacons.length === 1 && p.beacons[0].url === 'https://ttdat.yuwakisa.com/t' &&
    p.beacons[0].batch.events.length === 1 && same(p.beacons[0].batch.games[0], rec) && p.T.pending() === null);
run('blast', { q: 0, r: 0 }, { ok: false });
p.docL.visibilitychange.forEach(fn => fn({}));
check('a visibilitychange while visible sends nothing', p.beacons.length === 1 && p.T.pending().events.length === 1);
p.doc.visibilityState = 'hidden';
p.docL.visibilitychange.forEach(fn => fn({}));
p.doc.visibilityState = 'visible';
check('a hidden tab sends the rest by sendBeacon', p.beacons.length === 2 && p.T.pending() === null);
p.hide();
check('nothing queued: pagehide sends nothing', p.beacons.length === 2);

// ---- identity and new games ----
run('blast', { q: 0, r: 0 }, { ok: false });
const oldPlayer = p.sent[0].batch.player;
p.T.switchIdentity();
check('switchIdentity sends the queue under the old player', p.sent.length === 3 && p.sent[2].batch.player === oldPlayer && p.sent[2].batch.events.length === 1);
run('blast', { q: 0, r: 0 }, { ok: false });
p.fire();
check('the next batch carries a new player, same game', p.sent.length === 4 && p.sent[3].batch.player !== oldPlayer &&
    same(p.sent[3].batch.games[0], rec));
run('blast', { q: 0, r: 0 }, { ok: false });
p.T.startGame({ seed: 12345, size: 'medium' });
const next = p.T.pending();
check('a new game sends the last game\'s records under its own record, then queues its own',
    p.sent.length === 5 && p.sent[4].batch.games[0].gameKey === rec.gameKey && p.sent[4].batch.events.length === 1 &&
    next.games[0].gameKey !== rec.gameKey && next.games[0].seed === 12345 && next.games[0].size === 'medium' && next.events.length === 0);
check('listeners are installed once', p.winL.pagehide.length === 1 && p.docL.visibilitychange.length === 1);
p.fire();
check('a game with no records yet still sends its game record once', p.sent.length === 6 && p.sent[5].batch.events.length === 0 &&
    p.T.pending() === null && p.live().length === 0);

// ---- where it sends from ----
const local = page({ protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:8787' });
local.T.startGame({ seed: 1, size: 'small' });
local.fire();
check('on localhost (wrangler dev) it posts to its own origin', local.sent.length === 1 && local.sent[0].url === 'http://localhost:8787/t');

for (const [label, opts] of [['without data-version (dev)', { version: null }], ['from file:', { protocol: 'file:' }], ['with Global Privacy Control', { gpc: true }]]) {
    const q = page(opts);
    q.T.startGame({ seed: 1, size: 'small' });
    for (let i = 0; i < N + 5; i++) q.T.command('blast', { q: 0, r: 0 }, { ok: false }, state);
    q.T.command('wait', undefined, waited, state);
    q.fire(); q.hide(); q.T.switchIdentity();
    check('nothing recorded or sent ' + label, q.T.pending() === null && q.sent.length === 0 && q.beacons.length === 0 && !q.winL.pagehide);
}

// ---- a failing send never reaches play ----
const thrower = page({ fetch: () => { throw new Error('offline'); }, beacon: () => { throw new Error('nope'); } });
let threw = null;
try {
    thrower.T.startGame({ seed: 1, size: 'small' });
    for (let i = 0; i < N * 2; i++) thrower.T.command('blast', { q: 0, r: 0 }, { ok: false }, state);
    thrower.T.command('blast', { q: 0, r: 0 }, { ok: false }, state);
    thrower.fire();
    thrower.T.command('blast', { q: 0, r: 0 }, { ok: false }, state);
    thrower.hide();
    thrower.T.switchIdentity();
    thrower.T.startGame({ seed: 2, size: 'small' });
} catch (e) { threw = e; }
check('a throwing fetch or sendBeacon throws nothing into the game, and the batch is dropped', !threw && thrower.T.pending().events.length === 0);
const rejecter = page({ fetch: () => Promise.reject(new Error('offline')) });
rejecter.T.startGame({ seed: 1, size: 'small' });
rejecter.fire();
const ok = engine.wait().ok;

(async () => {
    await new Promise(r => setTimeout(r, 20));
    check('a rejected fetch is caught (no unhandled rejection), and play goes on', unhandled === 0 && rejecter.sent.length === 0 && ok);

    // ---- the Worker takes what the recorder sends ----
    const { telemetry } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'worker', 'telemetry.js')).href);
    const batches = [...p.sent.map(s => s.batch), ...p.beacons.map(b => b.batch), ...local.sent.map(s => s.batch)];
    let rows = 0, statuses = [];
    for (const b of batches) {
        const writes = [];
        const env = { TELEMETRY: { prepare: sql => ({ bind: (...a) => ({ sql, a }) }), batch: async s => { rows += s.length; } } };
        const res = await telemetry(new Request('https://ttdat.yuwakisa.com/t', { method: 'POST', body: JSON.stringify(b), headers: { 'Content-Type': 'text/plain' } }),
            env, { waitUntil: w => writes.push(w) });
        await Promise.all(writes);
        statuses.push(res.status);
    }
    const expected = batches.reduce((n, b) => n + b.games.length + b.events.length + b.milestones.length, 0);
    check(`the Worker takes every batch the recorder sent (${batches.length}): 204 and every row written`,
        statuses.every(s => s === 204) && rows === expected);
    done();
})();

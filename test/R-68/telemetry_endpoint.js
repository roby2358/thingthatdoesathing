// R-68 — the ttdat Worker's POST /t (worker/index.js routing to worker/telemetry.js, D-64): a telemetry batch checked whole
// and written to D1.
//
// Sign-in isn't configured here (no AUTH_SERVICE in env), so a batch's `token` changes nothing;
// R-74 has the signed-in identity. The worker is imported as the ES module wrangler deploys, and run against a fake D1 that is a
// real SQLite database (node:sqlite) with worker/telemetry_schema.sql applied, recording every
// bind, and a fake ctx whose waitUntil collects the writes. Cases:
//   - a valid batch → 204 with Access-Control-Allow-Origin *, and the right rows in all four
//     tables (args with columns in them, the rest and deliveredByColor in `rest`); a crash-only
//     batch too, its message and stack cut
//   - the batch's format is stored on the games row; TELEMETRY_FORMAT matches GameDisplayArtifacts;
//     every KNOWN_COMMANDS entry is a GameEngine method
//   - bad batches (too big by header or by body, too many records, a wrong field type, an unknown
//     command, a missing required field, not JSON, an array) → 400 and nothing written
//   - a missing or unknown format (a string "1" included) → 204, nothing written, a console.error
//     that holds nothing of the body
//   - seq follows arrival order, across batches
//   - two batches of one game with different players stamp their own rows with their own player_id
//   - a game record sent twice is inserted once (the first player kept); a milestone sent twice too
//   - no IP (CF-Connecting-IP, X-Forwarded-For) in any bind or log line
//   - a non-/t path or a non-POST method → 404, nothing written
//   - a D1 failure is logged and the response is still 204
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { DatabaseSync } = require('node:sqlite');
const { check, done } = require('../helpers/check');
const { load } = require('../helpers/load');

const ROOT = path.join(__dirname, '..', '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'worker', 'telemetry_schema.sql'), 'utf8');
const IP = '203.0.113.77';

// Every console line, so the IP and body checks can read them.
const logged = [];
// console.log is also the check harness's output, so it still prints.
const say = (...a) => process.stdout.write(a.join(' ') + '\n');
for (const k of ['info', 'warn', 'error', 'debug']) console[k] = (...a) => logged.push(a.map(String).join(' '));
console.log = (...a) => { logged.push(a.map(String).join(' ')); say(...a); };

/** A D1 stand-in on node:sqlite: prepare/bind/batch as the Worker uses them, binds recorded. */
function fakeD1(fail) {
    const db = new DatabaseSync(':memory:');
    db.exec(SCHEMA);
    const binds = [];
    return {
        db, binds,
        prepare(sql) {
            return { bind(...args) { binds.push(args); return { sql, args }; } };
        },
        async batch(statements) {
            if (fail) throw new Error('D1 is down');
            db.exec('BEGIN');
            try {
                for (const s of statements) db.prepare(s.sql).run(...s.args.map(v => v === undefined ? null : v));
                db.exec('COMMIT');
            } catch (e) { db.exec('ROLLBACK'); throw e; }
        },
        rows(table, order) { return db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all().map(r => ({ ...r })); },
        count(table) { return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n; },
    };
}

let worker, TELEMETRY_FORMAT, MAX_RECORDS, MAX_BODY_BYTES, CRASH_MESSAGE_CHARS, CRASH_STACK_CHARS;

const URL_T = 'https://ttdat.yuwakisa.com/t';

/** Sends one body; resolves the response once every write settles. */
async function send(d1, body, { method, url, headers }) {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    const init = { method, headers: { 'Content-Type': 'text/plain', 'CF-Connecting-IP': IP, 'X-Forwarded-For': IP, ...headers } };
    if (method !== 'GET' && method !== 'HEAD') init.body = text;
    const waits = [];
    const res = await worker.fetch(new Request(url, init), { TELEMETRY: d1 }, { waitUntil: p => waits.push(p) });
    await Promise.all(waits);
    return res;
}

/** The usual case: POST /t, no extra headers. */
const post = (d1, body) => send(d1, body, { method: 'POST', url: URL_T, headers: {} });

const tables = ['games', 'events', 'milestones', 'crashes'];
const total = d1 => tables.reduce((n, t) => n + d1.count(t), 0);

const GAME = { gameKey: 'g1', startedUnixSeconds: 1763700000, seed: 4242, size: 'small', version: 'abc1234',
    rulesVersion: 1, userAgent: 'Mozilla/5.0 test', screen: '1280x720@1' };
const snap = { turn: 7, delivered: 3, lost: 1, exGremlins: 2, trapped: 1, things: 5, crates: 2, deliveredByColor: { red: 3 } };
const EVENT = { gameKey: 'g1', unixSeconds: 1763700010, command: 'place', accepted: true, ...snap,
    args: { kind: 'BELT', q: 3, r: -1, facing: 0, color: 'white', how: 'pick' } };
const MILESTONE = { gameKey: 'g1', milestone: 10, unixSeconds: 1763700100, ...snap, turn: 60, delivered: 10 };
const CRASH = { unixSeconds: 1763700200, version: 'abc1234', gameKey: 'g1', seed: 4242, size: 'small', turn: 61,
    message: 'TypeError: x is undefined', stack: 'at a\nat b', userAgent: 'Mozilla/5.0 test' };

(async () => {
    worker = (await import(pathToFileURL(path.join(ROOT, 'worker', 'index.js')).href)).default;
    const mod = await import(pathToFileURL(path.join(ROOT, 'worker', 'telemetry.js')).href);
    ({ TELEMETRY_FORMAT, MAX_RECORDS, MAX_BODY_BYTES, CRASH_MESSAGE_CHARS, CRASH_STACK_CHARS } = mod);
    const display = fs.readFileSync(path.join(ROOT, 'displayartifacts.js'), 'utf8').match(/TELEMETRY_FORMAT:\s*(\d+)/);
    check('GameDisplayArtifacts.TELEMETRY_FORMAT is the worker\'s TELEMETRY_FORMAT', display && Number(display[1]) === TELEMETRY_FORMAT);
    check('the worker reads its own format', mod.KNOWN_FORMATS.includes(TELEMETRY_FORMAT));
    const { GameEngine } = load();
    check('every KNOWN_COMMANDS entry is a GameEngine command', mod.KNOWN_COMMANDS.every(c => typeof GameEngine.prototype[c] === 'function'));

    // A valid batch: rows in all four tables.
    {
        const d1 = fakeD1(false);
        const res = await post(d1, { format: 1, player: 'p-one', token: 'ignored', games: [GAME],
            events: [EVENT, { ...EVENT, command: 'discard', accepted: false, args: { kind: 'WALL', how: 'slot' } }, { ...EVENT, command: 'wait', args: undefined }],
            milestones: [MILESTONE], crashes: [CRASH] });
        check('a valid batch → 204', res.status === 204);
        check('… with Access-Control-Allow-Origin *', res.headers.get('Access-Control-Allow-Origin') === '*');
        const [g] = d1.rows('games', 'rowid');
        check('one games row with its fields', d1.count('games') === 1 && g.game_key === 'g1' && g.seed === 4242 && g.size === 'small'
            && g.version === 'abc1234' && g.rules_version === 1 && g.started_unix_seconds === 1763700000
            && g.user_agent === 'Mozilla/5.0 test' && g.screen === '1280x720@1');
        check('the batch format is on the games row', g.format === 1);
        check('the games row carries the batch identity', g.player_id === 'p-one' && g.signed_in === 0);
        const ev = d1.rows('events', 'seq');
        check('three event rows', ev.length === 3);
        const e0 = ev[0];
        check('an event\'s counts and command', e0.command === 'place' && e0.accepted === 1 && e0.turn === 7 && e0.delivered === 3
            && e0.lost === 1 && e0.ex_gremlins === 2 && e0.trapped === 1 && e0.things === 5 && e0.crates === 2 && e0.unix_seconds === 1763700010);
        check('args with columns go to their columns', e0.kind === 'BELT' && e0.q === 3 && e0.r === -1 && e0.facing === 0 && e0.color === 'white');
        check('rest holds the other args and deliveredByColor, not the columns',
            JSON.stringify(JSON.parse(e0.rest)) === JSON.stringify({ args: { how: 'pick' }, deliveredByColor: { red: 3 } }));
        check('a command without some args leaves those columns null', ev[1].kind === 'WALL' && ev[1].q === null && ev[1].facing === null
            && ev[1].accepted === 0 && JSON.parse(ev[1].rest).args.how === 'slot');
        check('an event with no args at all', ev[2].command === 'wait' && ev[2].kind === null && JSON.stringify(JSON.parse(ev[2].rest).args) === '{}');
        check('every event row carries the batch identity', ev.every(e => e.player_id === 'p-one' && e.signed_in === 0));
        const [m] = d1.rows('milestones', 'rowid');
        check('one milestones row', d1.count('milestones') === 1 && m.milestone === 10 && m.turn === 60 && m.delivered === 10
            && m.player_id === 'p-one' && m.signed_in === 0 && JSON.parse(m.rest).deliveredByColor.red === 3);
        const [c] = d1.rows('crashes', 'rowid');
        check('one crashes row', d1.count('crashes') === 1 && c.message === 'TypeError: x is undefined' && c.game_key === 'g1'
            && c.turn === 61 && c.format === 1 && c.player_id === 'p-one' && c.version === 'abc1234');
        check('the token is in no bind', !d1.binds.flat().includes('ignored'));
    }

    // A crash-only batch, with nothing known but the crash; its message and stack are cut.
    {
        const d1 = fakeD1(false);
        const res = await post(d1, { format: 1, player: 'p-crash', crashes: [{ unixSeconds: 1763700300, message: 'm'.repeat(900), stack: 's'.repeat(5000) }] });
        const [c] = d1.rows('crashes', 'rowid');
        check('a crash-only batch → 204 and one crashes row, nothing else', res.status === 204 && d1.count('crashes') === 1 && total(d1) === 1);
        check('… unknowns null, format from the batch', c.game_key === null && c.seed === null && c.size === null && c.turn === null && c.format === 1);
        check('… message and stack cut to CRASH_MESSAGE_CHARS and CRASH_STACK_CHARS', c.message.length === CRASH_MESSAGE_CHARS && c.stack.length === CRASH_STACK_CHARS);
    }

    // Bad batches: 400, nothing written.
    // [label, body, extra headers, the refusal's console line names]
    const bad = [
        ['too big by Content-Length', { format: 1, player: 'p', games: [GAME] }, { 'Content-Length': String(MAX_BODY_BYTES + 1) }, 'body too big'],
        ['too big by body', JSON.stringify({ format: 1, player: 'p', crashes: [{ ...CRASH, stack: 'é'.repeat(MAX_BODY_BYTES / 2 + 10) }] }), { 'Content-Length': '10' }, 'body too big'],
        ['too many records', { format: 1, player: 'p', games: [GAME], events: Array.from({ length: MAX_RECORDS }, () => EVENT) }, {}, 'too many records'],
        ['a wrong type (seed a string)', { format: 1, player: 'p', games: [{ ...GAME, seed: '4242' }] }, {}, 'games[0].seed'],
        ['a wrong type (accepted a number)', { format: 1, player: 'p', games: [GAME], events: [{ ...EVENT, accepted: 1 }] }, {}, 'events[0].accepted'],
        ['a wrong type (an arg column)', { format: 1, player: 'p', games: [GAME], events: [{ ...EVENT, args: { q: 'three' } }] }, {}, 'events[0].args.q'],
        ['an unknown command', { format: 1, player: 'p', games: [GAME], events: [{ ...EVENT, command: 'teleport' }] }, {}, 'events[0].command'],
        ['a missing player', { format: 1, games: [GAME] }, {}, 'player'],
        ['a missing required field', { format: 1, player: 'p', milestones: [{ ...MILESTONE, turn: undefined }] }, {}, 'milestones[0].turn'],
        ['a record list that isn\'t a list', { format: 1, player: 'p', events: {} }, {}, 'events'],
        ['not JSON', '{format: 1', {}, 'not JSON'],
        ['an array', [1, 2], {}, 'not an object'],
    ];
    for (const [label, body, headers, why] of bad) {
        const d1 = fakeD1(false);
        logged.length = 0;
        const res = await send(d1, body, { method: 'POST', url: URL_T, headers });
        check(`${label} → 400, nothing written, refused for it`, res.status === 400 && total(d1) === 0 && d1.binds.length === 0
            && logged.length === 1 && logged[0] === 'telemetry batch refused: ' + why);
    }

    // A missing or unknown format: 204, dropped quietly, the log holds no body.
    for (const [label, format] of [['a missing format', undefined], ['an unknown format', 99], ['a format "1" as a string', '1']]) {
        const d1 = fakeD1(false);
        logged.length = 0;
        const res = await post(d1, { format, player: 'secret-player', games: [{ ...GAME, gameKey: 'secret-game' }] });
        const lines = logged.slice();
        check(`${label} → 204, nothing written`, res.status === 204 && total(d1) === 0 && d1.binds.length === 0);
        check(`… one console line, without the body`, lines.length === 1 && !/secret/.test(lines[0]));
    }

    // seq in arrival order, across batches; identities per batch; resent records kept once.
    {
        const d1 = fakeD1(false);
        logged.length = 0;
        await post(d1, { format: 1, player: 'first', games: [GAME], events: [{ ...EVENT, turn: 1 }, { ...EVENT, turn: 2 }], milestones: [MILESTONE] });
        await post(d1, { format: 1, player: 'second', games: [{ ...GAME, seed: 1 }], events: [{ ...EVENT, turn: 3 }], milestones: [{ ...MILESTONE, turn: 99 }] });
        const ev = d1.rows('events', 'seq');
        check('seq follows arrival order across batches', ev.map(e => e.seq).join() === '0,1,2' && ev.map(e => e.turn).join() === '1,2,3');
        check('each batch stamps its own rows with its own player_id', ev.map(e => e.player_id).join() === 'first,first,second');
        const g = d1.rows('games', 'rowid');
        check('a game record sent twice is inserted once, the first kept', g.length === 1 && g[0].player_id === 'first' && g[0].seed === 4242);
        const m = d1.rows('milestones', 'rowid');
        check('a milestone sent twice is inserted once', m.length === 1 && m[0].turn === 60);
        check('no IP in any bind', !JSON.stringify(d1.binds).includes(IP));
        check('no IP in any log line', !logged.some(l => l.includes(IP)));
    }

    // Other paths and methods: 404.
    for (const [label, opts] of [['GET /t', { method: 'GET' }], ['PUT /t', { method: 'PUT' }], ['POST /x', { url: 'https://ttdat.yuwakisa.com/x' }], ['POST /t/', { url: 'https://ttdat.yuwakisa.com/t/' }]]) {
        const d1 = fakeD1(false);
        const res = await send(d1, { format: 1, player: 'p', games: [GAME] }, { method: 'POST', url: URL_T, headers: {}, ...opts });
        check(`${label} → 404, nothing written`, res.status === 404 && total(d1) === 0);
    }

    // A D1 failure: logged, still 204.
    {
        const d1 = fakeD1(true);
        logged.length = 0;
        const res = await post(d1, { format: 1, player: 'p', games: [GAME] });
        check('a D1 failure still answers 204', res.status === 204);
        check('… and is logged', logged.some(l => /not written to D1/.test(l)));
    }
    done();
})().catch(e => { say('FAIL threw: ' + (e && e.stack)); process.exit(1); });

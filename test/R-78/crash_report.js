// R-78 — the crash report (crash.js, D-71): the first uncaught error or unhandled rejection that
// shows the crash screen also sends one crash record to the telemetry endpoint by sendBeacon.
// The real page in a stub DOM (test/helpers/page.js), its window's error listeners captured.
//   - a ship build on the live site, in a game: the recorder's queue goes first by beacon, then
//     one batch { format, player (the recorder's), crashes: [one record] } to the live endpoint
//     with format, unixSeconds, version, gameKey (the recorder's), seed, size, turn, message (the
//     card's text, cut to 500), stack (whole first lines, at most 2000 chars) and userAgent; the
//     Worker takes it (204, one crashes row)
//   - signed in: the crash batch carries the token too
//   - a throw before displayartifacts.js loads: still sent, format 1, to the live endpoint, a fresh
//     random player, nulls for gameKey, seed, size and turn
//   - a page on localhost posts to its own origin's /t
//   - no data-version, file:, or Global Privacy Control: nothing sent; the recorder backing off
//     (D-70): nothing sent
//   - a second error (or a rejection after it): no second send; a throwing sendBeacon is ignored
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const { check, done } = require('../helpers/check');
const { bootPage } = require('../helpers/page');

// A page whose window listeners are kept and whose beacons land in `beacons`.
function crashPage({ gpc = false, beacon, ...opts } = {}) {
    const listeners = {}, beacons = [];
    const navigator = {
        userAgent: 'Crash/1.0 ' + 'x'.repeat(600), globalPrivacyControl: gpc,
        sendBeacon: beacon || ((url, body) => { beacons.push({ url, batch: JSON.parse(body) }); return true; }),
    };
    const p = bootPage({
        ...opts,
        win: { addEventListener: (t, fn) => (listeners[t] ||= []).push(fn), ...(opts.win || {}) },
        globals: { navigator, ...(opts.globals || {}) },
    });
    const fire = (type, ev) => (listeners[type] || []).forEach(fn => fn(ev));
    const crashes = () => beacons.filter(b => b.batch.crashes);
    return { ...p, listeners, beacons, fire, crashes };
}
const throwError = (p, err) => p.fire('error', { message: 'Uncaught ' + err, error: err });

// A deep stack: 200 lines of 30 chars, so the cut lands between lines.
function deepError(message) {
    const e = new TypeError(message);
    e.stack = 'TypeError: ' + message + '\n' + Array.from({ length: 200 }, (_, i) => '    at frame' + String(i).padStart(4, '0') + ' (gameui.js:1:1)').join('\n');
    return e;
}

(async () => {
    // ---- in a game, on the live site ----
    const p = crashPage();
    check('crash.js listens for error and unhandledrejection', p.listeners.error && p.listeners.unhandledrejection);
    p.run("ui.startGame('small')");
    p.run("GameTelemetry.command('discard', { kind: state.hand[0].kind, how: 'slot' }, engine.discard(0), state)");
    const gameKey = p.run('GameTelemetry.gameKey()');
    const seed = p.run('state.seed'), turn = p.run('state.turn');
    const longMessage = 'wait broke ' + 'y'.repeat(700);
    throwError(p, deepError(longMessage));
    check('the crash card shows', p.els['crash-panel'].classList.set.has('hidden') === false);
    check('two beacons: the recorder\'s queue, then the crash', p.beacons.length === 2 && !p.beacons[0].batch.crashes && p.beacons[0].batch.events.length === 1 && p.beacons[1].batch.crashes);
    const sent = p.crashes()[0];
    const b = sent && sent.batch, c = b && b.crashes[0];
    check('one batch with one crash record to the live endpoint', p.crashes().length === 1 && b.crashes.length === 1 && sent.url === 'https://ttdat.yuwakisa.com/t');
    check('the batch: format 1, the recorder\'s player, no games, events or milestones, no token',
        b.format === 1 && b.player === p.beacons[0].batch.player && !b.games && !b.events && !b.milestones && !('token' in b));
    check('the record: format, unixSeconds, version, the recorder\'s gameKey, seed, size, turn',
        c.format === 1 && Number.isInteger(c.unixSeconds) && Math.abs(c.unixSeconds - Date.now() / 1000) < 5 &&
        c.version === 'page1234' && c.gameKey === gameKey && typeof gameKey === 'string' && c.seed === seed && c.size === 'small' && c.turn === turn);
    check('the message is the card\'s text, cut to 500', c.message === ('TypeError: ' + longMessage).slice(0, 500) && p.els['crash-message'].textContent.startsWith(c.message));
    check('the stack is its first whole lines, at most 2000 chars', c.stack.length <= 2000 && c.stack.length > 1900 &&
        c.stack.startsWith('TypeError: wait broke') && c.stack.endsWith('(gameui.js:1:1)'));
    check('the user agent, cut to 512', c.userAgent.length === 512 && c.userAgent.startsWith('Crash/1.0'));

    // A second error, then a rejection: no second send.
    throwError(p, new Error('again'));
    p.fire('unhandledrejection', { reason: new Error('later') });
    check('a second error or a rejection sends nothing more', p.beacons.length === 2);

    // The Worker takes it.
    const { telemetry } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'worker', 'telemetry.js')).href);
    const binds = [], writes = [];
    const env = { TELEMETRY: { prepare: sql => ({ bind: (...a) => (binds.push({ sql, a }), {}) }), batch: async () => {} } };
    const res = await telemetry(new Request('https://ttdat.yuwakisa.com/t', { method: 'POST', body: JSON.stringify(b), headers: { 'Content-Type': 'text/plain' } }),
        env, { waitUntil: w => writes.push(w) });
    await Promise.all(writes);
    check('the Worker takes the crash batch: 204, one crashes row', res.status === 204 && binds.length === 1 && /INSERT INTO crashes/.test(binds[0].sql));

    // ---- signed in: the token rides along ----
    const s = crashPage();
    s.run("ui.startGame('small'); GameTelemetry.switchIdentity('tok-123')");
    throwError(s, new Error('signed in'));
    const sb = s.crashes()[0] && s.crashes()[0].batch;
    check('signed in: the crash batch carries the token', sb && sb.token === 'tok-123');

    // ---- an unhandled rejection with no game ----
    const r = crashPage();
    r.fire('unhandledrejection', { reason: 'nope' });
    const rc = r.crashes()[0] && r.crashes()[0].batch;
    check('a rejection before any game: sent, a fresh player, nulls for game, seed, size, turn, no stack',
        r.crashes().length === 1 && /^page-uuid-/.test(rc.player) && rc.crashes[0].message === 'nope' &&
        rc.crashes[0].gameKey === null && rc.crashes[0].seed === null && rc.crashes[0].size === null && rc.crashes[0].turn === null && rc.crashes[0].stack === null);

    // ---- a throw before displayartifacts.js loads ----
    const l = crashPage({ patch: { before: 'displayartifacts.js', src: 'throw new Error("load broke");' } });
    check('the patched load threw', !!l.thrown);
    throwError(l, l.thrown);
    const lc = l.crashes()[0];
    check('before displayartifacts.js: still sent, format 1, live endpoint, a fresh player, nulls for unknowns',
        l.crashes().length === 1 && lc.url === 'https://ttdat.yuwakisa.com/t' && lc.batch.format === 1 && lc.batch.crashes[0].format === 1 &&
        /^page-uuid-/.test(lc.batch.player) && lc.batch.crashes[0].message === 'Error: load broke' &&
        lc.batch.crashes[0].gameKey === null && lc.batch.crashes[0].seed === null && lc.batch.crashes[0].size === null &&
        lc.batch.crashes[0].turn === null && lc.batch.crashes[0].version === 'page1234');

    // ---- a localhost page posts to its own origin ----
    const d = crashPage({ origin: 'http://localhost:8787' });
    throwError(d, new Error('dev worker'));
    check('a localhost page posts to its own origin\'s /t', d.crashes().length === 1 && d.crashes()[0].url === 'http://localhost:8787/t');

    // ---- the recorder's rules ----
    for (const [label, opts] of [['no data-version', { version: null }], ['file:', { origin: 'null' }], ['Global Privacy Control', { gpc: true }]]) {
        const n = crashPage(opts);
        n.run("ui.startGame('small')");
        throwError(n, new Error('quiet'));
        check(label + ': the card shows, nothing sent', n.els['crash-panel'].classList.set.has('hidden') === false && n.beacons.length === 0);
    }
    // The recorder backing off after a 429 (D-70): the crash isn't sent either.
    const q = crashPage({ globals: { fetch: () => Promise.resolve({ status: 429 }) } });
    q.run("ui.startGame('small'); GameTelemetry.switchIdentity(null)");   // flushes by fetch → 429
    await new Promise(res => setImmediate(res));
    check('(the 429 put the recorder in backoff)', q.run('GameTelemetry.beforeCrash().quiet') === true);
    throwError(q, new Error('backing off'));
    check('the recorder backing off: nothing sent', q.beacons.length === 0);

    // ---- a throwing sendBeacon is ignored ----
    const t = crashPage({ beacon: () => { throw new Error('no beacon'); } });
    let threw = null;
    try { throwError(t, new Error('x')); } catch (e) { threw = e; }
    check('a throwing sendBeacon is ignored, the card still shows', !threw && t.els['crash-panel'].classList.set.has('hidden') === false);
    done();
})();

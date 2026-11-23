// R-109 — the recorder's rung records (telemetry.js, GameTelemetry.rungs, D-80).
//
// The recorder runs in a vm with stubbed document, location, navigator, fetch, crypto, window and
// timers (as R-96). Then the real page, signed in on the live site (test/helpers/achievements.js),
// shows GameUI handing over what the achievements client announces. Cases:
//   - rungs(announced) queues one {gameKey, counter, rung, unixSeconds} per announcement, rung the
//     announced amount; nothing for an empty list; nothing before startGame
//   - the batch carries rungs beside the other lists; rung records count toward
//     TELEMETRY_FLUSH_RECORDS and go with the timer's flush, emptied after
//   - nothing without data-version, from file:, or with GPC; nothing while backing off after a 429
//   - the page: the rungs a command crosses (rungsReached's own included) queue rung records in
//     the order announced; with GPC on the sync still runs, but no rung record is made
//   - the Worker takes every batch with rung records (204, every row written)
'use strict';

const path = require('path');
const { pathToFileURL } = require('url');
const { check, done } = require('../helpers/check');
const { recorderPage } = require('../helpers/telemetry');
const { achGame, counts, LIVE, signedIn, flushPromises } = require('../helpers/achievements');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Announcements as GameAchievements makes them (only counter and amount are read).
const said = (counter, amount) => ({ counter, label: counter, amount, negative: false, line: 'x' });

// ---- rung records ----
const p = recorderPage({});
p.T.rungs([said('placed', 10)]);
check('before startGame: no rung record', p.T.pending() === null);
p.T.startGame({ seed: 1, size: 'small' });
const key = p.T.gameKey();
p.T.rungs([]);
check('an empty list: no rung record', p.T.pending().rungs.length === 0);
p.T.rungs([said('placed', 10), said('rungsReached', 1), said('rungsReached', 2)]);
let b = p.T.pending();
const r0 = b.rungs[0];
check('the batch carries a rungs list beside the others', Array.isArray(b.rungs) && Array.isArray(b.goalSets) && Array.isArray(b.events));
check('one record per announcement, in order, rung the amount', b.rungs.length === 3 &&
    same(b.rungs.map(r => [r.counter, r.rung]), [['placed', 10], ['rungsReached', 1], ['rungsReached', 2]]));
check('… with game key, counter, rung, unixSeconds and nothing else', r0.gameKey === key && Number.isSafeInteger(r0.unixSeconds) &&
    Math.abs(r0.unixSeconds - Date.now() / 1000) < 5 && same(Object.keys(r0).sort(), ['counter', 'gameKey', 'rung', 'unixSeconds']));
check('rung records are not events', b.events.length === 0 && b.milestones.length === 0);

// ---- sending ----
const queued = p.T.pending();
check('the timer sends them with the batch, then the queue is empty', p.fire() === 1 && p.sent.length === 1 &&
    same(p.sent[0].rungs, queued.rungs) && p.T.pending() === null);
const N = p.GameDisplayArtifacts.TELEMETRY_FLUSH_RECORDS;
p.T.rungs(Array.from({ length: N - 1 }, (_, i) => said('discards', 10 * (i + 1))));
check('rung records count toward TELEMETRY_FLUSH_RECORDS: not yet at N − 1', p.sent.length === 1);
p.T.rungs([said('trapped', 200)]);
check('… sent at once at N', p.sent.length === 2 && p.sent[1].rungs.length === N && p.T.pending() === null);

// ---- the gates ----
for (const [label, opts] of [['without data-version', { version: null }], ['from file:', { protocol: 'file:' }], ['with Global Privacy Control', { gpc: true }]]) {
    const q = recorderPage(opts);
    q.T.startGame({ seed: 1, size: 'small' });
    q.T.rungs([said('placed', 10)]);
    q.fire();
    check('nothing recorded or sent ' + label, q.T.pending() === null && q.sent.length === 0);
}

(async () => {
    // ---- backing off ----
    {
        const q = recorderPage({ status: 429 });
        q.T.startGame({ seed: 1, size: 'small' });
        q.fire();
        await new Promise(r => setTimeout(r, 10));
        q.T.rungs([said('placed', 10)]);
        check('backing off after a 429: rung records dropped', q.sent.length === 1 && q.T.pending() === null);
    }

    // ---- through the page: GameUI hands over what GameAchievements announces ----
    const live = achGame({ origin: LIVE, storage: signedIn() });
    live.fetcher.calls[0].reply(200, { totals: { placed: 8 } });
    await flushPromises();
    const before = live.run('GameTelemetry.pending()').rungs.length;
    live.run(`GameAchievements.counted(${JSON.stringify(counts(live, {}))}, ${JSON.stringify(counts(live, { placed: 4 }))})`);
    const got = live.run('GameTelemetry.pending()');
    check('the page: no rung record before a rung', before === 0);
    check('placed 8 → 12: placed 10, then rungsReached 1 and 2, as rung records in that order',
        same(got.rungs.map(r => [r.counter, r.rung]), [['placed', 10], ['rungsReached', 1], ['rungsReached', 2]]) &&
        got.rungs.every(r => r.gameKey === live.run('GameTelemetry.gameKey()')));
    check('… in a batch that carries the sign-in token', got.token === 'tok-123');
    const pageBatch = got;

    const gpc = achGame({ origin: LIVE, storage: signedIn(), globals: { navigator: { userAgent: 'Page/1.0', sendBeacon: () => true, globalPrivacyControl: true } } });
    gpc.fetcher.calls[0].reply(200, { totals: { placed: 8 } });
    await flushPromises();
    gpc.run(`GameAchievements.counted(${JSON.stringify(counts(gpc, {}))}, ${JSON.stringify(counts(gpc, { placed: 4 }))})`);
    check('Global Privacy Control on: the totals still count (the sync is the player\'s), no rung record', gpc.run('GameAchievements.totals()').placed === 12 &&
        gpc.run('GameTelemetry.pending()') === null);

    // ---- the Worker takes them ----
    const { telemetry } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'worker', 'telemetry.js')).href);
    const batches = [...p.sent, pageBatch];
    let rows = 0;
    const statuses = [];
    for (const batch of batches) {
        const writes = [];
        const env = { TELEMETRY: { prepare: sql => ({ bind: (...a) => ({ sql, a }) }), batch: async s => { rows += s.length; } } };
        const r = await telemetry(new Request('https://ttdat.yuwakisa.com/t', { method: 'POST', body: JSON.stringify(batch) }), env, { waitUntil: w => writes.push(w) });
        await Promise.all(writes);
        statuses.push(r.status);
    }
    const expected = batches.reduce((n, x) => n + x.games.length + x.events.length + x.milestones.length + x.goalSets.length + x.goalsMet.length + x.rungs.length, 0);
    check(`the Worker takes every batch with rung records (${batches.length}): 204 and every row written`, statuses.every(s => s === 204) && rows === expected);
    done();
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack)); process.exit(1); });

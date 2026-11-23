// R-107: a signed-in player's totals live on the server (D-79, D-78). At boot with a stored
// sign-in the page POSTs {token} to /achievements beside TELEMETRY_ENDPOINT (keepalive, no
// credentials); until the totals come, status is 'loading' and increments are queued, nothing
// announced; when they come, the queued increments are announced against them. Increments to send
// (rungsReached's included) are summed and POSTed as {token, add} every TELEMETRY_FLUSH_MS and on
// pagehide. Global Privacy Control doesn't stop it. A 429 or 403 drops the queue and counts
// nothing for TELEMETRY_BACKOFF_MS. Sign-out sends what's unsent, then stops.
'use strict';
const { check, done } = require('../helpers/check');
const { achGame, counts, bannerLines, LIVE, TOKEN, signedIn, flushPromises } = require('../helpers/achievements');

(async () => {
    const p = achGame({ origin: LIVE, storage: signedIn(), globals: { navigator: { userAgent: 'Page/1.0', sendBeacon: () => true, globalPrivacyControl: true } } });
    const calls = p.fetcher.calls;
    const FLUSH = p.run('GameDisplayArtifacts.TELEMETRY_FLUSH_MS'), BACKOFF = p.run('GameDisplayArtifacts.TELEMETRY_BACKOFF_MS');
    check('boot, signed in (Global Privacy Control on): one POST /achievements beside /t', calls.length === 1 &&
        calls[0].url === 'https://ttdat.yuwakisa.com/achievements' && calls[0].init.method === 'POST' && calls[0].init.keepalive === true &&
        calls[0].init.credentials === 'omit' && JSON.stringify(calls[0].body) === JSON.stringify({ token: TOKEN }));
    check('loading until it answers', p.ach('status()') === 'loading' && p.ach('totals()') === null);

    const heard = [];
    p.run('GameAchievements.listen')(list => { heard.push(...list); p.ui.achievementsChanged(list); });
    p.run(`GameAchievements.counted(${JSON.stringify(counts(p, {}))}, ${JSON.stringify(counts(p, { placed: 3 }))})`);
    p.run(`GameAchievements.counted(${JSON.stringify(counts(p, {}))}, ${JSON.stringify(counts(p, { placed: 1, trapped: 100 }))})`);
    check('increments before the answer: queued, summed, nothing announced', heard.length === 0 && bannerLines(p).length === 0 &&
        JSON.stringify(p.ach('pending()').early) === JSON.stringify({ placed: 4, trapped: 100 }));

    calls[0].reply(200, { totals: { placed: 8, trapped: 100, rungsReached: 1 } });
    await flushPromises();
    check('the totals come: the queued ones announced against them in COUNTERS order (trapped 100 + 100 crosses 200, placed 8 + 4 crosses 10, rungsReached 1 + 2 crosses 2, then 4 none)',
        JSON.stringify(heard.map(a => [a.counter, a.amount])) === JSON.stringify([['trapped', 200], ['placed', 10], ['rungsReached', 2]]));
    check('totals: fetched plus queued', JSON.stringify(p.ach('totals()')) === JSON.stringify({ placed: 12, trapped: 200, rungsReached: 4 }));
    check('the banner shows them', bannerLines(p).length === 3);
    check('nothing sent yet', calls.length === 1 && JSON.stringify(p.ach('pending()').unsent) === JSON.stringify({ trapped: 100, placed: 4, rungsReached: 3 }));

    p.advance(FLUSH + 100);
    await flushPromises();
    check('after TELEMETRY_FLUSH_MS: {token, add} with the sum, rungsReached included', calls.length === 2 &&
        JSON.stringify(calls[1].body) === JSON.stringify({ token: TOKEN, add: { trapped: 100, placed: 4, rungsReached: 3 } }) && calls[1].init.keepalive === true);
    calls[1].reply(200, { totals: {} });
    p.advance(FLUSH + 100);
    check('nothing unsent: nothing sent', calls.length === 2);

    p.ui.discardSlot(0);   // its tick may count more than the discard (a random board)
    p.settle();
    (p.windowListeners.pagehide || []).forEach(fn => fn({}));
    check('pagehide sends what is unsent', calls.length === 3 && calls[2].body.add.discards === 1);

    // A 429: the queue is dropped and nothing counted while backing off.
    p.run('globalThis.__now = Date.now(); Date.now = () => globalThis.__now');
    p.run(`GameAchievements.counted(${JSON.stringify(counts(p, {}))}, ${JSON.stringify(counts(p, { bombs: 2 }))})`);
    p.advance(FLUSH + 100);
    calls[3].reply(429, null);
    await flushPromises();
    p.run(`GameAchievements.counted(${JSON.stringify(counts(p, {}))}, ${JSON.stringify(counts(p, { bombs: 5 }))})`);
    check('after a 429: nothing queued, nothing counted', p.ach('totals()').bombs === 2 && JSON.stringify(p.ach('pending()').unsent) === '{}');
    p.advance(FLUSH * 3);
    check('and nothing sent while backing off', calls.length === 4);
    p.run(`globalThis.__now += ${BACKOFF + 1}`);
    p.run(`GameAchievements.counted(${JSON.stringify(counts(p, {}))}, ${JSON.stringify(counts(p, { bombs: 1 }))})`);
    check('after TELEMETRY_BACKOFF_MS it counts again', p.ach('totals()').bombs === 3 && JSON.stringify(p.ach('pending()').unsent) === '{"bombs":1}');

    // Sign-out: what's unsent goes, then nothing more.
    p.ui.signOut();
    check('sign-out sends what is unsent, then stops', calls.length === 5 && JSON.stringify(calls[4].body) === JSON.stringify({ token: TOKEN, add: { bombs: 1 } }) &&
        p.ach('status()') === 'off');

    // A 403 on the first fetch backs off too; the queue before it is dropped.
    const q = achGame({ origin: LIVE, storage: signedIn() });
    q.run(`GameAchievements.counted(${JSON.stringify(counts(q, {}))}, ${JSON.stringify(counts(q, { placed: 30 }))})`);
    q.fetcher.calls[0].reply(403, null);
    await flushPromises();
    q.advance(FLUSH * 3);
    await flushPromises();
    check('a 403 on the fetch: the queue dropped, no more requests', JSON.stringify(q.ach('pending()').early) === '{}' && q.fetcher.calls.length === 1 && q.ach('totals()') === null);

    // A failed fetch (a 503) is asked again at the next flush; what was queued waits for it.
    const r = achGame({ origin: LIVE, storage: signedIn() });
    r.run(`GameAchievements.counted(${JSON.stringify(counts(r, {}))}, ${JSON.stringify(counts(r, { placed: 10 }))})`);
    r.fetcher.calls[0].reply(503, null);
    await flushPromises();
    r.advance(FLUSH + 100);
    check('a 503: asked again after TELEMETRY_FLUSH_MS', r.fetcher.calls.length === 2 && JSON.stringify(r.fetcher.calls[1].body) === JSON.stringify({ token: TOKEN }));
    r.fetcher.calls[1].reply(200, { totals: {} });
    await flushPromises();
    check('the queue announced against the totals when they come', r.ach('totals()').placed === 10);
    done();
})();

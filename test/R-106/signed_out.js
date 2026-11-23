// R-106: with no achievements here nothing is counted (D-79): signed out on the live site, any
// portal (no sign-in offered, so a stored sign-in counts for nothing) and the dev page all have
// status 'off', totals null, no /achievements fetch, nothing in localStorage[ACHIEVEMENTS_KEY]
// and no banner, however much is played. Signing out mid-game turns it off the same way.
'use strict';
const { check, done } = require('../helpers/check');
const { achGame, counts, bannerLines, LIVE, PORTAL, signedIn, memoryStorage, flushPromises } = require('../helpers/achievements');

(async () => {
    for (const [where, opts] of [['the live site, signed out', { origin: LIVE }], ['a portal, a sign-in stored', { origin: PORTAL, storage: signedIn() }],
        ['the dev page (localhost)', { origin: 'http://localhost:8000' }]]) {
        const storage = opts.storage || memoryStorage();
        const p = achGame({ ...opts, storage });
        p.run(`GameAchievements.counted(${JSON.stringify(counts(p, {}))}, ${JSON.stringify(counts(p, { placed: 50, exGremlins: 500 }))})`);
        p.ui.discardSlot(0);
        p.settle();
        p.advance(60000);
        await flushPromises();
        check(`${where}: off, nothing counted`, p.ach('status()') === 'off' && p.ach('totals()') === null && p.ach('active()').length === 0);
        check(`${where}: no fetch, nothing stored, no banner`, p.fetcher.calls.length === 0 && !storage.map.has('thingfactory.totals') && bannerLines(p).length === 0);
    }

    const p = achGame({ origin: LIVE, storage: signedIn() });
    await flushPromises();
    p.fetcher.calls[0].reply(200, { totals: {} });
    await flushPromises();
    check('signed in: on', p.ach('status()') === 'on');
    p.ui.signOut();
    await flushPromises();
    const calls = p.fetcher.calls.length;
    p.run(`GameAchievements.counted(${JSON.stringify(counts(p, {}))}, ${JSON.stringify(counts(p, { placed: 50 }))})`);
    p.advance(60000);
    await flushPromises();
    check('signed out mid-game: off, nothing counted or sent', p.ach('status()') === 'off' && p.ach('totals()') === null && p.fetcher.calls.length === calls && bannerLines(p).length === 0);
    done();
})();

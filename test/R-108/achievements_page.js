// R-108: the Goals view's second page, Achievements (D-79), lists only the active achievements
// (a total above 0), nearest its next rung first, by (total − reached) / (next − reached) with
// reached 0 below the first rung, ties in COUNTERS order; each row its label (first letter up),
// total, "Reached n" or "No mark yet", "Next n" and a bar of that share. A row whose rung changed
// since the page was last drawn flashes once; the page redraws while open as totals change.
// Without achievements: signed out where sign-in is offered, a line that they're kept while
// signed in and the Sign in button (which closes the view and starts the bar's sign-in); where it
// isn't (a portal), a line that they need the game's own site; while the server's are on their
// way, a line saying so.
'use strict';
const { check, done } = require('../helpers/check');
const { achGame, counts, el, shown, LIVE, PORTAL, signedIn, memoryStorage, flushPromises } = require('../helpers/achievements');

(async () => {
    // exGremlins 400: reached 200, next 500 → 2/3; cratesDelivered 15: 10 → 20 and springThrows 150: 100 → 200, 1/2 each
    // (a tie: table order); discards 3: no mark, next 10 → 3/10; trapped 100: reached 100, next 200 → 0;
    // placed 0: not active.
    const stored = { cratesDelivered: 15, exGremlins: 400, trapped: 100, springThrows: 150, discards: 3 };
    const p = achGame({ storage: memoryStorage({ 'thingfactory.totals': JSON.stringify({ ...stored, placed: 0 }) }) });
    const rows = () => el(p, 'achievements-view').children;
    const text = r => r.children.slice(0, 3).map(c => c.textContent);
    p.els['goals-side-expand'].fire('click');
    p.key('ArrowRight');
    check('→ shows Achievements, page 2 of 2', p.ui.overlay === 'goals' && shown(p, 'goals-page-1') && p.els['goals-count'].textContent === '2 / 2');
    check('active only, nearest the next mark first, a tie in table order',
        JSON.stringify(rows().map(r => r.children[0].textContent)) === JSON.stringify(['Ex-gremlins', 'Crates delivered', 'Spring throws', 'Cards discarded', 'Gremlins trapped']));
    check('a row: label, total, "Reached n · Next n"', JSON.stringify(text(rows()[0])) === JSON.stringify(['Ex-gremlins', '400', 'Reached 200 · Next 500']));
    check('below the first mark: "No mark yet · Next n"', JSON.stringify(text(rows()[3])) === JSON.stringify(['Cards discarded', '3', 'No mark yet · Next 10']));
    const bar = r => r.children[3].children[0].style.width;
    check('each bar its share from the last mark to the next', bar(rows()[0]) === (2 / 3 * 100) + '%' && bar(rows()[1]) === '50%' && bar(rows()[3]) === '30%' && bar(rows()[4]) === '0%');
    check('the first drawing flashes nothing', rows().every(r => !r.classList.set.has('flash')));
    check('no note, no Sign in button', !shown(p, 'achievements-note') && !shown(p, 'achievements-signin'));

    p.run(`GameAchievements.counted(${JSON.stringify(counts(p, {}))}, ${JSON.stringify(counts(p, { exGremlins: 100, discards: 1 }))})`);
    const flashed = rows().filter(r => r.classList.set.has('flash')).map(r => r.children[0].textContent);
    check('open, it redraws as totals change: exGremlins reached 500 and the new rungsReached 1 flash, the rest (discards 4, still no mark) don\'t',
        JSON.stringify(flashed.sort()) === JSON.stringify(['Achievements reached', 'Ex-gremlins']) && rows().some(r => text(r)[0] === 'Cards discarded' && text(r)[1] === '4'));
    check('rungsReached (now 1) shows as an active row', rows().some(r => text(r)[0] === 'Achievements reached'));
    p.key('q');
    p.run(`GameAchievements.counted(${JSON.stringify(counts(p, {}))}, ${JSON.stringify(counts(p, { trapped: 100 }))})`);
    p.els['goals-side-expand'].fire('click');
    p.key('ArrowRight');
    const again = rows().filter(r => r.classList.set.has('flash')).map(r => r.children[0].textContent);
    check('changed while closed: flashes when next drawn (trapped 200; rungsReached 2)', again.includes('Gremlins trapped') && !again.includes('Ex-gremlins'));
    p.key('q');

    const none = achGame();
    none.els['goals-side-expand'].fire('click');
    none.key('ArrowRight');
    check('nothing counted yet: no rows, a line says so', el(none, 'achievements-view').children.length === 0 && shown(none, 'achievements-note') &&
        el(none, 'achievements-note').textContent.length > 0 && !shown(none, 'achievements-signin'));

    const out = achGame({ origin: LIVE });
    out.els['goals-side-expand'].fire('click');
    out.key('ArrowRight');
    check('signed out on the live site: kept while signed in, with Sign in', /signed in/.test(el(out, 'achievements-note').textContent) &&
        shown(out, 'achievements-note') && shown(out, 'achievements-signin'));
    el(out, 'achievements-signin').fire('click');
    check('its Sign in closes the view and runs the bar\'s sign-in (the game saved for the redirect)', out.ui.overlay === null &&
        out.storage.log.some(([op, k]) => op === 'set' && k === 'thingfactory.run'));

    const portal = achGame({ origin: PORTAL });
    portal.els['goals-side-expand'].fire('click');
    portal.key('ArrowRight');
    check("a portal: they need the game's own site, no Sign in", /own site/.test(el(portal, 'achievements-note').textContent) && !shown(portal, 'achievements-signin'));

    const wait = achGame({ origin: LIVE, storage: signedIn() });
    wait.els['goals-side-expand'].fire('click');
    wait.key('ArrowRight');
    check('signed in, the totals on their way: a line says so, no rows', /Fetching/.test(el(wait, 'achievements-note').textContent) && el(wait, 'achievements-view').children.length === 0);
    wait.fetcher.calls[0].reply(200, { totals: { bombs: 2 } });
    await flushPromises();
    check('they come: drawn at once, no note', el(wait, 'achievements-view').children.length === 1 && !shown(wait, 'achievements-note'));
    done();
})();

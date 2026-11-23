// R-103: each rung a lifetime total crosses is announced (D-79): one line per rung, in COUNTERS
// order and rising within a counter, a MESSAGES.rungReached wording at Math.random's pick with
// {amount} (the rung) and {label} filled; every rung adds 1 to rungsReached, which can cross
// rungs of its own, looping until a pass crosses none. The lines go to a banner that doesn't stop
// play, under the goal banner: at most RUNG_BANNER_LINES at once, the rest waiting, each up for
// MILESTONE_MS; rungs a command reaches show when its animation ends.
'use strict';
const { check, done } = require('../helpers/check');
const { achGame, counts, shown, bannerLines, memoryStorage } = require('../helpers/achievements');

const p = achGame({ storage: memoryStorage({ 'thingfactory.totals': JSON.stringify({ discards: 9 }) }) });
const words = p.run('GameDisplayArtifacts.MESSAGES.rungReached');
const MAX = p.run('GameDisplayArtifacts.RUNG_BANNER_LINES'), MS = p.run('GameDisplayArtifacts.MILESTONE_MS');
const fill = (w, amount, label) => w.replace('{amount}', amount).replace('{label}', label);
check('MESSAGES.rungReached: 3 distinct whole sentences with {amount} and {label}', words.length === 3 && new Set(words).size === 3 &&
    words.every(w => w.includes('{amount}') && w.includes('{label}') && /^[A-Z{]/.test(w) && /[.!]$/.test(w)));
check('RUNG_BANNER_LINES is a whole number ≥ 1', Number.isInteger(MAX) && MAX >= 1);
check('no banner lines before', bannerLines(p).length === 0);

p.run('Math.random = () => 0.5');
const heard = [];
p.run('GameAchievements.listen')(list => { heard.push(...list); p.ui.achievementsChanged(list); });
p.run(`GameAchievements.counted(${JSON.stringify(counts(p, {}))}, ${JSON.stringify(counts(p, { placed: 10 }))})`);
check('placed 0 → 10: its rung 10, then rungsReached 1 and 2 (3 → no rung)',
    JSON.stringify(heard.map(a => [a.counter, a.amount])) === JSON.stringify([['placed', 10], ['rungsReached', 1], ['rungsReached', 2]]));
check('rungsReached totals 3', p.ach('totals()').rungsReached === 3);
check('each line the wording Math.random picked, filled', heard[0].line === fill(words[1], 10, 'Things placed') && heard[1].line === fill(words[1], 1, 'achievements reached'));
check(`the banner shows ${MAX} lines at once, the rest wait`, shown(p, 'rung-banner') && bannerLines(p).length === Math.min(MAX, 3) && p.ui.rungWaiting.length === 3 - Math.min(MAX, 3));
check('play goes on: no overlay', p.ui.overlay === null);

heard.length = 0;
p.run('Math.random = () => 0');
p.run(`GameAchievements.counted(${JSON.stringify(counts(p, {}))}, ${JSON.stringify(counts(p, { exGremlins: 500, trapped: 100 }))})`);
check('two counters in one command: COUNTERS order, rising, then rungsReached 3 → 7 crosses 5, and 8 crosses none',
    JSON.stringify(heard.map(a => [a.counter, a.amount])) === JSON.stringify([['exGremlins', 100], ['exGremlins', 200], ['exGremlins', 500], ['trapped', 100], ['rungsReached', 5]]));
check('rungsReached totals 8', p.ach('totals()').rungsReached === 8);
check('Math.random 0 picks the first wording', heard[0].line === fill(words[0], 100, 'ex-gremlins'));
check('the banner still at most RUNG_BANNER_LINES, the rest waiting', bannerLines(p).length === MAX && p.ui.rungWaiting.length === 8 - MAX);
const first = bannerLines(p);
p.advance(MS + 50);
check('after MILESTONE_MS the first lines give way to the waiting ones', bannerLines(p).length === MAX && bannerLines(p)[0] !== first[0]);
p.advance(MS * 4);
check('all shown in turn, then it hides', !shown(p, 'rung-banner') && p.ui.rungWaiting.length === 0 && bannerLines(p).length === 0);

// A command whose count crosses a rung: the banner waits for the animation's end.
p.ui.discardSlot(0);
check('mid-animation: no banner yet', p.ui.anim && !shown(p, 'rung-banner') && p.ach('totals()').discards === 10);
p.settle();
check('the animation over: discards 10 on the banner (rungsReached 9 crosses none)', shown(p, 'rung-banner') && bannerLines(p).length === 1 &&
    bannerLines(p)[0].includes('10 cards discarded') && p.ach('totals()').rungsReached === 9);
done();

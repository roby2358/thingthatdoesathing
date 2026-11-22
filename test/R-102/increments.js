// R-102: achievements count a command's increments (D-79): GameUI hands GameAchievements each
// accepted command's engine.counters() before and after, and the increments are the counters
// that rose, by how much (one that fell or stayed adds nothing). A refused command hands nothing;
// a new game starts its counters at 0, so nothing is counted twice or taken away. Counting never
// touches Rando. (A file:// copy, where the totals are known at once.)
'use strict';
const { check, done } = require('../helpers/check');
const { achGame, counts } = require('../helpers/achievements');

const p = achGame();
check('a file:// copy has achievements, totals known', p.ach('status()') === 'on' && JSON.stringify(p.ach('totals()')) === '{}');
const rng = p.run('JSON.stringify(Rando.state())');
p.run(`GameAchievements.counted(${JSON.stringify(counts(p, { placed: 2, discards: 1, cratesDelivered: 5, slides: 4 }))},
    ${JSON.stringify(counts(p, { placed: 5, discards: 1, cratesDelivered: 3, slides: 7 }))})`);
const t = p.ach('totals()');
check('only the counters that rose, by their difference', t.placed === 3 && t.slides === 3 && !('discards' in t) && !('cratesDelivered' in t));
check('Rando untouched', p.run('JSON.stringify(Rando.state())') === rng);

p.ui.discardSlot(0);
p.settle();
check('a discard through the UI adds 1 to discards', p.ach('totals()').discards === 1 && p.engine.counters().discards === 1);
p.ui.discardSlot(1);
p.settle();
check('another: 2, the engine\'s count too', p.ach('totals()').discards === 2 && p.engine.counters().discards === 2);
const before = JSON.stringify(p.ach('totals()'));
p.run('globalThis.__handed = 0; const __counted = GameAchievements.counted; GameAchievements.counted = (a, b) => { __handed++; __counted(a, b); }');
p.ui.commit(() => ({ ok: false }), () => {}, { command: 'place', args: {} });
check('a refused command hands nothing over', p.run('__handed') === 0 && JSON.stringify(p.ach('totals()')) === before);
p.ui.primaryAction();
p.settle();
check('an accepted one (a Wait) hands its counters over', p.run('__handed') === 1);

p.ui.startGame('small');
p.ui.dismissOverlay();
check('a new game (counters back at 0) takes nothing away', JSON.stringify(p.ach('totals()')) === before);
p.ui.discardSlot(0);
p.settle();
check('and its first discard adds 1 on top', p.ach('totals()').discards === 3);
done();

// R-86: a goal counts from its set's base (D-75): its count is counters()[counter] −
// base[counter], so what was counted before the set was dealt doesn't count toward it.
// goalStates() gives [{counter, label, count, amount, met}] in the set's order, the label the
// counter's, the count rising past the amount after it's met. A query: nothing changes.
'use strict';
const { check, done } = require('../helpers/check');
const { flatGame } = require('../helpers/load');

const { g, state, engine } = flatGame();
const { COUNTERS } = g.GameArtifacts;
state.counts.placed = 7; state.counts.moved = 2; state.trapped = 4;
state.goals = { set: 0, base: engine.counters(), list: [
    { counter: 'placed', amount: 10, met: false },
    { counter: 'moved', amount: 2, met: false },
    { counter: 'trapped', amount: 5, met: false },
] };
const gs = engine.goalStates();
check('goalStates: one per goal, in order, with the counter\'s label', gs.length === 3 &&
    gs.map(x => x.counter).join() === 'placed,moved,trapped' &&
    gs.every(x => x.label === COUNTERS.find(c => c.key === x.counter).label));
check('counts start at 0 from the base, not the game\'s totals', gs.every(x => x.count === 0 && x.met === false));
check('amount carried', gs[0].amount === 10 && gs[1].amount === 2 && gs[2].amount === 5);
state.counts.placed = 12; state.counts.moved = 3; state.trapped = 6;
const gs2 = engine.goalStates();
check('a count is the counter now minus the base', gs2[0].count === 5 && gs2[1].count === 1 && gs2[2].count === 2);
const save = JSON.stringify(engine.save());
engine.goalStates();
check('goalStates changes nothing', JSON.stringify(engine.save()) === save);
state.counts.moved = 5;
engine.wait();
const gs3 = engine.goalStates();
check('met, the count keeps rising past the amount', gs3[1].met === true && gs3[1].count === 3 && gs3[1].amount === 2);
check('a goal on a derived counter (pushesPulls) counts from its base too', (() => {
    state.counts.pushes = 3; state.counts.pulls = 4;
    state.goals = { set: 1, base: engine.counters(), list: [{ counter: 'pushesPulls', amount: 10, met: false }, { counter: 'cannonLobs', amount: 1, met: false }, { counter: 'slides', amount: 10, met: false }] };
    state.counts.pulls = 6;
    return engine.goalStates()[0].count === 2;
})());
done();

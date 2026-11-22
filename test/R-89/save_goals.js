// R-89: the goals through a save (D-75, D-67). save() carries goals {set, base, list};
// restore brings them back (goalStates equal, nothing shared with the data) and both copies check
// goals alike. A save without goals, or with a bad set, a base not holding exactly the perGame
// counters as whole numbers ≥ 0, a list not of GOALS_PER_GAME, an unknown or non-goal counter, an
// amount not a whole number > 0, or met not a boolean → ok:false, nothing changed.
'use strict';
const { check, done } = require('../helpers/check');
const { newGame, SEEDS } = require('../helpers/load');

const full = e => JSON.stringify(e.save());
{
    const a = newGame(SEEDS[8], 'small');
    for (let i = 0; i < 5; i++) a.engine.discard(0);
    a.engine.newGoals();
    a.state.goals.list[1].met = true;
    const text = JSON.stringify(a.engine.save());
    check('the save carries goals', JSON.parse(text).goals.set === 1 && JSON.parse(text).goals.list[1].met === true);
    const b = newGame(SEEDS[9], 'medium');
    const res = b.engine.restore(JSON.parse(text));
    check('restored: goals and goalStates match', res.ok && JSON.stringify(b.state.goals) === JSON.stringify(a.state.goals) &&
        JSON.stringify(b.engine.goalStates()) === JSON.stringify(a.engine.goalStates()));
    check('nothing shared with the saved data', (() => { const d = JSON.parse(text); b.engine.restore(d); d.goals.list[0].amount = 999; d.goals.base.placed = 50; return b.state.goals.list[0].amount !== 999 && b.state.goals.base.placed === 0; })());
    for (let i = 0; i < 40; i++) { a.engine.discard(i % 3); b.engine.discard(i % 3); }
    check('both copies play on alike, goals included', full(a.engine) === full(b.engine));
}
{
    const a = newGame(SEEDS[10], 'small');
    a.engine.discard(0);
    const good = a.engine.save();
    const before = full(a.engine);
    const { goals } = good;
    const without = { ...good }; delete without.goals;
    const baseMissing = { ...goals.base }; delete baseMissing.placed;
    const withList = list => ({ ...good, goals: { ...goals, list } });
    const withGoal = (k, v) => withList(goals.list.map((x, i) => i === 0 ? { ...x, [k]: v } : x));
    const bad = {
        'no goals': without,
        'goals null': { ...good, goals: null },
        'set negative': { ...good, goals: { ...goals, set: -1 } },
        'set fractional': { ...good, goals: { ...goals, set: 0.5 } },
        'base missing a counter': { ...good, goals: { ...goals, base: baseMissing } },
        'base with an extra key': { ...good, goals: { ...goals, base: { ...goals.base, laughs: 0 } } },
        'base negative': { ...good, goals: { ...goals, base: { ...goals.base, placed: -1 } } },
        'list too short': withList(goals.list.slice(0, 2)),
        'list too long': withList([...goals.list, goals.list[0]]),
        'an unknown counter': withGoal('counter', 'laughs'),
        'a non-goal counter': withGoal('counter', 'discards'),
        'amount fractional': withGoal('amount', 2.5),
        'amount 0': withGoal('amount', 0),
        'met as text': withGoal('met', 'true'),
    };
    for (const [why, data] of Object.entries(bad)) {
        const res = a.engine.restore(data);
        check(why + ': refused, nothing changed', res.ok === false && full(a.engine) === before);
    }
}
done();

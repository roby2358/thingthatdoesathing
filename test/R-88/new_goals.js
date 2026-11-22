// R-88: newGoals() (D-75): no tick, never touches Rando or the world; deals set + 1
// (set k's side stream) with base = counters() now, so every goal of the new set counts from 0,
// mid-game or after a done set; returns {ok: true, events: [{type: 'goals', set}]}.
'use strict';
const { check, done } = require('../helpers/check');
const { newGame, SEEDS } = require('../helpers/load');

const world = e => { const d = e.save(); delete d.goals; return JSON.stringify(d); };
{
    const { g, state, engine } = newGame(SEEDS[6], 'medium');
    for (let i = 0; i < 30; i++) engine.discard(i % 3);
    const before = world(engine), rng = g.Rando.state(), turn = state.turn;
    const res = engine.newGoals();
    check('ok, one goals event naming set 1', res.ok === true && JSON.stringify(res.events) === JSON.stringify([{ type: 'goals', set: 1 }]));
    check('set 1, base = counters() now', state.goals.set === 1 && JSON.stringify(state.goals.base) === JSON.stringify(engine.counters()) && state.goals.base.discards === 30);
    check('every goal counts from 0, unmet', engine.goalStates().every(x => x.count === 0 && x.met === false) && state.goals.list.length === 3);
    check('no tick: the world, the turn and Rando are untouched', world(engine) === before && state.turn === turn && g.Rando.state() === rng);
    const other = newGame(SEEDS[6], 'medium');
    other.engine.newGoals();
    check('set 1 is the same goals whenever it is dealt', JSON.stringify(other.state.goals.list) === JSON.stringify(state.goals.list));
}
{
    const { state, engine } = newGame(SEEDS[7], 'small');
    state.goals.list.forEach(x => { x.met = true; });
    engine.newGoals(); engine.newGoals();
    check('after a done set: set 2, all unmet, counting from 0', state.goals.set === 2 && state.goals.list.every(x => !x.met) &&
        engine.goalStates().every(x => x.count === 0));
}
done();

// R-87: the goal check (D-75), after every tick, after milestones: each unmet goal whose
// count reached its amount becomes met for good, emits goal{index, counter, amount} and adds 1 to
// goalsMet; when that met the set's last goal, goalsDone{set} follows. Several in one tick, in
// the set's order, at the end of the tick's events. A met goal stays met and isn't announced
// again. A refused command or a rotate checks nothing.
'use strict';
const { check, done } = require('../helpers/check');
const { flatGame, DIR } = require('../helpers/load');

{
    const { state, engine, put } = flatGame();
    state.goals = { set: 2, base: engine.counters(), list: [
        { counter: 'moved', amount: 2, met: false },
        { counter: 'cannonLobs', amount: 1, met: false },
        { counter: 'rocketFlights', amount: 1, met: false },
    ] };
    const goalEvents = res => res.events.filter(e => e.type === 'goal' || e.type === 'goalsDone');
    state.counts.moved = 1;
    check('short of the amount: no goal event', goalEvents(engine.wait()).length === 0 && !state.goals.list[0].met);
    state.counts.moved = 2;
    const r1 = engine.wait();
    check('reached: one goal event, met, goalsMet 1', JSON.stringify(goalEvents(r1)) === JSON.stringify([{ type: 'goal', index: 0, counter: 'moved', amount: 2 }]) &&
        state.goals.list[0].met && engine.counters().goalsMet === 1);
    state.counts.moved = 9;
    check('a met goal is not announced again', goalEvents(engine.wait()).length === 0 && engine.counters().goalsMet === 1);
    state.counts.cannonLobs = 1; state.counts.rocketFlights = 1;
    put('BELT', 3, 4, DIR.E);
    check('a rotate checks nothing', engine.rotate(3, 4).ok && !state.goals.list[1].met);
    check('a refused command checks nothing', engine.discard(7).ok === false && engine.remove(1, 1).ok === false && !state.goals.list[1].met);
    const r2 = engine.wait();
    const ge = goalEvents(r2);
    check('two in one tick, in order, then goalsDone{set}', JSON.stringify(ge) === JSON.stringify([
        { type: 'goal', index: 1, counter: 'cannonLobs', amount: 1 },
        { type: 'goal', index: 2, counter: 'rocketFlights', amount: 1 },
        { type: 'goalsDone', set: 2 }]));
    check('they end the tick\'s events', JSON.stringify(r2.events.slice(-3)) === JSON.stringify(ge));
    check('all met, goalsMet 3', state.goals.list.every(x => x.met) && engine.counters().goalsMet === 3);
    state.counts.moved = 0;
    check('met stays met even if the count fell', goalEvents(engine.wait()).length === 0 && state.goals.list[0].met);
}
{
    // A delivery that reaches a milestone and a goal in one tick: the goal comes after the milestone's events.
    const { state, engine, put, piece } = flatGame();
    state.delivered = 9;
    state.goals = { set: 0, base: engine.counters(), list: [
        { counter: 'cratesDelivered', amount: 1, met: false },
        { counter: 'cannonLobs', amount: 1, met: false },
        { counter: 'moved', amount: 1, met: false },
    ] };
    put('BELT', 9, 8, DIR.E);
    piece('crate', 9, 8);
    const res = engine.wait();
    const types = res.events.map(e => e.type);
    check('milestone, then goal, last', types.includes('milestone') && types.indexOf('goal') > types.lastIndexOf('milestone') &&
        types[types.length - 1] === 'goal' && !types.includes('goalsDone'));
}
{
    // A goal met by the command's own counting (place) is checked after its tick.
    const { state, engine } = flatGame();
    state.goals = { set: 0, base: engine.counters(), list: [
        { counter: 'placed', amount: 1, met: false },
        { counter: 'cannonLobs', amount: 1, met: false },
        { counter: 'moved', amount: 1, met: false },
    ] };
    state.hand[0] = { kind: 'BELT' };
    const res = engine.place(0, 3, 4, DIR.E, 'white');
    check('a place meets a placed goal in its own tick', res.ok && res.events.some(e => e.type === 'goal' && e.counter === 'placed') && state.goals.list[0].met);
}
done();

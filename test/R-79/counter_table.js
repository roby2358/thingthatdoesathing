// R-79: the counter table (D-74). GameArtifacts.COUNTERS holds one row per counter, in its
// set order, each {key, label, scale, goal, negative, perGame}; negative rows are never goals;
// only rungsReached is lifetime only. GameEngine.counters() gives every perGame row's count:
// cratesDelivered, exGremlins and trapped read from their state fields, milestones and
// pushesPulls derived, the rest from state.counts, which holds only those (STORED_COUNTERS),
// all 0 in a new game; counters() is a query (Rando untouched).
'use strict';
const { check, done } = require('../helpers/check');
const { flatGame, newGame, SEEDS } = require('../helpers/load');

const ORDER = ['cratesDelivered', 'bigDelivered', 'exGremlins', 'trapped', 'placed', 'springThrows', 'rocketFlights',
    'cannonLobs', 'moved', 'bombs', 'slides', 'mountainsFlown', 'pushes', 'pulls', 'pushesPulls', 'milestones',
    'goalsMet', 'rungsReached', 'cratesSunk', 'cratesSmashed', 'cratesLostOther', 'discards'];
const READ = ['cratesDelivered', 'exGremlins', 'trapped', 'pushesPulls', 'milestones'];
{
    const { g } = flatGame();
    const { COUNTERS, STORED_COUNTERS, COUNTER_READS } = g.GameArtifacts;
    check('one row per counter, in the set order', JSON.stringify(COUNTERS.map(c => c.key)) === JSON.stringify(ORDER));
    check('every row has a label, a scale of 1, 10, 100 or 1000, and boolean goal, negative and perGame',
        COUNTERS.every(c => typeof c.label === 'string' && c.label && [1, 10, 100, 1000].includes(c.scale) &&
            [c.goal, c.negative, c.perGame].every(b => typeof b === 'boolean')));
    const row = k => COUNTERS.find(c => c.key === k);
    check('labels read after a number', row('cratesDelivered').label === 'crates delivered' && row('slides').label === 'hexes slid' &&
        row('cratesSmashed').label === 'crates smashed by gremlins' && row('discards').label === 'cards discarded');
    check('a negative counter is never a goal; the four negatives are the losses and discards',
        COUNTERS.every(c => !(c.negative && c.goal)) &&
        COUNTERS.filter(c => c.negative).map(c => c.key).join() === 'cratesSunk,cratesSmashed,cratesLostOther,discards');
    check('bombs, milestones, goalsMet and rungsReached are not goals; every other non-negative row is',
        COUNTERS.filter(c => !c.goal && !c.negative).map(c => c.key).join() === 'bombs,milestones,goalsMet,rungsReached');
    check('only rungsReached is lifetime only', COUNTERS.filter(c => !c.perGame).map(c => c.key).join() === 'rungsReached');
    check('first-guess scales: crates delivered 10, big 1, discards 10',
        row('cratesDelivered').scale === 10 && row('bigDelivered').scale === 1 && row('discards').scale === 10);
    // The designer's scales (D-74). exGremlins: ex'd en masse (Bombs, Rocket flights, slide-bump
    // splats); trapped: piles up at the same pace. The other five from the first telemetry
    // (2026-11-23): goals on 10 and 1 were trivial for them.
    const LADDERS = { 100: '100,200,500,1000', 10: '10,20,50,100' };
    const DESIGNED = { exGremlins: 100, trapped: 100, springThrows: 100, slides: 100, mountainsFlown: 100, cannonLobs: 10, rocketFlights: 10 };
    for (const [key, scale] of Object.entries(DESIGNED))
        check(key + ' has scale ' + scale + '; its ladder ' + LADDERS[scale],
            row(key).scale === scale && [0, 1, 2, 3].map(i => g.GameArtifacts.rung(scale, i)).join() === LADDERS[scale]);
    check('read counters are exactly the state-field and derived ones', Object.keys(COUNTER_READS).sort().join() === [...READ].sort().join());
    check('stored counters are every other perGame row', JSON.stringify(STORED_COUNTERS) ===
        JSON.stringify(ORDER.filter(k => k !== 'rungsReached' && !READ.includes(k))));
}
{
    const { g, state, engine } = newGame(SEEDS[0], 'small');
    const { STORED_COUNTERS } = g.GameArtifacts;
    const keys = Object.keys(engine.counters());
    check('counters() has every perGame row, in order, and no rungsReached',
        JSON.stringify(keys) === JSON.stringify(ORDER.filter(k => k !== 'rungsReached')));
    check('a new game: state.counts holds only the stored counters, each 0',
        JSON.stringify(Object.keys(state.counts)) === JSON.stringify(STORED_COUNTERS) && Object.values(state.counts).every(n => n === 0));
    check('a new game: every counter 0', Object.values(engine.counters()).every(n => n === 0));
    const fresh = new g.GameState();
    check('a bare GameState starts with every stored counter at 0',
        JSON.stringify(fresh.counts) === JSON.stringify(state.counts));
}
{
    const { g, state, engine } = flatGame();
    state.delivered = 57; state.exGremlins = 4; state.trapped = 3;
    state.counts.pushes = 6; state.counts.pulls = 5; state.counts.slides = 9;
    g.Rando.seed(5);
    const c = engine.counters();
    const next = g.Rando.random(); g.Rando.seed(5);
    check('cratesDelivered, exGremlins and trapped are read from their state fields',
        c.cratesDelivered === 57 && c.exGremlins === 4 && c.trapped === 3);
    check('milestones = milestonesReached(delivered) (57: 10, 20, 50 → 3)', c.milestones === 3 && c.milestones === g.GameArtifacts.milestonesReached(57));
    check('pushesPulls = pushes + pulls, not stored', c.pushesPulls === 11 && !('pushesPulls' in state.counts));
    check('the rest come from state.counts', c.slides === 9 && c.pushes === 6 && c.pulls === 5);
    check('counters() leaves Rando alone', next === g.Rando.random());
    const again = new Set(Object.keys(state.counts));
    check('no counter is stored twice: none of the read ones is in state.counts', !['cratesDelivered', 'exGremlins', 'trapped', 'milestones'].some(k => again.has(k)));
}
{
    const { state, engine } = newGame(SEEDS[1], 'small');
    for (let i = 0; i < 5; i++) engine.discard(0);
    engine.newGame(SEEDS[2], 'small');
    check('newGame resets every stored counter to 0', Object.values(state.counts).every(n => n === 0));
}
done();

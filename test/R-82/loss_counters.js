// R-82: every cargo loss is counted by its cause (D-74), its value (a big crate 10): open water
// in cratesSunk, a gremlin's wreck in cratesSmashed, anything else (blast, Bomb, a mid-air
// crash, a newly opened endpoint clearing it) in cratesLostOther; the three always sum to
// state.lost. A gremlin lost adds 0 to all three.
'use strict';
const { check, done } = require('../helpers/check');
const { flatGame, DIR } = require('../helpers/load');

const losses = engine => { const c = engine.counters(); return [c.cratesSunk, c.cratesSmashed, c.cratesLostOther]; };
const sums = (engine, state) => losses(engine).reduce((a, b) => a + b, 0) === state.lost;
{
    const { state, engine, put, piece, terrain, T } = flatGame();
    put('BELT', 2, 4, DIR.E); terrain(3, 4, T.WATER);
    piece('bigcrate', 2, 4);
    engine.wait();
    check('a big crate pushed into water: cratesSunk 10', losses(engine).join() === '10,0,0' && sums(engine, state));
    put('BRIDGE', 5, 6, DIR.E); terrain(5, 6, T.WATER); put('WALL', 6, 6);
    piece('crate', 5, 6);
    engine.remove(5, 6);
    check('a crate left on open water by removing its Bridge: cratesSunk +1', losses(engine).join() === '11,0,0' && sums(engine, state));
    put('BELT', 7, 2, DIR.E); terrain(8, 2, T.WATER); piece('gremlin', 7, 2);
    engine.wait();
    check('a gremlin sunk adds nothing', losses(engine).join() === '11,0,0' && sums(engine, state));
}
{
    const { state, engine, put, piece } = flatGame();
    [[6, 3], [5, 3], [4, 4], [4, 5], [5, 5]].forEach(([q, r]) => put('WALL', q, r));
    piece('gremlin', 5, 4); piece('crate', 6, 4);
    engine.wait();
    check('a gremlin wrecking a crate: cratesSmashed 1', losses(engine).join() === '0,1,0' && sums(engine, state));
}
{
    const { state, engine, put, piece } = flatGame();
    put('SPRING', 2, 4, DIR.E); put('SPRING', 5, 4, DIR.W);
    piece('crate', 2, 4); piece('bigcrate', 5, 4);
    engine.wait();
    check('two flights crashing mid-air (1 + 10): cratesLostOther 11', losses(engine).join() === '0,0,11' && sums(engine, state));
}
{
    const { state, engine, piece } = flatGame();
    piece('crate', 3, 4);
    engine.blast(3, 4);
    check('a blasted crate: cratesLostOther 1', losses(engine).join() === '0,0,1' && sums(engine, state));
    piece('bigcrate', 5, 4);
    state.hand[0] = { kind: 'BOMB' };
    engine.bomb(0, [{ q: 5, r: 4 }]);
    check('a bombed big crate: cratesLostOther +10', losses(engine).join() === '0,0,11' && sums(engine, state));
    piece('crate', 7, 4);
    engine.clearHex(engine.board.get(7, 4), 0);
    check('a crate a newly opened endpoint clears: cratesLostOther +1', losses(engine).join() === '0,0,12' && sums(engine, state));
}
{
    // All causes in one game: still each in its own counter, summing to lost.
    const { state, engine, put, piece, terrain, T } = flatGame();
    put('BELT', 2, 2, DIR.E); terrain(3, 2, T.WATER); piece('crate', 2, 2);
    [[6, 3], [5, 3], [4, 4], [4, 5], [5, 5]].forEach(([q, r]) => put('WALL', q, r));
    piece('gremlin', 5, 4); piece('crate', 6, 4);
    piece('crate', 9, 6);
    engine.blast(9, 6);
    check('sunk, smashed and blasted in one tick: 1, 1, 1, summing to lost 3', losses(engine).join() === '1,1,1' && state.lost === 3 && sums(engine, state));
}
done();

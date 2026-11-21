// R-67: a Spring's throw (`overWalls`) treats a Wall hex exactly like a mountain (D-62): it
// passes over Walls, and can't come down on one, so it lands on the last hex short of it that
// it flew over (or doesn't throw); a Rocket (no `overWalls`) is still stopped by a Wall.
'use strict';
const { check, done } = require('../helpers/check');
const { flatGame, DIR } = require('../helpers/load');

// A Spring at (0,4) facing E with a crate on it, Walls on these hexes, then one tick.
function throwOver(walls, extra) {
    const ctx = flatGame();
    const { engine, put, piece } = ctx;
    put('SPRING', 0, 4, DIR.E);
    walls.forEach(q => put('WALL', q, 4));
    extra(ctx);
    const c = piece('crate', 0, 4);
    const res = engine.wait();
    return { ...ctx, c, moves: res.events.filter(e => e.type === 'move' && e.id === c.id) };
}
const nothing = () => {};

{
    const { c, state, moves } = throwOver([1], nothing);
    check('a Spring throws a crate over a Wall, landing on the third hex', c.isAt(3, 4) && state.pieces.includes(c));
    const end = moves[0] && moves[0].path[moves[0].path.length - 1];
    check('its move path ends on the landing hex', moves.length === 1 && end.q === 3 && end.r === 4);
}
{
    const { c } = throwOver([1, 2], nothing);
    check('a Spring throws over two Walls, landing on the third hex', c.isAt(3, 4));
}
{
    const { c } = throwOver([2], ({ terrain, T }) => terrain(1, 4, T.MOUNTAIN));
    check('over a mountain and then a Wall it lands on the third hex', c.isAt(3, 4));
}
{
    const { c } = throwOver([3], nothing);
    check('a Wall as the landing hex: it comes down on the hex before, as for a mountain', c.isAt(2, 4));
}
{
    const { c } = throwOver([2, 3], nothing);
    check('two Walls ending the throw: it comes down on the first hex', c.isAt(1, 4));
}
{
    const { c } = throwOver([3], ({ terrain, T }) => terrain(2, 4, T.MOUNTAIN));
    check('a mountain then a Wall ending the throw: it comes down on the first hex', c.isAt(1, 4));
}
{
    const { c, moves } = throwOver([1, 2, 3], nothing);
    check('three Walls: it doesn\'t throw (no move)', c.isAt(0, 4) && moves.length === 0);
}
{
    const { c, moves } = throwOver([3], ({ terrain, T }) => { terrain(1, 4, T.ICE); terrain(2, 4, T.ICE); });
    check('stepped back off a Wall onto ice, it skids on: the Wall stops the skid',
        c.isAt(2, 4) && moves.length === 1 && moves[0].path.map(h => h.q).join() === '1,2');
}
{
    const { c, state } = throwOver([1], ({ piece }) => piece('crate', 2, 4));
    check('stopped by a piece while over a Wall, it comes down short of the Wall', c.isAt(0, 4) && state.pieces.length === 2);
}
{
    const { state, engine, put, piece } = flatGame();
    put('ROCKET', 0, 4, DIR.E); put('WALL', 2, 4);
    const c = piece('crate', 0, 4);
    engine.wait();
    check('a Rocket is still stopped by a Wall', c.isAt(1, 4) && state.pieces.includes(c));
}
done();

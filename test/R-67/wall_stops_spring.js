// R-67: a Wall stops a Spring's throw the way it stops a Rocket's (D-73, superseding D-62):
// the flight ends on the hex before the Wall. Over a mountain then a Wall, it comes down short
// of the mountain (it can't land on one, R-53), or doesn't throw if there's no hex short of it;
// a landing on ice still skids, and the Wall stops the skid.
'use strict';
const { check, done } = require('../helpers/check');
const { flatGame, DIR } = require('../helpers/load');

// A `kind` thrower at (0,4) facing E with a crate on it, Walls on these hexes,
// then one tick.
function throwInto(kind, walls, extra) {
    const ctx = flatGame();
    const { engine, put, piece } = ctx;
    put(kind, 0, 4, DIR.E);
    walls.forEach(q => put('WALL', q, 4));
    extra(ctx);
    const c = piece('crate', 0, 4);
    const res = engine.wait();
    return { ...ctx, c, moves: res.events.filter(e => e.type === 'move' && e.id === c.id) };
}
const nothing = () => {};

{
    const { c, state, moves } = throwInto('SPRING', [2], nothing);
    check('a Wall 2 hexes out: the Spring\'s throw stops on the hex before it', c.isAt(1, 4) && state.pieces.includes(c));
    const end = moves[0] && moves[0].path[moves[0].path.length - 1];
    check('its move path ends on the hex before the Wall', moves.length === 1 && end.q === 1 && end.r === 4);
}
{
    const { c } = throwInto('SPRING', [3], nothing);
    check('a Wall on the landing hex: it comes down on the hex before', c.isAt(2, 4));
}
{
    const { c, moves } = throwInto('SPRING', [1], nothing);
    check('a Wall right in front: it doesn\'t throw (no move)', c.isAt(0, 4) && moves.length === 0);
}
{
    const { c } = throwInto('SPRING', [3], ({ terrain, T }) => terrain(2, 4, T.MOUNTAIN));
    check('over a mountain then a Wall: it comes down short of the mountain', c.isAt(1, 4));
}
{
    const { c, moves } = throwInto('SPRING', [2], ({ terrain, T }) => terrain(1, 4, T.MOUNTAIN));
    check('a mountain then a Wall with no hex short of the mountain: no throw (no move)', c.isAt(0, 4) && moves.length === 0);
}
{
    const { c, state } = throwInto('SPRING', [3], ({ terrain, T }) => terrain(2, 4, T.ICE));
    check('stopped by a Wall onto ice, it skids, and the Wall stops the skid', c.isAt(2, 4) && state.pieces.includes(c));
}
{
    const { c, state } = throwInto('ROCKET', [2], nothing);
    check('a Rocket likewise stops on the hex before a Wall', c.isAt(1, 4) && state.pieces.includes(c));
}
done();

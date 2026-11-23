// R-112: gremlins lunge (D-81). As the tick starts, before any claim, each gremlin in piece order
// with cargo on a neighboring hex draws one Rando.random(); under GREMLIN_LUNGE_CHANCE it jumps
// onto one of those crates (Rando.choice) at hop 1 and smashes it as a wreck does (lost += value,
// cratesSmashed, a splat by the gremlin, a one-hex move). Its motion is over: no Thing carries it,
// it doesn't wander or slide; a Trap or a target there kills it. No neighboring crate, no draw.
// Rando.random is stubbed to force or refuse the lunge; Rando.choice stays seeded unless noted.
'use strict';
const { check, done } = require('../helpers/check');
const { flatGame, DIR } = require('../helpers/load');

const RING = [[6, 4], [6, 3], [5, 3], [4, 4], [4, 5], [5, 5]];   // (5, 4)'s neighbors, E NE NW W SW SE
// A flat game whose Rando.random always returns `value`, counting its calls.
function game(value) {
    const ctx = flatGame();
    ctx.CHANCE = ctx.g.GameArtifacts.GREMLIN_LUNGE_CHANCE;
    ctx.draws = 0;
    ctx.g.Rando.random = () => { ctx.draws++; return value; };
    ctx.smashed = () => ctx.engine.counters().cratesSmashed;
    ctx.at = p => p.q + ',' + p.r;
    return ctx;
}
const moveOf = (events, id) => events.filter(e => e.type === 'move' && e.id === id);

check('GREMLIN_LUNGE_CHANCE is 0.16', flatGame().g.GameArtifacts.GREMLIN_LUNGE_CHANCE === 0.16);
{
    const { state, engine, piece, smashed, at } = game(0);
    const g = piece('gremlin', 5, 4), c = piece('crate', 6, 4);
    const { events } = engine.wait();
    const splat = events.find(e => e.type === 'splat' && e.id === c.id);
    const mv = moveOf(events, g.id);
    check('a gremlin beside a crate lunges: the crate is gone', !state.pieces.includes(c));
    check('… cratesSmashed +1, lost +1', smashed() === 1 && state.lost === 1);
    check('… the gremlin stands on the crate\'s hex', at(g) === '6,4' && state.pieces.includes(g));
    check('… a splat by the gremlin at hop 1', !!splat && splat.by === g.id && splat.hop === 1 && splat.trap === false);
    check('… one move of one hex at hop 1', mv.length === 1 && mv[0].hop === 1 && mv[0].path.length === 1 && at(mv[0].path[0]) === '6,4');
}
{
    const { state, engine, piece, smashed } = game(0);
    piece('gremlin', 5, 4); const c = piece('bigcrate', 6, 4);
    engine.wait();
    check('a big crate is lunged at the same way: lost +10, cratesSmashed +10', !state.pieces.includes(c) && state.lost === 10 && smashed() === 10);
}
{
    // At the chance (not below it) there's no lunge: the Belt carries the gremlin away as before.
    const ctx = game(0);
    ctx.g.Rando.random = () => { ctx.draws++; return ctx.CHANCE; };
    const { state, engine, put, piece, smashed, at } = ctx;
    put('BELT', 5, 4, DIR.W);
    const g = piece('gremlin', 5, 4), c = piece('crate', 6, 4);
    engine.wait();
    check('no lunge at or above the chance: the crate stays, the Belt carries the gremlin', state.pieces.includes(c) && at(c) === '6,4' &&
        at(g) === '4,4' && smashed() === 0 && state.lost === 0 && ctx.draws === 1);
}
{
    const { state, engine, put, piece, at } = game(0);
    put('BELT', 5, 4, DIR.W);
    const g = piece('gremlin', 5, 4), c = piece('crate', 6, 4);
    const { events } = engine.wait();
    check('a gremlin on a Belt beside a crate lunges and isn\'t carried', !state.pieces.includes(c) && at(g) === '6,4' &&
        moveOf(events, g.id).length === 1 && moveOf(events, g.id)[0].path.length === 1);
}
{
    const { state, engine, put, piece, at, smashed } = game(0);
    put('BELT', 6, 4, DIR.E);
    const g = piece('gremlin', 5, 4), c = piece('crate', 6, 4);
    const { events } = engine.wait();
    check('a crate on a Belt beside a gremlin is smashed before it moves', !state.pieces.includes(c) && smashed() === 1 &&
        moveOf(events, c.id).length === 0);
    check('… and the gremlin, now on that Belt, isn\'t carried this tick', at(g) === '6,4');
}
{
    const { state, engine, put, piece, smashed } = game(0);
    put('TRAP', 6, 4);
    const g = piece('gremlin', 5, 4), c = piece('crate', 6, 4);
    const { events } = engine.wait();
    const dies = events.find(e => e.type === 'splat' && e.id === g.id);
    check('a gremlin lunging onto a crate on a Trap dies there (trapped)', !state.pieces.includes(g) && !state.pieces.includes(c) &&
        !!dies && dies.trap === true && dies.hop === 1 && state.trapped === 1 && state.exGremlins === 0 && smashed() === 1);
}
{
    const { state, engine, piece, terrain, T, at } = game(0);
    terrain(6, 4, T.ICE); terrain(7, 4, T.ICE); terrain(8, 4, T.ICE);
    const g = piece('gremlin', 5, 4); piece('crate', 6, 4);
    engine.wait();
    check('no slide after lunging onto ice', at(g) === '6,4' && state.pieces.includes(g));
}
{
    const ctx = game(0);
    const { state, engine, put, piece } = ctx;
    RING.forEach(([q, r]) => put('WALL', q, r));
    piece('gremlin', 5, 4); piece('crate', 8, 4);   // a crate two and more hexes off doesn't count
    const before = ctx.g.Rando.state();
    engine.wait();
    check('a gremlin with no neighboring crate draws nothing from Rando', ctx.draws === 0 && ctx.g.Rando.state() === before &&
        state.pieces.length === 2);
}
{
    const ctx = game(0);
    const { state, engine, piece, at, smashed } = ctx;
    const g1 = piece('gremlin', 5, 4), c = piece('crate', 6, 4), g2 = piece('gremlin', 7, 4);
    const { events } = engine.wait();
    check('two gremlins beside one crate: the first lunges, the second sees it gone and draws nothing', at(g1) === '6,4' &&
        !state.pieces.includes(c) && ctx.draws === 1 && smashed() === 1 && state.lost === 1 &&
        events.filter(e => e.type === 'splat').length === 1);
    check('… the second gremlin wanders as usual (not onto the first)', at(g2) !== '6,4' && state.pieces.includes(g2));
}
{
    const ctx = game(0);
    const { state, engine, piece, at } = ctx;
    let offered = null;
    ctx.g.Rando.choice = list => { offered = list; return list[list.length - 1]; };
    const g = piece('gremlin', 5, 4), a = piece('crate', 6, 4), b = piece('crate', 4, 5);
    engine.wait();
    check('with several crates beside it, the gremlin lunges onto Rando.choice of them', !!offered && offered.length === 2 &&
        offered.includes(a) && offered.includes(b) && at(g) === at(offered[1]) && state.pieces.includes(offered[0]) && !state.pieces.includes(offered[1]));
}
done();

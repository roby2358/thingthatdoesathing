// R-81: the motion counters (D-74), counted in the hop simulation. A Spring's, Rocket's or
// Cannon's motion that moves its piece at least one hex adds 1 to springThrows, rocketFlights or
// cannonLobs; one that doesn't move (a throw with nowhere to go, a shot that doesn't fire) adds
// nothing. Each mountain hex a Spring's flight enters or a Cannon's lob passes over adds 1 to
// mountainsFlown. Each slick hex (bare ice or a Slide) a crate leaves by sliding adds 1 to slides,
// whatever it moves into (plains, water, more slick ground): a free slide, a landing's skid, a
// bumped line's advance or its bumper's follow (D-33). A powered step off a slick hex, a hex a
// crate is blocked or capped on, and anything a gremlin does count nothing.
// A Pusher or Puller that moves its piece adds 1 to pushes or pulls; pushesPulls is their sum.
'use strict';
const { check, done } = require('../helpers/check');
const { flatGame, DIR } = require('../helpers/load');

const shoot = (kind, setup) => {
    const ctx = flatGame();
    ctx.put(kind, 0, 4, DIR.E);
    setup(ctx);
    ctx.c = ctx.piece('crate', 0, 4);
    ctx.engine.wait();
    return ctx;
};
{
    const { engine, c, state } = shoot('SPRING', ({ terrain, T }) => { terrain(1, 4, T.MOUNTAIN); terrain(2, 4, T.MOUNTAIN); });
    const n = engine.counters();
    check('a Spring over two mountains: mountainsFlown 2, springThrows 1', c.isAt(3, 4) && n.mountainsFlown === 2 && n.springThrows === 1);
    check('… nothing else counted', n.rocketFlights === 0 && n.cannonLobs === 0 && n.slides === 0 && state.counts.pushes === 0);
}
{
    const { engine, c } = shoot('SPRING', ({ put }) => put('WALL', 1, 4));
    check('a Spring with a Wall in front doesn\'t throw: springThrows 0', c.isAt(0, 4) && engine.counters().springThrows === 0);
}
{
    const { engine, c } = shoot('BELT', ({ terrain, T }) => [1, 2, 3].forEach(q => terrain(q, 4, T.ICE)));
    check('a Belt onto three ice hexes, the crate sliding off onto plains: slides 3', c.isAt(4, 4) && engine.counters().slides === 3);
}
{
    const { engine, c } = shoot('SPRING', ({ terrain, T }) => [3, 4, 5].forEach(q => terrain(q, 4, T.ICE)));
    const n = engine.counters();
    check('a Spring landing on ice skids 3 → 5 then off onto plains: slides 3 (each slick hex left)', c.isAt(6, 4) && n.slides === 3 && n.springThrows === 1);
}
{
    const { engine, c } = shoot('SPRING', ({ terrain, T }) => terrain(3, 4, T.ICE));
    check('a Spring landing on one ice hex skids off onto plains: slides 1', c.isAt(4, 4) && engine.counters().slides === 1);
}
{
    const { engine, state, c } = shoot('BELT', ({ terrain, T }) => { terrain(1, 4, T.ICE); terrain(2, 4, T.WATER); });
    const n = engine.counters();
    check('a crate sliding off ice into water: slides 1, and sunk', !state.pieces.includes(c) && n.slides === 1 && n.cratesSunk === 1);
}
{
    const { engine, c } = shoot('BELT', ({ terrain, T, put }) => { terrain(1, 4, T.ICE); put('WALL', 2, 4); });
    check('a crate pushed onto ice and blocked there: slides 0', c.isAt(1, 4) && engine.counters().slides === 0);
}
{
    const { engine, c } = shoot('BELT', ({ put }) => [1, 2, 3, 4, 5, 6].forEach(q => put('SLIDE', q, 4)));
    check('a Belt onto six Slides stops at the MAX_SLIDE cap on its 4th: slides 3 (the hex it stops on isn\'t left)', c.isAt(4, 4) && engine.counters().slides === 3);
}
{
    const { engine, c } = shoot('SPRING', ({ terrain, T }) => [3, 4, 5, 6, 7, 8].forEach(q => terrain(q, 4, T.ICE)));
    check('a skid stopped by the MAX_SLIDE cap: slides 3 (3 → 6, its last hex not counted)', c.isAt(6, 4) && engine.counters().slides === 3);
}
{
    // The Belt pushes A onto ice at 1; at 2 it bumps B (still, on ice): B's line advances 2 → 4,
    // A follows 1 → 3. B leaves 2 and 3, A leaves 1 and 2: all slick.
    const { engine, put, piece, terrain, T } = flatGame();
    put('BELT', 0, 4, DIR.E); [1, 2, 3].forEach(q => terrain(q, 4, T.ICE));
    const a = piece('crate', 0, 4), b = piece('crate', 2, 4);
    engine.wait();
    check('a bump line on ice: the bumped crate and the following crate count their slick hexes left: slides 4',
        b.isAt(4, 4) && a.isAt(3, 4) && engine.counters().slides === 4);
}
{
    const { engine, put, piece, terrain, T } = flatGame();
    put('PUSHER', 0, 4, DIR.E); [1, 2].forEach(q => terrain(q, 4, T.ICE));
    const c = piece('crate', 1, 4);
    engine.wait();
    check('a Pusher shoving a crate off ice onto ice, then a free slide off onto plains: slides 1 (the powered step isn\'t a slide)',
        c.isAt(3, 4) && engine.counters().slides === 1);
}
{
    // A Belt or Bridge covers the ground (never slick), so it can't push a crate off a slick hex;
    // the Pusher's shove stands in for a powered step off one.
    const { engine, put, piece, terrain, T } = flatGame();
    put('PUSHER', 0, 4, DIR.E); terrain(1, 4, T.ICE);
    const c = piece('crate', 1, 4);
    engine.wait();
    check('a Pusher shoving a crate off ice onto plains: slides 0', c.isAt(2, 4) && engine.counters().slides === 0);
}
{
    const { engine, put, piece, terrain, T } = flatGame();
    put('BELT', 0, 4, DIR.E); [1, 2, 3].forEach(q => terrain(q, 4, T.ICE));
    const gr = piece('gremlin', 0, 4);
    engine.wait();
    check('a gremlin sliding across ice: slides 0', gr.isAt(4, 4) && engine.counters().slides === 0);
}
{
    // The gremlin on ice at 3 can't wander (walls, open water at 4, and a gremlin at 2 as the
    // tick starts, which the Pusher moves off on hop 1, as in R-66). The belted crate slides
    // 1 → 2 and bumps it: the gremlin is bumped off the ice into the water at 4, the crate
    // follows 2 → 3. The crate leaves 1 and 2; the gremlin's ice hex doesn't count.
    const { state, engine, put, piece, terrain, T } = flatGame();
    put('BELT', 0, 4, DIR.E); [1, 2, 3].forEach(q => terrain(q, 4, T.ICE)); terrain(4, 4, T.WATER);
    for (const [q, r] of [[4, 3], [3, 3], [3, 5]]) put('WALL', q, r);
    terrain(2, 5, T.MOUNTAIN); put('PUSHER', 2, 5, DIR.NW);
    const c = piece('crate', 0, 4), blocker = piece('gremlin', 2, 4), gr = piece('gremlin', 3, 4);
    engine.wait();
    check('(setup) the gremlin at 2 was pushed off the crate\'s path', blocker.isAt(2, 3));
    check('a gremlin bumped off ice: slides 2, the crate\'s only', !state.pieces.includes(gr) && c.isAt(3, 4) && engine.counters().slides === 2);
}
{
    const { engine, c } = shoot('ROCKET', () => {});
    const n = engine.counters();
    check('a Rocket flight: rocketFlights 1, mountainsFlown 0', c.isAt(8, 4) && n.rocketFlights === 1 && n.mountainsFlown === 0);
}
{
    const { engine, c } = shoot('CANNON', ({ terrain, T }) => { terrain(2, 4, T.MOUNTAIN); terrain(3, 4, T.MOUNTAIN); });
    const n = engine.counters();
    check('a Cannon lob over two mountains: cannonLobs 1, mountainsFlown 2', c.isAt(5, 4) && n.cannonLobs === 1 && n.mountainsFlown === 2);
}
{
    const { engine, c } = shoot('CANNON', ({ terrain, T, put }) => { terrain(1, 4, T.MOUNTAIN); terrain(3, 4, T.MOUNTAIN); put('WALL', 5, 4); });
    const n = engine.counters();
    check('a Cannon lob over two mountains that comes down early on its 4th hex: mountainsFlown 2', c.isAt(4, 4) && n.cannonLobs === 1 && n.mountainsFlown === 2);
}
{
    const { engine, put, piece, terrain, T } = flatGame();
    put('CANNON', 10, 4, DIR.E);   // its cleared hexes run off the map: no fire
    terrain(11, 4, T.MOUNTAIN); terrain(12, 4, T.MOUNTAIN);
    const c = piece('crate', 10, 4);
    engine.wait();
    const n = engine.counters();
    check('a Cannon that doesn\'t fire (two mountains in its stretch): cannonLobs 0, mountainsFlown 0', c.isAt(10, 4) && n.cannonLobs === 0 && n.mountainsFlown === 0);
}
{
    const { engine, put, piece } = flatGame();
    put('PUSHER', 0, 4, DIR.E); const a = piece('crate', 1, 4);
    put('PULLER', 0, 6, DIR.E); const b = piece('crate', 2, 6);
    engine.wait();
    const n = engine.counters();
    check('a Pusher moves its crate: pushes 1', a.isAt(2, 4) && n.pushes === 1);
    check('a Puller moves its crate: pulls 1', b.isAt(1, 6) && n.pulls === 1);
    check('pushesPulls = pushes + pulls', n.pushesPulls === 2);
    engine.wait();
    const m = engine.counters();
    check('nothing in front any more: no more pushes or pulls', m.pushes === 1 && m.pulls === 1 && m.pushesPulls === m.pushes + m.pulls);
}
{
    const { engine, put, piece } = flatGame();
    put('PUSHER', 0, 4, DIR.E); piece('crate', 1, 4); put('WALL', 2, 4);
    engine.wait();
    check('a Pusher whose crate is blocked: pushes 0', engine.counters().pushes === 0);
}
done();

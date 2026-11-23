// R-81: the motion counters (D-74), counted in the hop simulation. A Spring's, Rocket's or
// Cannon's motion that moves its piece at least one hex adds 1 to springThrows, rocketFlights or
// cannonLobs; one that doesn't move (a throw with nowhere to go, a shot that doesn't fire) adds
// nothing. Each mountain hex a Spring's flight enters or a Cannon's lob passes over adds 1 to
// mountainsFlown. Each slick-to-slick move (the D-52 count: a ground motion's or a landing's
// skid) adds 1 to slides.
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
    const { engine, c } = shoot('SPRING', ({ terrain, T }) => [3, 4, 5].forEach(q => terrain(q, 4, T.ICE)));
    const n = engine.counters();
    check('a Spring landing on ice skids 3 → 5 then onto plains: slides 2 (its slick-to-slick moves)', c.isAt(6, 4) && n.slides === 2 && n.springThrows === 1);
}
{
    const { engine, c } = shoot('BELT', ({ terrain, T }) => [1, 2].forEach(q => terrain(q, 4, T.ICE)));
    check('a Belt onto two ice hexes: slides 1 (plains → ice isn\'t a slide)', c.isAt(3, 4) && engine.counters().slides === 1);
}
{
    const { engine, c } = shoot('BELT', ({ put }) => [1, 2, 3, 4, 5, 6].forEach(q => put('SLIDE', q, 4)));
    check('a Belt onto six Slides stops on its MAX_SLIDE-th slide: slides 3', c.isAt(4, 4) && engine.counters().slides === 3);
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

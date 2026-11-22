// R-80: the command and delivery counters (D-74), each counted where its thing happens. A
// delivery adds its value to cratesDelivered (state.delivered; a big crate 10) and a big crate
// 1 to bigDelivered; an accepted place adds 1 to placed, move 1 to moved (scrap nothing),
// bomb 1 to bombs (whatever it clears), discard 1 to discards. A refused command (ok:false)
// counts nothing.
'use strict';
const { check, done } = require('../helpers/check');
const { flatGame, DIR, snapshot } = require('../helpers/load');

{
    const { state, engine, put, piece } = flatGame();
    put('BELT', 9, 8, DIR.E);   // the target is (10, 8)
    piece('bigcrate', 9, 8);
    engine.wait();
    const c = engine.counters();
    check('a big crate delivered: cratesDelivered +10, bigDelivered +1', c.cratesDelivered === 10 && c.bigDelivered === 1 && state.delivered === 10);
    piece('crate', 9, 8);
    engine.wait();
    const d = engine.counters();
    check('a crate delivered: cratesDelivered +1, bigDelivered unchanged', d.cratesDelivered === 11 && d.bigDelivered === 1);
}
{
    const { state, engine, put, piece } = flatGame();
    state.hand[0] = { kind: 'BELT' };
    const res = engine.place(0, 3, 4, DIR.E, 'white');
    check('an accepted place: placed 1', res.ok && engine.counters().placed === 1);
    state.hand[0] = { kind: 'MOVER' };
    const mv = engine.move(0, 3, 4, 5, 4, DIR.W);
    check('a move with the Mover: moved 1, placed still 1', mv.ok && engine.counters().moved === 1 && engine.counters().placed === 1);
    state.hand[0] = { kind: 'MOVER' };
    const sc = engine.scrap(0, 5, 4);
    check('a scrap: moved unchanged', sc.ok && engine.counters().moved === 1);
    put('WALL', 6, 6); piece('gremlin', 7, 7); put('BELT', 8, 2, DIR.E);
    state.hand[0] = { kind: 'BOMB' };
    const bo = engine.bomb(0, [{ q: 6, r: 6 }, { q: 7, r: 7 }, { q: 8, r: 2 }]);
    check('a bomb of three hexes: bombs 1', bo.ok && engine.counters().bombs === 1);
    const di = engine.discard(1);
    check('a discard: discards 1', di.ok && engine.counters().discards === 1);
    check('a wait counts none of these', engine.wait().ok && engine.counters().discards === 1 && engine.counters().placed === 1);
}
{
    // Refused commands: ok:false, nothing changed, no counter moved.
    const { state, engine, put, piece } = flatGame();
    put('BELT', 3, 4, DIR.E);
    const before = JSON.stringify(engine.counters());
    state.hand = [{ kind: 'WALL' }, { kind: 'MOVER' }, { kind: 'BOMB' }];
    const handSnap = snapshot(state);
    const refused = [
        ['a Wall on a target', () => engine.place(0, 10, 8, null, 'white')],
        ['a place from a bad slot', () => engine.place(7, 2, 4, null, 'white')],
        ['a move from a bare hex', () => engine.move(1, 2, 2, 4, 4, DIR.E)],
        ['a move with a non-Mover card', () => engine.move(0, 3, 4, 4, 4, DIR.E)],
        ['a scrap of a bare hex', () => engine.scrap(1, 2, 2)],
        ['a bomb on a bare hex', () => engine.bomb(2, [{ q: 2, r: 2 }])],
        ['a bomb of six hexes', () => engine.bomb(2, [1, 2, 3, 4, 5, 6].map(q => ({ q, r: 4 })))],
        ['a discard of a bad slot', () => engine.discard(3)],
        ['a blast of a bare hex', () => engine.blast(2, 2)],
        ['a remove of a bare hex', () => engine.remove(2, 2)],
    ];
    for (const [why, run] of refused) {
        const res = run();
        check(why + ': refused, no counter moved', res.ok === false && JSON.stringify(engine.counters()) === before && snapshot(state) === handSnap);
    }
}
done();

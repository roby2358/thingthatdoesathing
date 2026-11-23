// R-114: discardAll (D-83). Every hand slot is redrawn, slot 0 then 1 then 2 (the same draws,
// in the same order, as three draw() calls), the discards counter goes up by the hand size, the
// idle count resets (a card was used) and the world ticks exactly once: the state afterwards is
// what three slot-order draws and one card-first tick give. It has no refused case (the hand is
// always full). discard(slot) is unchanged: one slot, one discard, one tick.
'use strict';
const { check, done } = require('../helpers/check');
const { newGame } = require('../helpers/load');

for (const seed of [11, 4242]) {
    const a = newGame(seed, 'small'), b = newGame(seed, 'small');
    // Get both off the first turn the same way, with some idle ticks.
    for (const x of [a, b]) { x.engine.wait(); x.engine.wait(); }
    check(`seed ${seed}: twins start equal`, JSON.stringify(a.engine.save()) === JSON.stringify(b.engine.save()));
    const turn = a.state.turn, discards = a.state.counts.discards, size = a.state.hand.length;
    check('the hand holds three cards', size === 3);

    const res = a.engine.discardAll();
    check('discardAll → {ok: true, events: [...]}', res.ok === true && Array.isArray(res.events));
    check('exactly one tick', a.state.turn === turn + 1);
    check('discards + the hand size (3)', a.state.counts.discards === discards + 3);
    check('a card was used: idleTicks reset', a.state.idleTicks === 0);

    // The twin: three draws in slot order, then one card-first tick, by hand.
    for (let i = 0; i < size; i++) b.state.hand[i] = b.engine.draw();
    b.state.counts.discards += size;
    b.engine.tick({ events: [], gone: [], usedCard: true });
    check('the same as three slot-order draws and one tick (hand, board, Rando)', JSON.stringify(a.engine.save()) === JSON.stringify(b.engine.save()));
}

// discard(slot) is unchanged: one slot redrawn, one discard, one tick.
{
    const a = newGame(7, 'small');
    const turn = a.state.turn, discards = a.state.counts.discards;
    const kept = JSON.stringify([a.state.hand[0], a.state.hand[2]]);
    const res = a.engine.discard(1);
    check('discard(1): ok, one tick, discards + 1, slots 0 and 2 kept', res.ok && a.state.turn === turn + 1
        && a.state.counts.discards === discards + 1 && JSON.stringify([a.state.hand[0], a.state.hand[2]]) === kept);
}
done();

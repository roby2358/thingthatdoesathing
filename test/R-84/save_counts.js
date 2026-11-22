// R-84: the stored counters round-trip a save (D-74, D-67). GameState.toJSON() carries counts;
// fromJSON brings them back, so the restored engine's counters() match and keep counting the
// same. fromJSON refuses (restore ok:false, nothing changed) a save without counts, counts not
// an object, a key that isn't a stored counter (a read one included), a stored counter missing,
// or a count that isn't a whole number ≥ 0.
'use strict';
const { check, done } = require('../helpers/check');
const { newGame, SEEDS } = require('../helpers/load');

const full = engine => JSON.stringify(engine.save());
{
    const a = newGame(SEEDS[3], 'small');
    for (let i = 0; i < 6; i++) a.engine.discard(i % 3);
    a.state.counts.slides = 7; a.state.counts.cratesSunk = 3; a.state.counts.pushes = 2; a.state.counts.pulls = 4;
    const text = JSON.stringify(a.engine.save());
    check('the save carries counts', JSON.parse(text).counts.discards === 6 && JSON.parse(text).counts.slides === 7);
    const b = newGame(SEEDS[5], 'medium');
    const res = b.engine.restore(JSON.parse(text));
    check('restored: counts and counters() match the saved game', res.ok && JSON.stringify(b.state.counts) === JSON.stringify(a.state.counts) &&
        JSON.stringify(b.engine.counters()) === JSON.stringify(a.engine.counters()) && b.engine.counters().pushesPulls === 6);
    check('the restored counts share nothing with the saved data', (() => { const d = JSON.parse(text); b.engine.restore(d); d.counts.slides = 99; return b.state.counts.slides === 7; })());
    for (let i = 0; i < 20; i++) { a.engine.discard(0); b.engine.discard(0); }
    check('20 discards later both count the same', b.engine.counters().discards === 26 && full(a.engine) === full(b.engine));
}
{
    const a = newGame(SEEDS[4], 'small');
    a.engine.discard(0);
    const good = a.engine.save();
    const before = full(a.engine);
    const { counts } = good;
    const without = { ...good }; delete without.counts;
    const missing = { ...counts }; delete missing.placed;
    const bad = {
        'no counts': without,
        'counts null': { ...good, counts: null },
        'counts a list': { ...good, counts: [] },
        'an unknown counter': { ...good, counts: { ...counts, laughs: 1 } },
        'a read counter stored': { ...good, counts: { ...counts, cratesDelivered: 0 } },
        'a derived counter stored': { ...good, counts: { ...counts, pushesPulls: 0 } },
        'a stored counter missing': { ...good, counts: missing },
        'a negative count': { ...good, counts: { ...counts, slides: -1 } },
        'a fractional count': { ...good, counts: { ...counts, slides: 1.5 } },
        'a count as text': { ...good, counts: { ...counts, slides: '3' } },
    };
    for (const [why, data] of Object.entries(bad)) {
        const res = a.engine.restore(data);
        check(why + ': refused, nothing changed', res.ok === false && full(a.engine) === before);
    }
}
done();

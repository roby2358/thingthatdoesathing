// R-71: a mid-game state saved (engine.save(), through a JSON string), restored into a fresh
// engine in a fresh vm (its own Rando), and played on matches the unsaved original command for
// command: same results, same events, same state, the Rando stream included (D-67). Bad saved
// data is refused with nothing changed.
'use strict';
const { check, done } = require('../helpers/check');
const { load, newGame, snapshot, terrainSignature, SEEDS } = require('../helpers/load');

// One scripted command (the R-22 mix), chosen from `ref`'s state as it stands now, as a
// function that runs it on an engine.
function command(ref, i) {
    const slot = i % 3, kind = ref.state.hand[slot].kind;
    const legal = [...ref.engine.legalPlacements(kind)];
    if (i % 4 === 3 || !legal.length) return e => e.wait();
    const { q, r } = ref.g.Hex.fromKey(legal[(i * 7) % legal.length]);
    const color = ref.engine.colorChoices(kind)[0];
    return e => e.place(slot, q, r, i % 6, color);
}

const full = engine => JSON.stringify(engine.save());

for (const [seed, size] of [[SEEDS[0], 'small'], [SEEDS[1], 'small'], [SEEDS[2], 'medium'], [SEEDS[3], 'large']]) {
    const a = newGame(seed, size);
    for (let i = 0; i < 40; i++) command(a, i)(a.engine);
    const saved = JSON.stringify(a.engine.save());

    const g = load();
    const state = new g.GameState();
    const engine = new g.GameEngine(state);
    g.Rando.seed(12345);   // a fresh page's stream is somewhere else entirely
    const res = engine.restore(JSON.parse(saved));
    const b = { g, state, engine };
    check(`${size} seed ${seed}: restore answers ok with no events`, res.ok && res.events.length === 0);
    check(`${size} seed ${seed}: the restored game is the saved one (state, terrain, Rando position)`,
        full(b.engine) === saved && terrainSignature(b.state) === terrainSignature(a.state) && snapshot(b.state) === snapshot(a.state));
    check(`${size} seed ${seed}: pieces come back as Pieces and the board is rebuilt`,
        b.state.pieces.every(p => p instanceof g.Piece && typeof p.key === 'function') && !!b.engine.board &&
        b.engine.board.passableHexes().length === a.engine.board.passableHexes().length);

    let same = true, at = -1;
    for (let i = 40; i < 120; i++) {
        const run = command(a, i);
        const ra = run(a.engine), rb = run(b.engine);
        if (JSON.stringify(ra) !== JSON.stringify(rb) || full(a.engine) !== full(b.engine)) { same = false; at = i; break; }
    }
    check(`${size} seed ${seed}: 80 commands after the restore match the unsaved copy tick for tick` + (same ? '' : ` (differs at ${at})`), same);
}

// Bad data: refused, the state and the Rando stream untouched.
{
    const a = newGame(SEEDS[4], 'small');
    for (let i = 0; i < 10; i++) command(a, i)(a.engine);
    const good = a.engine.save();
    const before = full(a.engine);
    const bad = {
        'not an object': 'nope',
        'null': null,
        'unknown size': { ...good, size: 'galactic' },
        'no hexes': { ...good, hexes: [] },
        'a bad terrain': { ...good, hexes: [{ ...good.hexes[0], terrain: 9 }, ...good.hexes.slice(1)] },
        'an unknown card': { ...good, hand: [{ kind: 'LASER' }, ...good.hand.slice(1)] },
        'an unknown piece': { ...good, pieces: [{ q: 0, r: 0, id: 99, kind: 'dragon' }] },
        'a counter not a number': { ...good, turn: '12' },
        'no Rando position': { ...good, rng: null },
        'mid-tick': { ...good, phase: 'tick' },
    };
    for (const [why, data] of Object.entries(bad)) {
        const res = a.engine.restore(data);
        check(`${why}: refused, nothing changed (Rando included)`, res.ok === false && full(a.engine) === before);
    }
}
done();

// gamestate.js — GameState
//
// The authoritative, serializable game data — nothing else. No DOM, no rules behavior, no
// view/interaction state. toJSON / GameState.fromJSON round-trip the whole game as plain JSON,
// the seeded Rando stream's position included (`rng`), so a saved game ticks on exactly as the
// original would have (D-67). fromJSON only reads: it never touches Rando; the engine's
// restore() puts the stream back once the state is known good.
const GameState = (function () {
    const { MAP_SIZES, TERRAIN, PIECES, CARDS, THINGS, CRATE_COLORS, STORED_COUNTERS, COUNTERS, GOALS_PER_GAME } = GameArtifacts;
    const TALLIES = ['unlocks', 'turn', 'delivered', 'lost', 'exGremlins', 'trapped', 'idleTicks', 'spawnSlot', 'nextId'];
    const TERRAINS = new Set(Object.values(TERRAIN));
    const KINDS = new Set(CARDS);
    const STORED = new Set(STORED_COUNTERS);
    const PER_GAME = COUNTERS.filter(c => c.perGame).map(c => c.key);   // the keys of counters(), so of goals.base
    const GOAL_COUNTERS = new Set(COUNTERS.filter(c => c.goal).map(c => c.key));

    // A saved game that doesn't hold up throws this; the caller drops the save.
    function need(ok, what) {
        if (!ok) throw new Error('bad saved game: ' + what);
    }
    const isInt = v => Number.isInteger(v);
    const isUint32 = v => isInt(v) && v >= 0 && v <= 0xFFFFFFFF;
    const isList = v => Array.isArray(v);
    const isRec = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    const has = (table, k) => Object.prototype.hasOwnProperty.call(table, k);
    const at = (v, what) => need(isRec(v) && isInt(v.q) && isInt(v.r), what);
    // A deep copy through JSON, so the restored state shares nothing with the saved object.
    const copy = v => JSON.parse(JSON.stringify(v));

    class GameState {
        constructor() {
            this.seed = 0;            // reproducibility anchor
            this.size = null;         // key of GameArtifacts.MAP_SIZES
            this.hexes = null;        // Map<"q,r", hex>
            this.sources = [];        // [{q, r, colors}] — crates of these colors appear here
            this.targets = [];        // [{q, r, color, delivered}] — takes only `color` crates; one per open color
            this.pieces = [];         // [Piece] crates and gremlins, in creation order
            this.things = [];         // [{kind, color, q, r, facing}] in placement order (= action order)
            this.hand = [];           // [{kind}] cards, length HAND_SIZE
            this.unlocks = 0;         // how many UNLOCKS steps are open (a new game opens 1)
            this.turn = 1;
            this.delivered = 0;
            this.lost = 0;            // crates sunk
            this.exGremlins = 0;      // gremlins sunk, splatted, or killed on a target
            this.trapped = 0;         // gremlins a Trap caught
            this.idleTicks = 0;       // ticks in a row with no card used (place, discard)
            this.spawnCycle = [];     // every CRATE_COLORS color once, shuffled at newGame; fixed for the game
            this.spawnSlot = 0;       // index into spawnCycle of the slot the next tick takes
            this.nextId = 1;
            this.phase = 'player';    // 'player' | 'tick'
            this.counts = GameState.zeroCounts();   // {key: n}, the stored per-game counters (D-74)
            this.goals = { set: 0, base: {}, list: [] };   // the goal set now (D-75): its number, counters() when dealt, [{counter, amount, met}]
        }

        // Every stored counter (GameArtifacts.STORED_COUNTERS) at 0, as a new game has them.
        static zeroCounts() {
            return Object.fromEntries(STORED_COUNTERS.map(k => [k, 0]));
        }

        // The whole game as plain JSON data: hexes as a list in Map order, pieces as plain
        // records, and `rng`, the seeded Rando stream's position now (D-67).
        toJSON() {
            return copy({
                seed: this.seed, size: this.size,
                hexes: this.hexes ? [...this.hexes.values()] : null,
                sources: this.sources, targets: this.targets,
                pieces: this.pieces,
                things: this.things, hand: this.hand,
                unlocks: this.unlocks, turn: this.turn, delivered: this.delivered, lost: this.lost,
                exGremlins: this.exGremlins, trapped: this.trapped, idleTicks: this.idleTicks,
                spawnCycle: this.spawnCycle, spawnSlot: this.spawnSlot, nextId: this.nextId, phase: this.phase,
                counts: this.counts,
                goals: this.goals,
                rng: Rando.state(),
            });
        }

        // A GameState from toJSON's data, checked: anything missing, of the wrong type or naming
        // an unknown size, terrain, piece or card throws, and nothing is built. Rando is left alone.
        static fromJSON(data) {
            need(isRec(data), 'not an object');
            need(isUint32(data.seed), 'seed');
            need(typeof data.size === 'string' && has(MAP_SIZES, data.size), 'size');
            need(isUint32(data.rng), 'rng');
            need(data.phase === 'player', 'phase');
            for (const k of TALLIES) need(isInt(data[k]) && data[k] >= 0, k);
            need(isRec(data.counts), 'counts');
            need(Object.keys(data.counts).every(k => STORED.has(k)), 'an unknown counter');
            for (const k of STORED_COUNTERS) need(isInt(data.counts[k]) && data.counts[k] >= 0, 'counter ' + k);
            const g = data.goals;
            need(isRec(g) && isInt(g.set) && g.set >= 0, 'goals');
            need(isRec(g.base) && Object.keys(g.base).length === PER_GAME.length &&
                PER_GAME.every(k => isInt(g.base[k]) && g.base[k] >= 0), 'goals base');
            need(isList(g.list) && g.list.length === GOALS_PER_GAME && g.list.every(x =>
                isRec(x) && GOAL_COUNTERS.has(x.counter) && isInt(x.amount) && x.amount > 0 && typeof x.met === 'boolean'), 'goals list');
            need(isList(data.hexes) && data.hexes.length > 0, 'hexes');
            data.hexes.forEach(h => { at(h, 'hex'); need(TERRAINS.has(h.terrain), 'terrain'); });
            need(isList(data.sources) && data.sources.length > 0, 'sources');
            data.sources.forEach(s => { at(s, 'source'); need(isList(s.colors), 'source colors'); });
            need(isList(data.targets) && data.targets.length > 0, 'targets');
            data.targets.forEach(t => { at(t, 'target'); need(CRATE_COLORS.includes(t.color) && isInt(t.delivered), 'target'); });
            need(isList(data.pieces), 'pieces');
            data.pieces.forEach(p => { at(p, 'piece'); need(isInt(p.id) && has(PIECES, p.kind), 'piece'); });
            need(isList(data.things), 'things');
            data.things.forEach(t => { at(t, 'thing'); need(has(THINGS, t.kind), 'thing'); });
            need(isList(data.hand) && data.hand.every(c => isRec(c) && KINDS.has(c.kind)), 'hand');
            need(isList(data.spawnCycle) && data.spawnCycle.length > 0 && data.spawnSlot < data.spawnCycle.length, 'spawnCycle');

            const d = copy(data);
            const s = new GameState();
            s.seed = d.seed;
            s.size = d.size;
            s.hexes = new Map(d.hexes.map(h => [Hex.key(h.q, h.r), h]));
            s.sources = d.sources;
            s.targets = d.targets;
            s.pieces = d.pieces.map(p => Object.assign(new Piece(p.q, p.r, p.color, p.label), p));
            s.things = d.things;
            s.hand = d.hand;
            for (const k of TALLIES) s[k] = d[k];
            s.counts = d.counts;
            s.goals = d.goals;
            s.spawnCycle = d.spawnCycle;
            s.phase = d.phase;
            return s;
        }
    }

    return GameState;
})();

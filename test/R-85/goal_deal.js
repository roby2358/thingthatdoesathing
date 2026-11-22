// R-85: the goal deal (D-75). A set is GOALS_PER_GAME (3) distinct goal counters, never
// one of the size's goalExcludes (small: pushes, pulls, pushesPulls), each with an amount that is a
// rung at one of the size's goalLevels (small 3; medium, large 3 or 4; huge 4), met false. newGame
// deals set 0 with base = counters() (all 0). Set k draws from Rando.stream(a mix of seed and k):
// the same seed and set give the same goals; dealing never moves the shared Rando stream, so a
// game plays exactly as it would without goals.
'use strict';
const { check, done } = require('../helpers/check');
const { newGame, load, SEEDS } = require('../helpers/load');

// The level of the size's goalLevels whose rung is this goal's amount (undefined: none is).
const levelOf = (g, x, size) => {
    const { COUNTERS, MAP_SIZES, rung } = g.GameArtifacts;
    const c = COUNTERS.find(r => r.key === x.counter);
    return MAP_SIZES[size].goalLevels.find(l => rung(c.scale, l - 1) === x.amount);
};
const goalsOf = engine => JSON.stringify(engine.state.goals.list);

{
    const { g } = newGame(SEEDS[0], 'small');
    const { GOALS_PER_GAME, MAP_SIZES } = g.GameArtifacts;
    check('GOALS_PER_GAME is 3', GOALS_PER_GAME === 3);
    check('goalLevels: small [3], medium [3, 4], large [3, 4], huge [4]',
        JSON.stringify(['small', 'medium', 'large', 'huge'].map(k => MAP_SIZES[k].goalLevels)) === '[[3],[3,4],[3,4],[4]]');
    check('goalExcludes: small pushes, pulls, pushesPulls; the others none',
        JSON.stringify(MAP_SIZES.small.goalExcludes) === '["pushes","pulls","pushesPulls"]' &&
        ['medium', 'large', 'huge'].every(k => MAP_SIZES[k].goalExcludes.length === 0));
    const r = g.Rando.stream(42), r2 = g.Rando.stream(42);
    const a = [r(), r(), r()], b = [r2(), r2(), r2()];
    check('Rando.stream(n): the same n gives the same floats in [0, 1)', JSON.stringify(a) === JSON.stringify(b) && a.every(x => x >= 0 && x < 1));
    g.Rando.seed(5);
    const before = g.Rando.state();
    g.Rando.stream(7)(); g.Rando.stream(7)();
    check('Rando.stream never moves the shared stream', g.Rando.state() === before);
}

for (const size of ['small', 'medium', 'large']) {
    const { g, state, engine } = newGame(SEEDS[1], size);
    const { COUNTERS, MAP_SIZES } = g.GameArtifacts;
    const goalKeys = new Set(COUNTERS.filter(c => c.goal).map(c => c.key));
    const s0 = state.goals;
    check(size + ': newGame deals set 0, base = counters() (all 0), 3 unmet goals',
        s0.set === 0 && JSON.stringify(s0.base) === JSON.stringify(engine.counters()) &&
        Object.values(s0.base).every(v => v === 0) && s0.list.length === 3 && s0.list.every(x => x.met === false));
    let distinct = true, goals = true, levels = true, excluded = true;
    const seen = new Set(), levelsSeen = new Set();
    for (let k = 0; k < 300; k++) {
        engine.dealGoals(k);
        const list = state.goals.list;
        distinct = distinct && new Set(list.map(x => x.counter)).size === 3 && list.length === 3;
        goals = goals && list.every(x => goalKeys.has(x.counter) && x.met === false);
        levels = levels && list.every(x => levelOf(g, x, size) !== undefined);
        excluded = excluded && list.every(x => !MAP_SIZES[size].goalExcludes.includes(x.counter));
        list.forEach(x => { seen.add(x.counter); levelsSeen.add(levelOf(g, x, size)); });
    }
    check(size + ': 300 sets, each 3 distinct counters', distinct);
    check(size + ': only goal counters (never negative, milestones, goalsMet, rungsReached)', goals);
    check(size + ': each amount a rung at one of the size\'s goalLevels', levels);
    check(size + ': no excluded counter is ever dealt', excluded);
    check(size + ': every offered counter turns up', seen.size === goalKeys.size - MAP_SIZES[size].goalExcludes.length);
    check(size + ': every one of the size\'s goalLevels turns up', levelsSeen.size === MAP_SIZES[size].goalLevels.length);
}
{
    const { g, state } = newGame(SEEDS[2], 'huge');
    check('huge: amounts are level-4 rungs', state.goals.list.every(x => levelOf(g, x, 'huge') === 4));
}
{
    const a = newGame(SEEDS[3], 'medium'), b = newGame(SEEDS[3], 'medium');
    check('the same seed deals the same set 0', goalsOf(a.engine) === goalsOf(b.engine));
    a.engine.dealGoals(4); b.engine.dealGoals(4);
    check('the same seed and set give the same goals', goalsOf(a.engine) === goalsOf(b.engine));
    const sets = new Set([0, 1, 2, 3, 4, 5].map(k => { a.engine.dealGoals(k); return goalsOf(a.engine); }));
    check('different sets of one game deal differently', sets.size > 1);
    const c = newGame(SEEDS[4], 'medium');
    const d = newGame(SEEDS[3], 'medium');
    check('different seeds deal differently', goalsOf(c.engine) !== goalsOf(d.engine));
    const before = d.g.Rando.state();
    d.engine.dealGoals(9);
    check('dealGoals never moves Rando', d.g.Rando.state() === before);
}
{
    // One game with goals, one with the deal made a no-op (as before goals): the shared stream
    // and every command's result and world come out the same.
    const strip = e => { const d = e.save(); delete d.goals; delete d.counts.goalsMet; return JSON.stringify(d); };
    for (const size of ['small', 'medium']) {
        const g1 = load(), g2 = load();
        const e1 = new g1.GameEngine(new g1.GameState());
        const e2 = new g2.GameEngine(new g2.GameState());
        e2.dealGoals = function () { this.state.goals = { set: 0, base: {}, list: [] }; };
        e1.newGame(SEEDS[5], size); e2.newGame(SEEDS[5], size);
        let same = g1.Rando.state() === g2.Rando.state() && strip(e1) === strip(e2);
        for (let i = 0; i < 300 && same; i++) {
            const step = e => {
                if (i % 3 === 0) {
                    const kind = e.state.hand[0].kind;
                    const keys = [...e.legalPlacements(kind)].sort();
                    if (keys.length) {
                        const [q, r] = keys[i % keys.length].split(',').map(Number);
                        return e.place(0, q, r, i % 6, e.colorChoices(kind)[0]);
                    }
                }
                if (i % 3 === 1) return e.discard(i % 3);
                if (i % 50 === 25) e.newGoals();
                return e.wait();
            };
            const r1 = step(e1), r2 = step(e2);
            const ev = r => JSON.stringify(r.events.filter(x => x.type !== 'goal' && x.type !== 'goalsDone'));
            same = r1.ok === r2.ok && ev(r1) === ev(r2) && g1.Rando.state() === g2.Rando.state() && strip(e1) === strip(e2);
        }
        check(size + ': 300 commands (newGoals among them) play identically with goals and without', same);
    }
}
done();

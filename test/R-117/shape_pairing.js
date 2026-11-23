// R-117: each game shuffles which crate shape goes with which color, once, from its seed (D-84).
// GameUI.crateShapesFor(seed) is a permutation of CRATE_SHAPES over CRATE_COLORS, the same for
// the same seed, different for some seeds, and computing it leaves Rando.state() where it was.
// startGame deals the new game's pairing, a restored save (the sign-in redirect) gets the same
// one back, the intro uses CRATE_SHAPES_DEFAULT, and the board's drawing and Help's World
// pictures follow the pairing.
'use strict';
const { check, done } = require('../helpers/check');
const { bootPage, memoryStorage } = require('../helpers/page');

const first = bootPage();
const D = first.run('GameDisplayArtifacts');
const COLORS = first.run('GameArtifacts.CRATE_COLORS');
const SHAPES = D.CRATE_SHAPES;
const pairing = seed => first.run(`GameUI.crateShapesFor(${seed})`);
const same = (a, b) => COLORS.every(c => a[c] === b[c]);

check('the intro (no game yet) draws with CRATE_SHAPES_DEFAULT', same(first.ui.crateShapes, D.CRATE_SHAPES_DEFAULT));

const seeds = [0, 1, 2, 3, 42, 12345, 0x7fffffff, 0xffffffff, 2026, 1123];
for (let i = 0; i < 40; i++) seeds.push((Math.imul(i + 1, 0x9E3779B1) >>> 0));
const all = seeds.map(pairing);
check('every seed\'s pairing is a permutation of the four shapes over CRATE_COLORS', all.every(m =>
    Object.keys(m).length === COLORS.length && COLORS.every(c => SHAPES.includes(m[c])) && new Set(COLORS.map(c => m[c])).size === SHAPES.length));
check('the same seed gives the same pairing', seeds.every((s, i) => same(pairing(s), all[i])));
const distinct = new Set(all.map(m => COLORS.map(c => m[c]).join()));
check('different seeds give different pairings (several among 50 seeds)', distinct.size >= 6);

// The shared Rando stream doesn't move.
first.ui.startGame('small');
first.ui.dismissOverlay();
const before = first.run('Rando.state()');
const drawn = first.run('[Rando.random(), Rando.state()]');
first.run('Rando.setState(' + before + ')');
seeds.forEach(pairing);
check('computing pairings leaves Rando.state() unchanged', first.run('Rando.state()') === before);
check('… and the next shared draw is the one it would have been', JSON.stringify(first.run('[Rando.random(), Rando.state()]')) === JSON.stringify(drawn));
first.run('Rando.setState(' + before + ')');

// startGame deals the game's pairing from its seed.
check('startGame: the game\'s pairing is its seed\'s', same(first.ui.crateShapes, pairing(first.state.seed)));

// A save restored on a sign-in return looks the same.
const KEY = D.SAVE_KEY, RETURN = '?code=c0de&state=' + D.SIGNIN_STATE_PREFIX + 'r4nd0m';
check('the game saves for the redirect', first.ui.saveForRedirect() === true);
const restored = bootPage({ storage: memoryStorage({ [KEY]: first.storage.map.get(KEY) }), search: RETURN });
check('the save restores', restored.ui.overlay === null && restored.state.seed === first.state.seed);
check('after the restore: the same pairing as before the redirect', same(restored.ui.crateShapes, first.ui.crateShapes));

// The board draws each color's crate with the game's pairing: find a seed whose pairing isn't the
// default, put one crate of each color on the board, and log which drawer each one calls.
const DRAWER = { cube: 'drawCube', cylinder: 'drawCylinder', strapped: 'drawStrapped', bag: 'drawBag' };
const p = bootPage();
let tries = 0;
do { p.ui.startGame('small'); p.ui.dismissOverlay(); tries++; } while (same(p.ui.crateShapes, D.CRATE_SHAPES_DEFAULT) && tries < 50);
check('a game whose pairing differs from the default turns up', !same(p.ui.crateShapes, D.CRATE_SHAPES_DEFAULT));
const SHADES = p.run('GameDisplayArtifacts.CRATE_SHADES');   // this page's own objects, matched by identity
const calls = [];
for (const [shape, name] of Object.entries(DRAWER)) {
    const orig = p.ui[name];
    p.ui[name] = function (g) { calls.push([shape, g.shades]); return orig.call(this, g); };
}
const land = [...p.state.hexes.values()].filter(h => h.terrain === p.run('GameArtifacts.TERRAIN.PLAINS')
    && !p.state.pieces.some(o => o.q === h.q && o.r === h.r));
p.state.pieces = p.state.pieces.filter(o => o.kind === 'gremlin');
COLORS.forEach((color, i) => p.state.pieces.push({ id: 900 + i, kind: 'crate', color, label: 'x', q: land[i].q, r: land[i].r }));
p.ui.ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
p.ui.render();
// The strapped cube draws the cube under its straps, so its own drawer is the first call per crate.
const first4 = COLORS.map(c => calls.find(([, sh]) => sh === SHADES[c]));
check('the board draws each color\'s crate in the game\'s shape for it', COLORS.every((c, i) => first4[i] && first4[i][0] === p.ui.crateShapes[c]));
check('… and none in a shape the pairing doesn\'t give its color', calls.every(([shape, sh]) => {
    const c = COLORS.find(k => SHADES[k] === sh);
    return shape === p.ui.crateShapes[c] || (shape === 'cube' && p.ui.crateShapes[c] === 'strapped');
}));

// Help's World page is drawn for the game on now: a new game whose red isn't the default cube
// redraws its Crate and Big crate pictures (both red) in that game's red shape.
let more = 0;
do { calls.length = 0; p.ui.startGame('small'); p.ui.dismissOverlay(); more++; } while (p.ui.crateShapes.red === 'cube' && more < 50);
const redCalls = calls.filter(([, sh]) => sh === SHADES.red);
check('Help\'s World pictures follow the new game\'s pairing', p.ui.crateShapes.red !== 'cube' && redCalls.length > 0
    && redCalls[0][0] === p.ui.crateShapes.red
    && redCalls.every(([shape]) => shape === p.ui.crateShapes.red || (shape === 'cube' && p.ui.crateShapes.red === 'strapped')));
done();

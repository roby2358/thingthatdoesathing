// R-116: each crate color has its own shape (D-84). CRATE_SHAPES lists the four shapes and
// CRATE_SHAPES_DEFAULT names one per CRATE_COLORS entry, all different; in a game the pairing is
// the game's own (GameUI.crateShapes, R-117), and drawing a crate or a big crate of a color, through the board's own
// drawPiece (PIECE_DRAW), calls that shape's drawer and no other, at BIG_CRATE_SCALE for a big
// one, filling with the color's CRATE_SHADES and staying inside the cube's footprint. A
// recording 2D context stands in for the canvas. The board render and Help's World pictures
// reach the same drawers. The bag's outer outline is stroked BAG_OUTLINE_WIDTH times the cube's
// outline width, times the crate's draw scale (big crates too); its detail lines keep the cube's width.
'use strict';
const { check, done } = require('../helpers/check');
const { liveGame } = require('../helpers/goals');

const p = liveGame('small');
const COLORS = p.run('GameArtifacts.CRATE_COLORS');
const SHAPE_LIST = p.run('GameDisplayArtifacts.CRATE_SHAPES');
const DEFAULT = p.run('GameDisplayArtifacts.CRATE_SHAPES_DEFAULT');
const SHAPES = p.ui.crateShapes;   // this game's pairing, which every crate draw follows
const SHADES = p.run('GameDisplayArtifacts.CRATE_SHADES');
const TRIM = p.run('GameDisplayArtifacts.CRATE_TRIM');
const BIG = p.run('GameDisplayArtifacts.BIG_CRATE_SCALE');
const BAG_OUTLINE = p.run('GameDisplayArtifacts.BAG_OUTLINE_WIDTH');
const COUNTER = p.run('GameDisplayArtifacts.COUNTER_SIZE');
const DRAWER = { cube: 'drawCube', cylinder: 'drawCylinder', strapped: 'drawStrapped', bag: 'drawBag' };

check('CRATE_SHAPES lists the four shapes, each with a drawer', SHAPE_LIST.length === 4 && new Set(SHAPE_LIST).size === 4
    && SHAPE_LIST.every(s => s in DRAWER && typeof p.ui[DRAWER[s]] === 'function'));
check('CRATE_SHAPES_DEFAULT covers every CRATE_COLORS entry and nothing else',
    COLORS.length === Object.keys(DEFAULT).length && COLORS.every(c => c in DEFAULT));
check('the default pairing: red cube, green cylinder, blue strapped, yellow bag',
    DEFAULT.red === 'cube' && DEFAULT.green === 'cylinder' && DEFAULT.blue === 'strapped' && DEFAULT.yellow === 'bag');
check('the game\'s pairing: every color a different one of the shapes', COLORS.length === Object.keys(SHAPES).length
    && COLORS.every(c => SHAPE_LIST.includes(SHAPES[c])) && new Set(COLORS.map(c => SHAPES[c])).size === COLORS.length);

// A 2D context that logs every call ([name, ...args]) and every fillStyle / strokeStyle set;
// a gradient logs its stop colors as fills; each stroke logs the lineWidth and strokeStyle it ran with.
function recorder() {
    const log = [], fills = [], strokes = [];
    const ctx = new Proxy({}, {
        get: (t, k) => (k in t ? t[k] : (...args) => {
            log.push([k, ...args]);
            if (k === 'stroke') strokes.push({ width: t.lineWidth, style: t.strokeStyle });
            if (k === 'createLinearGradient' || k === 'createRadialGradient') return { addColorStop: (o, c) => fills.push(c) };
            return undefined;
        }),
        set: (t, k, v) => { if (k === 'fillStyle' && typeof v === 'string') fills.push(v); t[k] = v; return true; },
    });
    return { ctx, log, fills, strokes };
}

// The drawers each color's crate calls, in order: the strapped cube is the cube with straps on.
const EXPECT = { cube: ['cube'], cylinder: ['cylinder'], strapped: ['strapped', 'cube'], bag: ['bag'] };
const callsAre = shape => calls.map(c => c[0]).join() === EXPECT[shape].join();

// Spy on the four drawers on this ui instance: each call logged as [shape, g].
const calls = [];
for (const [shape, name] of Object.entries(DRAWER)) {
    const orig = p.ui[name];
    p.ui[name] = function (g) { calls.push([shape, g]); return orig.call(this, g); };
}
const named = shape => calls.filter(c => c[0] === shape);

// The x/y extents a draw reaches: path points and ellipse/rect bounds (curve control points
// left out, and anything drawn under a clip, which the clip keeps inside).
function extents(log) {
    const xs = [], ys = [];
    const pt = (x, y) => { xs.push(x); ys.push(y); };
    const clipped = [false];
    for (const [k, ...a] of log) {
        if (k === 'save') clipped.push(clipped[clipped.length - 1]);
        else if (k === 'restore') clipped.pop();
        else if (k === 'clip') clipped[clipped.length - 1] = true;
        if (clipped[clipped.length - 1]) continue;
        if (k === 'moveTo' || k === 'lineTo') pt(a[0], a[1]);
        else if (k === 'quadraticCurveTo') pt(a[2], a[3]);
        else if (k === 'bezierCurveTo') pt(a[4], a[5]);
        else if (k === 'rect') { pt(a[0], a[1]); pt(a[0] + a[2], a[1] + a[3]); }
        else if (k === 'ellipse') { pt(a[0] - a[2], a[1] - a[3]); pt(a[0] + a[2], a[1] + a[3]); }
    }
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

const cx = 200, cy = 100;
const sizes = {};
const cubeOutline = {}, bagStrokes = {};   // per kind: the widths a cube's strokes used; a bag's strokes
for (const color of COLORS) {
    for (const kind of ['crate', 'bigcrate']) {
        const rec = recorder();
        p.ui.ctx = rec.ctx;
        calls.length = 0;
        p.ui.drawPiece(cx, cy, { kind, color, label: 'x' }, 1, 1);
        const shape = SHAPES[color];
        const own = named(shape);
        check(`a ${color} ${kind} calls its ${shape} drawer once (and only what it builds on)`, callsAre(shape) && own.length === 1);
        const g = own[0] && own[0][1];
        const w = COUNTER * (kind === 'bigcrate' ? BIG : 1) * 0.45;
        check(`a ${color} ${kind}: drawn at its size (${kind === 'bigcrate' ? 'BIG_CRATE_SCALE × ' : ''}a crate's), centred`,
            g && Math.abs(g.w - w) < 1e-9 && g.cx === cx && g.cy === cy);
        (sizes[color] ||= {})[kind] = g && g.w;
        const sh = SHADES[color];
        check(`a ${color} ${kind} fills with its color's top, left and right shades`, [sh.top, sh.left, sh.right].every(f => rec.fills.includes(f)));
        const e = extents(rec.log);
        const pad = w * 0.05;
        check(`a ${color} ${kind} stays in the cube's footprint (cx ± w, cy ± w)`,
            e.minX >= cx - w - pad && e.maxX <= cx + w + pad && e.minY >= cy - w - pad && e.maxY <= cy + w + pad);
        check(`a ${color} ${kind} puts the context back (save/restore balanced)`,
            rec.log.filter(l => l[0] === 'save').length === rec.log.filter(l => l[0] === 'restore').length);
        // What tells each shape apart in the drawing itself.
        const n = k => rec.log.filter(l => l[0] === k).length;
        const tell = {
            cube: () => n('fill') === 3 && n('ellipse') === 0 && n('bezierCurveTo') === 0,
            cylinder: () => n('ellipse') >= 3 && n('bezierCurveTo') === 0,
            strapped: () => rec.fills.includes(TRIM.strap) && rec.fills.includes(TRIM.buckle) && n('ellipse') === 0,
            bag: () => n('bezierCurveTo') >= 2 && n('quadraticCurveTo') >= 1 && n('clip') === 1,
        }[shape];
        check(`a ${color} ${kind} draws its ${shape} shape on the canvas`, tell());
        if (shape === 'cube') cubeOutline[kind] = new Set(rec.strokes.map(s => s.width));
        if (shape === 'bag') bagStrokes[kind] = rec.strokes;
    }
}
// The bag's outline against the cube's: its first stroke is the body's silhouette, its last the cord.
for (const kind of ['crate', 'bigcrate']) {
    const cube = cubeOutline[kind], bag = bagStrokes[kind];
    const plain = cube && cube.size === 1 ? [...cube][0] : NaN;
    const scale = kind === 'bigcrate' ? BIG : 1;
    check(`a cube ${kind} strokes every edge at one outline width`, Number.isFinite(plain));
    check(`a bag ${kind}'s outer outline is BAG_OUTLINE_WIDTH (${BAG_OUTLINE}) × ${scale === 1 ? '' : 'BIG_CRATE_SCALE × '}the cube's outline, in the outline color`,
        BAG_OUTLINE > 1 && bag && Math.abs(bag[0].width - plain * BAG_OUTLINE * scale) < 1e-9 && bag[0].style === TRIM.outline);
    const details = bag ? bag.slice(1, -1) : [];
    check(`a bag ${kind}'s folds and tuft keep the cube's outline width, then its cord in CRATE_TRIM.cord`,
        details.length >= 3 && details.every(s => s.width === plain) && bag[bag.length - 1].style === TRIM.cord);
}
check('every big crate is BIG_CRATE_SCALE × its color\'s crate', COLORS.every(c => Math.abs(sizes[c].bigcrate / sizes[c].crate - BIG) < 1e-9));

// The board: a crate of each color, and a big one, on the live board's render.
const land = [...p.state.hexes.values()].filter(h => h.terrain === p.run('GameArtifacts.TERRAIN.PLAINS')
    && !p.state.pieces.some(o => o.q === h.q && o.r === h.r));
p.state.pieces = p.state.pieces.filter(o => o.kind === 'gremlin');
COLORS.forEach((color, i) => {
    p.state.pieces.push({ id: 900 + i, kind: 'crate', color, label: 'x', q: land[i].q, r: land[i].r });
    p.state.pieces.push({ id: 950 + i, kind: 'bigcrate', color, label: 'x', q: land[10 + i].q, r: land[10 + i].r });
});
p.ui.ctx = recorder().ctx;
calls.length = 0;
p.ui.render();
check('the board draws each color\'s crates with its own shape (two each: crate and big crate)',
    COLORS.every(c => named(SHAPES[c]).filter(([, g]) => g.shades === SHADES[c]).length === 2)
    && calls.every(([shape, g]) => EXPECT[SHAPES[COLORS.find(c => SHADES[c] === g.shades)]].includes(shape)));

// Help's World page draws through the same drawPiece (worldPicture).
for (const color of COLORS) {
    calls.length = 0;
    p.ui.worldPicture([{ terrain: p.run('GameArtifacts.TERRAIN.PLAINS'), piece: 'bigcrate', color }], 64);
    check(`Help's World picture of a ${color} big crate draws a ${SHAPES[color]}`, callsAre(SHAPES[color]));
}
done();

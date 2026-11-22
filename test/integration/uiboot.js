// test/integration/uiboot.js — boot the real UI against a stub DOM (runs with the suite).
//
// Loads every script index.html loads, in order, into a vm with a fake document, canvas,
// and requestAnimationFrame, then drives the UI through clicks and keys: pick a board size
// from the intro, pick each card, turn the ghost, place, select and rotate, remove the selected Thing with D, wait, run tick animations to completion,
// play to the first milestone (checking that no two pieces are ever drawn on one hex at a hop,
// D-38), drive the color picker (D-32), the Mover's pick-up and carry (D-47), the Bomb's booms (D-48), the map-scale buttons (D-40), the Help and About pagers (D-60, D-61, D-59), the sorry page a phone gets (D-41), the crash screen (D-63), the save around the sign-in redirect (D-67: saved, then restored in a fresh page), Sign out (D-69: a signed-in page signs out mid-game), and telemetry (D-65: the page is
// stamped as a ship build, so its recorder sends; the intro sends nothing, the milestone game's
// records are checked). Catches runtime errors in rendering and input wiring without a
// browser. It can't judge how anything looks; that stays manual (U-rows).
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { check, done } = require('../helpers/check');
const { memoryStorage } = require('../helpers/page');

const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);

// A 2D context where every method is a no-op and every property is settable.
function fakeCtx() {
    return new Proxy({}, {
        get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })),
        set: (t, k, v) => { t[k] = v; return true; },
    });
}

function fakeEl(tag) {
    const el = {
        tagName: tag, children: [], style: {}, dataset: {}, disabled: false, textContent: '', width: 0, height: 0,
        listeners: {},
        classList: { set: new Set(), toggle(c, on) { on ? this.set.add(c) : this.set.delete(c); }, add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); } },
        addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
        fire(type, ev = {}) { for (const fn of this.listeners[type] || []) fn({ preventDefault() {}, target: this, ...ev }); },
        appendChild(c) { this.children.push(c); return c; },
        closest: () => null,
        getContext: () => fakeCtx(),
        querySelector(sel) {
            this._q ||= {};
            return (this._q[sel] ||= fakeEl(sel));
        },
    };
    Object.defineProperty(el, 'innerHTML', { set() { el.children = []; el._q = {}; }, get: () => '' });
    return el;
}

const els = {};
const docListeners = {};
const document = {
    getElementById: id => (els[id] ||= fakeEl(id)),
    createElement: tag => fakeEl(tag),
    documentElement: fakeEl('html'),
    visibilityState: 'visible',
    addEventListener: (t, fn) => (docListeners[t] ||= []).push(fn),
};
// This page is a ship build on the live site, so telemetry (D-65) records and sends: every
// fetch and beacon it makes is kept here.
const TEST_VERSION = 'test1234';
document.documentElement.dataset.version = TEST_VERSION;
const posted = [], beaconed = [];
let uuids = 0;
let selectedText = '';   // what window.getSelection() holds
let rafQueue = [];
let clock = 0;
// The page rolls each board's seed with Math.random; seed that too, so every run plays the
// same boards and the whole-game check below can't flake on an unlucky one.
const UI_RANDOM_SEED = 1;   // any seed whose boards the simple bot below can win
let rnd = UI_RANDOM_SEED >>> 0;
const seededMath = Object.create(Math, { random: { value: () => {   // mulberry32
    rnd = (rnd + 0x6D2B79F5) >>> 0;
    let t = rnd;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
} } });
// setTimeout runs on the same fake clock: a timer fires once `clock` passes its due time.
let timers = [];
let timerId = 0;
const fakeSetTimeout = (fn, ms) => { timers.push({ id: ++timerId, due: clock + ms, fn }); return timerId; };
const fakeClearTimeout = id => { timers = timers.filter(t => t.id !== id); };
const fireDueTimers = () => {
    const due = timers.filter(t => t.due <= clock);
    timers = timers.filter(t => t.due > clock);
    due.forEach(t => t.fn());
};
const windowListeners = {};
const ctx = vm.createContext({
    console, document, Math: seededMath, JSON, Number, String, Array, Map, Set, Object, Proxy, parseInt, Float64Array, URLSearchParams,
    window: {
        innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
        getSelection: () => ({ toString: () => selectedText }),
        addEventListener: (t, fn) => (windowListeners[t] ||= []).push(fn),
    },
    performance: { now: () => clock },
    requestAnimationFrame: fn => rafQueue.push(fn),
    setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout,
    AudioContext: undefined,
    location: { protocol: 'https:', hostname: 'ttdat.yuwakisa.com', origin: 'https://ttdat.yuwakisa.com', href: 'https://ttdat.yuwakisa.com/' },
    navigator: { userAgent: 'UiBoot/1.0', sendBeacon: (url, body) => { beaconed.push({ url, batch: JSON.parse(body) }); return true; } },
    fetch: (url, init) => { posted.push({ url, init, batch: JSON.parse(init.body) }); return Promise.resolve({ status: 204 }); },
    crypto: { randomUUID: () => 'uuid-' + (++uuids) },
});
// GameSound needs an AudioContext; give it a silent one.
const SilentAudio = class {
    constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; }
    createPeriodicWave() { return {}; }
    createOscillator() { return { setPeriodicWave() {}, frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    resume() {}
};
ctx.window.AudioContext = ctx.AudioContext = SilentAudio;

const sourceOf = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pageSource = scripts.map(sourceOf).join('\n;\n');
let error = null;
try {
    const src = pageSource + '\n;globalThis.__ui = ui;';
    vm.runInContext(src, ctx, { filename: 'page.js' });
} catch (e) { error = e; }
check('every script loads and the UI starts' + (error ? ': ' + error.stack : ''), !error);
if (error) done();

const ui = ctx.__ui;
const canvas = els.game;
const key = k => windowListeners.keydown.forEach(fn => fn({ key: k, shiftKey: false, preventDefault() {} }));
const clickHex = (q, r) => {
    const { x, y } = ui.hexToScreen(q, r);
    canvas.fire('mousemove', { clientX: x, clientY: y });
    canvas.fire('mousedown', { button: 0, clientX: x, clientY: y });
    windowListeners.mouseup.forEach(fn => fn({ button: 0, clientX: x, clientY: y, preventDefault() {} }));
};
// Run queued animation frames until the tick animation is finished.
const settle = () => {
    for (let i = 0; i < 500 && (rafQueue.length || ui.anim); i++) {
        clock += 50;
        const q = rafQueue; rafQueue = [];
        // Like a browser, hand rAF the frame-start time, which can be earlier than the
        // performance.now() the animation was started with.
        q.forEach(fn => fn(clock - 60));
    }
};
// Advance the clock `ms`, firing animation frames and timers as a browser would.
const advance = ms => {
    for (let t = 0; t < ms; t += 50) {
        clock += 50;
        const q = rafQueue; rafQueue = [];
        q.forEach(fn => fn(clock - 60));
        fireDueTimers();
    }
};

// The tick animation on screen, hop by hop: the first hop at which two pieces are drawn on one
// hex (tracked pieces still on the board, plus every untracked piece sitting still), or null.
// A tracked piece is gone from its last point once it ends; a shot passing over (its move's
// first `over` hexes) doesn't count (D-38).
const trackOverlap = () => {
    const a = ui.anim;
    if (!a) return null;
    const still = ui.state.pieces.filter(p => !a.tracks.has(p.id) && !a.hidden.has(p.id));
    const last = Math.max(0, ...[...a.tracks.values()].map(t => t.pts.length - 1));
    for (let k = 0; k <= last; k++) {
        const at = new Set(still.map(p => p.q + ',' + p.r));
        for (const t of a.tracks.values()) {
            const end = t.pts.length - 1;
            if ((t.end && k >= end) || (k >= t.hop && k < t.hop + t.over)) continue;
            const p = t.pts[Math.min(k, end)], key = p.q + ',' + p.r;
            if (at.has(key)) return `hop ${k}, hex ${key}`;
            at.add(key);
        }
    }
    return null;
};

const run = (label, fn) => {
    try { fn(); check(label, true); } catch (e) { check(label + ': ' + e.stack, false); }
};

run('the intro waits for a size: no board, and clicks and Space do nothing', () => {
    if (ui.overlay !== 'intro' || ui.state.hexes) throw new Error('expected the intro and no board');
    canvas.fire('mousedown', { button: 0, clientX: 10, clientY: 10 });
    windowListeners.mouseup.forEach(fn => fn({ button: 0, clientX: 10, clientY: 10, preventDefault() {} }));
    key(' '); key('Escape');
    if (ui.overlay !== 'intro') throw new Error('the intro closed without a size');
});
// nullhas-7q2s: the intro card doesn't cover the canvas, so the mouse reaches the bare canvas
// before any board exists. Hover, drag, wheel, leave, resize, timers and frames must not throw.
run('before a size is picked, early events on the bare canvas do nothing and throw nothing', () => {
    for (const [x, y] of [[10, 10], [640, 360], [1200, 700]]) canvas.fire('mousemove', { clientX: x, clientY: y });
    canvas.fire('mousedown', { button: 0, clientX: 10, clientY: 10 });
    canvas.fire('mousemove', { clientX: 200, clientY: 200 });   // a drag
    windowListeners.mouseup.forEach(fn => fn({ button: 0, clientX: 200, clientY: 200, preventDefault() {} }));
    canvas.fire('mousedown', { button: 2, clientX: 10, clientY: 10 });
    canvas.fire('wheel', { deltaY: 1 });
    canvas.fire('mouseleave');
    windowListeners.resize.forEach(fn => fn());
    for (const k of ['r', 'd', 'b', 'x', 'Enter', '9']) key(k);
    advance(500);
    if (ui.overlay !== 'intro' || ui.state.hexes || ui.hoveredHex || ui.running)
        throw new Error('early events must leave the intro up with no board, hover or Go');
});
run('a page left on the intro sends no telemetry: no record, timer, beacon or pagehide listener (D-65)', () => {
    advance(vm.runInContext('GameDisplayArtifacts.TELEMETRY_FLUSH_MS', ctx) * 2);
    (windowListeners.pagehide || []).forEach(fn => fn({}));
    if (posted.length || beaconed.length || windowListeners.pagehide || docListeners.visibilitychange || vm.runInContext('GameTelemetry.pending()', ctx) !== null)
        throw new Error('the intro must send nothing: ' + JSON.stringify({ posted: posted.length, beaconed: beaconed.length }));
});
run('a size from the intro opens Help on its Keys page; any key closes it', () => {
    key('1');
    if (!ui.state.hexes || ui.overlay !== 'help' || els['help-panel'].classList.set.has('hidden') || els['help-page-0'].classList.set.has('hidden'))
        throw new Error('the first game must open Help on its Keys page');
    key('2');
    if (ui.overlay || ui.picked || !els['help-panel'].classList.set.has('hidden'))
        throw new Error('a key must close the legend and do nothing else');
});
run('every size button builds its board; key 1 picks the first size', () => {
    const sizes = vm.runInContext('GameArtifacts.MAP_SIZES', ctx);
    const keys = Object.keys(sizes);
    if (els['intro-sizes'].children.length !== keys.length || els['new-sizes'].children.length !== keys.length)
        throw new Error('one button per size in each picker');
    keys.forEach((size, i) => {
        els['new-sizes'].children[i].fire('click');
        const { cols, rows } = sizes[size];
        if (ui.overlay || ui.state.size !== size || ui.state.hexes.size !== cols * rows) throw new Error('bad board for ' + size);
        ui.render();
        els['new-game'].fire('click');
        if (ui.overlay !== 'size') throw new Error('New Game did not open the size picker');
    });
    key('Escape');
    if (ui.overlay) throw new Error('Esc did not go back to the game');
    els['new-game'].fire('click'); key('1');
    if (ui.overlay || ui.state.size !== keys[0]) throw new Error('key 1 did not start a ' + keys[0] + ' game');
});
run('each card picks, the ghost turns, Esc puts it back', () => {
    for (const k of ['1', '2', '3']) {
        key(k);
        if (!ui.picked) throw new Error('no pick on ' + k);
        key('r');
        canvas.fire('wheel', { deltaY: 1 });
        key('Escape');
        if (ui.picked) throw new Error('Esc did not unpick');
    }
});
run('placing a Thing ticks and animates to completion', () => {
    const s = ui.state, turn = s.turn;
    key('1');
    const [k] = ui.picked.legal;
    const [q, r] = k.split(',').map(Number);
    clickHex(q, r);
    settle();
    if (s.turn !== turn + 1) throw new Error('no tick');
    if (ui.anim) throw new Error('animation never finished');
});
run('D removes the selected Thing, never the hovered one; with no selection it does nothing (D-39)', () => {
    const s = ui.state, e = ui.engine;
    const placeBelt = () => {
        s.hand[0] = { kind: 'BELT' };
        key('1');
        const k = [...ui.picked.legal].find(k => !e.thingAt(...k.split(',').map(Number)));
        const [q, r] = k.split(',').map(Number);
        clickHex(q, r); settle();
        if (!e.thingAt(q, r)) throw new Error('belt not placed');
        return { q, r };
    };
    const a = placeBelt(), b = placeBelt();
    const hover = h => { const { x, y } = ui.hexToScreen(h.q, h.r); canvas.fire('mousemove', { clientX: x, clientY: y }); };
    // No selection: D over a Thing removes nothing and doesn't tick.
    if (ui.selected) throw new Error('nothing should be selected yet');
    let turn = s.turn;
    hover(b); key('d'); settle();
    if (!e.thingAt(b.q, b.r) || s.turn !== turn) throw new Error('D with no selection must do nothing');
    // Select a, move the mouse onto b, press D: a goes, b stays, the selection clears.
    clickHex(a.q, a.r);
    if (!ui.selected || ui.selected.q !== a.q || ui.selected.r !== a.r) throw new Error('click did not select');
    hover(b); key('d'); settle();
    if (e.thingAt(a.q, a.r)) throw new Error('the selected Thing is still there');
    if (!e.thingAt(b.q, b.r)) throw new Error('the hovered Thing was removed');
    if (s.turn !== turn + 1) throw new Error('no tick');
    if (ui.selected) throw new Error('a remove must clear the selection');
    // D again with nothing selected: still nothing.
    turn = s.turn;
    key('d'); settle();
    if (!e.thingAt(b.q, b.r) || s.turn !== turn) throw new Error('D after the remove must do nothing');
});
run('Ctrl/Alt/Meta chords are ignored and not preventDefaulted (D-57)', () => {
    const s = ui.state, e = ui.engine;
    s.hand[0] = { kind: 'BELT' };
    key('1');
    const k = [...ui.picked.legal].find(k => !e.thingAt(...k.split(',').map(Number)));
    const [q, r] = k.split(',').map(Number);
    clickHex(q, r); settle();
    clickHex(q, r);   // select it (a second click would turn a mover; a Belt has no facing to turn)
    const turn = s.turn;
    for (const mod of ['ctrlKey', 'altKey', 'metaKey']) {
        let prevented = false;
        const ev = k2 => ({ key: k2, shiftKey: false, [mod]: true, preventDefault() { prevented = true; } });
        for (const k2 of ['d', 'D', ' ', 'Enter', '1', 'm', 'r', 'x']) windowListeners.keydown.forEach(fn => fn(ev(k2)));
        if (prevented) throw new Error(mod + ' chord was preventDefaulted');
        if (!e.thingAt(q, r) || s.turn !== turn || ui.picked) throw new Error(mod + ' chord acted');
    }
    key('Escape');
});
run('P saves the board as PNGs, clean, and puts the view back (D-58)', () => {
    const saved = [];
    const painted = [];
    const realCreate = document.createElement;
    ctx.URL = { createObjectURL: b => 'blob:' + b.name, revokeObjectURL() {} };
    document.createElement = tag => {
        const el = realCreate(tag);
        if (tag === 'canvas') {
            el.toBlob = cb => cb({ name: el.width + 'x' + el.height });
            painted.push(el);
        }
        if (tag === 'a') el.click = () => saved.push({ name: el.download, href: el.href });
        return el;
    };
    try {
        const s = ui.state;
        s.hand[0] = { kind: 'BELT' };
        key('1');   // a picked card: its ghost and legal hexes must stay out of the shots
        let ghostSeen = false;
        const realPaint = ui.paint;
        ui.paint = function (clean) { if (this.canvas !== canvas && !clean) ghostSeen = true; return realPaint.call(this, clean); };
        const before = { canvas: ui.canvas, ctx: ui.ctx, panX: ui.panX, panY: ui.panY, turn: s.turn };
        key('p');
        ui.paint = realPaint;
        const want = [`window-${canvas.width}x${canvas.height}`, 'og-1200x630', 'capsule-630x500', 'shot-1280x720'].map(n => `ttdat-${s.seed}-${s.turn}-${n}.png`);
        if (JSON.stringify(saved.map(d => d.name)) !== JSON.stringify(want)) throw new Error('saved ' + JSON.stringify(saved.map(d => d.name)));
        if (painted.length !== want.length || ghostSeen) throw new Error('each shot must be its own clean paint');
        if (ui.canvas !== before.canvas || ui.ctx !== before.ctx || ui.panX !== before.panX || ui.panY !== before.panY) throw new Error('the view was not put back');
        if (s.turn !== before.turn || !ui.picked) throw new Error('P must not tick or drop the card');
        if (!/Saved 4 screenshots/.test(ui.notice || '')) throw new Error('no saved note');
        key('Escape');
    } finally {
        document.createElement = realCreate;
    }
});
run('a hand card button click picks it', () => {
    const btn = els.cards.children[1];
    btn.fire('click');
    if (!ui.picked || ui.picked.slot !== 1) throw new Error('button did not pick');
    canvas.fire('mousedown', { button: 2 });
    if (ui.picked) throw new Error('right-click did not unpick');
});
run('Wait button ticks', () => {
    const s = ui.state, turn = s.turn;
    els['end-turn'].fire('click'); settle();
    if (s.turn !== turn + 1) throw new Error('expected one tick');
});
run('input is ignored mid-animation', () => {
    const s = ui.state;
    key(' ');
    const turn = s.turn;
    key(' ');   // animation still running: should do nothing
    if (s.turn !== turn) throw new Error('ticked during animation');
    settle();
});

// Play a full game through the UI: the sim bot's plan, executed with clicks.
run('the Discard spot throws away the picked card and ticks; X does too', () => {
    const s = ui.state;
    const things = s.things.length;
    let turn = s.turn;
    els.discard.fire('click');
    if (s.turn !== turn) throw new Error('Discard with no card picked must do nothing');
    key('2');
    if (!els.discard.classList.set.has('armed')) throw new Error('Discard not armed while a card is picked');
    els.discard.fire('click');
    if (s.turn !== turn + 1 || ui.picked || s.things.length !== things) throw new Error('Discard click did not discard');
    settle();
    turn = s.turn;
    key('1'); key('x');
    if (s.turn !== turn + 1 || ui.picked) throw new Error('X did not discard');
    settle();
});
run("a card's red X discards it at once; Shift+2 discards slot 2; a different picked card goes back first", () => {
    const s = ui.state;
    let turn = s.turn;
    s.hand[0] = { kind: 'BOMB' };   // not dealt yet, so the redraw replaces it
    els.cards.children[0].querySelector('.x').fire('click', { stopPropagation() {} });
    if (s.turn !== turn + 1 || ui.picked || s.hand[0].kind === 'BOMB') throw new Error('the red X did not discard its card');
    settle();
    turn = s.turn;
    s.hand[1] = { kind: 'BOMB' };
    key('1');
    windowListeners.keydown.forEach(fn => fn({ key: '@', code: 'Digit2', shiftKey: true, preventDefault() {} }));
    if (s.turn !== turn + 1 || ui.picked || s.hand[1].kind === 'BOMB') throw new Error('Shift+2 did not discard slot 2 (and put card 1 back)');
    settle();
});
run('a Rocket card draws, places, and its flight and splat animate', () => {
    const s = ui.state;
    s.hand[0] = { kind: 'ROCKET' };
    ui.render();
    key('1');
    const [k] = [...ui.picked.legal];
    clickHex(...k.split(',').map(Number));
    if (!s.things.some(t => t.kind === 'ROCKET')) throw new Error('Rocket not placed');
    settle();
    // Hand-feed an animation with a flight that splats a gremlin, as the engine reports it.
    const crate = s.pieces.find(p => p.kind === 'crate');
    const gremlin = s.pieces.find(p => p.kind === 'gremlin');
    if (crate && gremlin) {
        const before = new Map([crate, gremlin].map(p => [p.id, { q: p.q, r: p.r, color: p.color, label: p.label, kind: p.kind }]));
        ui.startAnim(before, { events: [
            { type: 'move', id: crate.id, path: [{ q: crate.q + 1, r: crate.r }, { q: crate.q + 2, r: crate.r }], hop: 1, over: 0 },
            { type: 'splat', id: gremlin.id, by: crate.id, trap: false, hop: 2 },
        ] });
        if (ui.anim.tracks.get(gremlin.id).pts.length !== 3) throw new Error('the hit gremlin must wait for the flier');
        settle();
    }
});
run('a Trap card places, and the tally shows ex-gremlins and trapped', () => {
    const s = ui.state;
    s.hand[0] = { kind: 'TRAP' };
    ui.render();
    key('1');
    const [k] = [...ui.picked.legal];
    clickHex(...k.split(',').map(Number));
    if (!s.things.some(t => t.kind === 'TRAP')) throw new Error('Trap not placed');
    settle();
    s.exGremlins = 7;
    s.trapped = 4;
    ui.updateHUD();
    if (String(els['ex-info'].textContent) !== '7') throw new Error('Ex-gremlins not in the tally');
    if (String(els['trap-info'].textContent) !== '4') throw new Error('Trapped not in the tally');
});
run('a game plays through the UI to the first milestone banner', () => {
    // Fresh board: earlier steps dropped random Things that this bot can't plan around.
    els['new-game'].fire('click'); key('1');
    const s = ui.state, e = ui.engine;
    const goal = vm.runInContext('GameArtifacts.FIRST_MILESTONE', ctx);
    // Count the places and waits the engine takes, for the telemetry check after.
    const engPlace = e.place, engWait = e.wait;
    let places = 0, waits = 0;
    e.place = (...a) => { places++; return engPlace.apply(e, a); };
    e.wait = (...a) => { waits++; return engWait.apply(e, a); };
    const sentBefore = posted.length;
    for (let i = 0; i < 2000 && s.delivered < goal; i++) {
        // Lay belts toward the target along a BFS path, else wait.
        const prev = new Map([[s.sources[0].q + ',' + s.sources[0].r, null]]);
        const queue = [s.sources[0]];
        while (queue.length) {
            const c = queue.shift();
            for (const n of e.board.neighbors(c.q, c.r)) {
                const k = n.q + ',' + n.r;
                if (prev.has(k) || !e.board.isPassable(n)) continue;
                prev.set(k, c); queue.push(n);
            }
        }
        const pathHexes = [];
        for (let c = s.targets[0]; c; c = prev.get(c.q + ',' + c.r)) pathHexes.unshift(c);
        let acted = false;
        for (let j = 0; j < pathHexes.length - 1 && !acted; j++) {
            const a = pathHexes[j], b = pathHexes[j + 1];
            const want = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].findIndex(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);
            const t = e.thingAt(a.q, a.r);
            if (t && t.facing !== null && t.facing !== want && t.kind === 'BELT') { clickHex(a.q, a.r); acted = true; break; }
            if (t) continue;
            const slot = s.hand.findIndex(card => card.kind === 'BELT');
            if (slot < 0) {
                // No belt: dump card 1 somewhere off the path (Wait never changes the hand).
                const onPath = new Set(pathHexes.map(h => h.q + ',' + h.r));
                key('1');
                const spot = [...ui.picked.legal].find(k => !onPath.has(k));
                if (!spot) { key('Escape'); break; }
                clickHex(...spot.split(',').map(Number));
                acted = true;
                break;
            }
            key(String(slot + 1));
            while (ui.facing !== want) key('r');
            clickHex(a.q, a.r);
            acted = true;
        }
        if (!acted) key(' ');
        const overlap = trackOverlap();
        if (overlap) throw new Error('two pieces drawn on one hex: ' + overlap);
        settle();
    }
    e.place = engPlace; e.wait = engWait;
    if (s.delivered < goal) throw new Error('no milestone in 2000 commands: ' + JSON.stringify({ src: s.sources, tgt: s.targets, things: s.things, pieces: s.pieces.map(p => [p.kind, p.q, p.r]), d: s.delivered, turn: s.turn, hand: s.hand }));
    // Telemetry (D-65): what this game sent plus what's still queued is its game record, one
    // place event per place (none for the waits) and one milestone record.
    const pending = vm.runInContext('GameTelemetry.pending()', ctx);
    const batches = [...posted.slice(sentBefore).map(x => x.batch), ...(pending ? [pending] : [])]
        .filter(b => b.games[0].seed === s.seed);
    const game = batches[0] && batches[0].games[0];
    const evs = batches.flatMap(b => b.events), mss = batches.flatMap(b => b.milestones);
    if (!game || game.size !== 'small' || game.version !== TEST_VERSION || game.rulesVersion !== vm.runInContext('GameArtifacts.RULES_VERSION', ctx) || game.userAgent !== 'UiBoot/1.0' || game.screen !== '1280x720@1')
        throw new Error('telemetry game record: ' + JSON.stringify(game));
    if (!batches.every(b => b.games[0].gameKey === game.gameKey && b.player === batches[0].player)) throw new Error('every batch must carry the game record and one player');
    if (!posted.slice(sentBefore).every(x => x.url === 'https://ttdat.yuwakisa.com/t' && x.init.keepalive)) throw new Error('batches go to the live endpoint with keepalive');
    if (waits === 0 || places === 0 || evs.length !== places || !evs.every(ev => ev.command === 'place' && ev.accepted && ev.args.kind && Number.isInteger(ev.args.q)))
        throw new Error(`telemetry events: ${evs.length} for ${places} places and ${waits} waits: ${JSON.stringify(evs.slice(0, 3))}`);
    if (!evs.every((ev, i) => i === 0 || ev.turn > evs[i - 1].turn)) throw new Error('event turns must rise');
    if (mss.length !== 1 || mss[0].milestone !== goal || mss[0].delivered < goal || mss[0].turn > s.turn) throw new Error('telemetry milestones: ' + JSON.stringify(mss));
    if (pending) {
        (windowListeners.pagehide || []).forEach(fn => fn({}));
        if (vm.runInContext('GameTelemetry.pending()', ctx) !== null || beaconed.length === 0 || beaconed[beaconed.length - 1].batch.games[0].gameKey !== game.gameKey)
            throw new Error('pagehide must beacon the rest');
    }
    const banner = els.milestone.classList.set;
    if (banner.has('hidden') || els['milestone-title'].textContent !== 'IT DOES THE THING') throw new Error('no milestone banner');
    // The small board's first milestone unlocks the Slide (R-49): the banner names it, and with
    // no color opened nothing stops play (D-30).
    const cardNames = els['milestone-cards'].children.filter(c => c.className === 'mcard').map(c => c.children[1].textContent);
    if (els['milestone-cards'].classList.set.has('hidden') || cardNames.join() !== 'Slide')
        throw new Error('banner cards: ' + cardNames.join());
    if (ui.overlay) throw new Error('a cards-only milestone must not open a panel: ' + ui.overlay);
    const turn = s.turn;
    key(' '); settle();
    if (s.turn !== turn + 1) throw new Error('play did not go on past the milestone');
    advance(4000);
    if (!banner.has('hidden')) throw new Error('banner never hid');
});
run('Go ticks on its own, holds while a card is picked, and Pause stops it', () => {
    els['new-game'].fire('click'); key('1');
    const s = ui.state;
    els.go.fire('click');
    if (els.go.textContent !== 'Pause') throw new Error('button did not flip to Pause');
    advance(3000);
    const ran = s.turn;
    if (ran < 4) throw new Error('only reached turn ' + ran);
    key('1');
    settle(); advance(1000);
    const held = s.turn;
    advance(1000);
    if (s.turn !== held) throw new Error('ticked while a card was picked');
    key('Escape');
    advance(1000);
    if (s.turn === held) throw new Error('did not resume after the card went back');
    els.go.fire('click');
    settle();
    const paused = s.turn;
    advance(2000);
    if (s.turn !== paused || els.go.textContent !== 'Go') throw new Error('Pause did not stop it');
});
run('Enter toggles Go: on, then off once the tick in flight finishes', () => {
    const s = ui.state;
    key('Enter');
    if (!ui.running || els.go.textContent !== 'Pause') throw new Error('Enter did not start Go');
    advance(2000);
    if (s.turn < 2) throw new Error('Go via Enter did not tick');
    const t = s.turn;
    key('Enter');
    if (ui.running || els.go.textContent !== 'Go') throw new Error('Enter did not stop Go');
    settle(); advance(2000);
    if (s.turn !== t) throw new Error('ticked again after Enter stopped Go');
});
run('Help shows the keys and holds Go; closing it lets Go pick up again', () => {
    els['new-game'].fire('click'); key('1');
    const s = ui.state;
    els.go.fire('click');
    advance(1000);
    els.help.fire('click');
    if (ui.overlay !== 'help' || els['help-panel'].classList.set.has('hidden')) throw new Error('Help did not show the keys');
    settle(); advance(500);
    const held = s.turn;
    advance(2000);
    if (s.turn !== held) throw new Error('ticked while Help was open');
    els['help-panel'].fire('click');
    if (ui.overlay) throw new Error('a click must close Help');
    advance(1000);
    if (s.turn === held || !ui.running) throw new Error('Go did not pick up after Help closed');
    els.go.fire('click'); settle();
});
run('Help is a pager (D-60, D-61): opens on Keys, → More keys (B onward, off Keys), → Special cards (the Pusher/Puller color, Mover and Bomb lines, off Keys), → Things (one row per card, its hover text), → World, → Goals and achievements (D-76), → at the end stays, ← back, a button click stays, any other key closes, Go picks up again', () => {
    els['new-game'].fire('click'); key('1');
    const s = ui.state;
    const shown = id => !els[id].classList.set.has('hidden');
    const page = () => [0, 1, 2, 3, 4, 5].filter(i => shown('help-page-' + i)).join();
    const count = n => { if (els['help-count'].textContent !== n + ' / 6') throw new Error('page count: ' + els['help-count'].textContent); };
    els.go.fire('click');
    advance(1000);
    els.help.fire('click');
    if (ui.overlay !== 'help' || page() !== '0' || !els['help-prev'].disabled || els['help-next'].disabled) throw new Error('Help must open on Keys, got ' + page());
    count(1);
    settle(); advance(500);
    const held = s.turn;
    // The stub DOM holds no markup, so the pages' lines are read from index.html.
    const pageHtml = i => html.slice(html.indexOf(`<div id="help-page-${i}"`), html.indexOf(`<div id="help-page-${i + 1}"`));
    key('ArrowRight');
    if (ui.overlay !== 'help' || page() !== '1' || els['help-prev'].disabled || els['help-next'].disabled) throw new Error('→ must turn to More keys');
    count(2);
    const MORE = { 'the B line': '<dt><kbd>B</kbd></dt>', 'the M line': '<dt><kbd>M</kbd> / Sound</dt>', 'the Map line': '<dt>Map 1 · 2 · ∞</dt>' };
    for (const [line, text] of Object.entries(MORE)) {
        check(`More keys (page 2) holds ${line}`, pageHtml(1).includes(text) && /<h1>More keys<\/h1>/.test(pageHtml(1)));
        check(`Keys no longer holds ${line}`, !pageHtml(0).includes(text));
    }
    key('ArrowRight');
    if (ui.overlay !== 'help' || page() !== '2' || els['help-prev'].disabled || els['help-next'].disabled) throw new Error('→ twice must turn to Special cards');
    count(3);
    const SPECIAL = { 'the Pusher/Puller color line': 'a Pusher or Puller: pick the crate color', 'the Mover line': '<dt>Mover</dt>', 'the Bomb line': '<span id="bomb-wipes">' };
    for (const [line, text] of Object.entries(SPECIAL)) {
        check(`Special cards (page 3) holds ${line}`, pageHtml(2).includes(text) && /<h1>Special cards<\/h1>/.test(pageHtml(2)));
        check(`Keys no longer holds ${line}`, !pageHtml(0).includes(text));
    }
    key('ArrowRight');
    if (ui.overlay !== 'help' || page() !== '3' || els['help-prev'].disabled || els['help-next'].disabled) throw new Error('→ three times must turn to Things');
    count(4);
    key('ArrowRight');
    if (ui.overlay !== 'help' || page() !== '4' || els['help-prev'].disabled || els['help-next'].disabled) throw new Error('→ four times must reach World');
    count(5);
    key('ArrowRight');
    if (ui.overlay !== 'help' || page() !== '5' || els['help-prev'].disabled || !els['help-next'].disabled) throw new Error('→ five times must reach Goals and achievements');
    count(6);
    key('ArrowRight');
    if (page() !== '5') throw new Error('→ on the last page must stay put');
    count(6);
    key('ArrowLeft'); key('ArrowLeft');
    const cards = vm.runInContext('GameArtifacts.CARDS', ctx);
    const looks = vm.runInContext('GameDisplayArtifacts.THING_LOOK', ctx);
    const rows = els['help-things'].children;
    if (rows.length !== cards.length) throw new Error(`Things must have one row per card: ${rows.length} vs ${cards.length}`);
    cards.forEach((kind, i) => {
        const [pic, text] = rows[i].children;
        const [name, does] = text.children;
        if (pic.tagName !== 'canvas' || name.textContent !== looks[kind].name || !does.textContent.startsWith(looks[kind].does))
            throw new Error(`row ${i} must be ${kind}'s tile, name and hover line`);
    });
    els['help-panel'].fire('click', { target: { closest: () => els['help-prev'] } });
    if (ui.overlay !== 'help') throw new Error('a click on a page button must not close Help');
    key('ArrowLeft'); key('ArrowLeft'); key('ArrowLeft');
    if (ui.overlay !== 'help' || page() !== '0') throw new Error('← must turn back to Keys');
    advance(2000);
    if (s.turn !== held) throw new Error('ticked while Help was open');
    key('q');
    if (ui.overlay || shown('help-panel')) throw new Error('another key must close Help');
    advance(1000);
    if (s.turn === held || !ui.running) throw new Error('Go did not pick up after Help closed');
    els.go.fire('click'); settle();
    els.help.fire('click'); key('ArrowRight'); key('Escape');
    els.help.fire('click');
    if (page() !== '0') throw new Error('Help must reopen on Keys');
    key('Escape');
});
run('Help\'s World page (D-61): one row per part of the world; every number in each line is the rules data\'s, gremlins named only in the Gremlin row', () => {
    const A = vm.runInContext('GameArtifacts', ctx);
    const parts = vm.runInContext('GameDisplayArtifacts.WORLD_LOOK', ctx);
    const shown = vm.runInContext('GameDisplayArtifacts.HELP_LADDER_SHOWN', ctx);
    const px = vm.runInContext('GameDisplayArtifacts.HELP_CARD_PX', ctx);
    const ladder = [A.nextMilestone(0)];
    while (ladder.length < shown) ladder.push(A.nextMilestone(ladder[ladder.length - 1]));
    const EXPECT = {
        CRATE: [],
        BIG_CRATE: [A.PIECES.bigcrate.value],
        GREMLIN: [],
        SLICK: [A.MAX_SLIDE],
        WATER: [],
        MILESTONE: [...ladder, Math.max(...Object.values(A.MAP_SIZES).map(m => m.colors))],
    };
    const rows = els['help-world'].children;
    check('World has one row per WORLD_LOOK entry', rows.length === parts.length);
    parts.forEach((part, i) => {
        const [picture, text] = rows[i].children;
        check(`${part.id}: ${part.id === 'MILESTONE' ? 'no picture, an empty slot keeping its text in line' : 'a picture'} in the picture column`,
            rows[i].children.length === 2 && (picture.tagName === 'canvas') === (part.id !== 'MILESTONE'));
        check(`${part.id}: the picture slot is HELP_CARD_PX wide, like the Things page's tiles`,
            part.id === 'MILESTONE' ? picture.style.width === px + 'px' : picture.width === px && picture.height === px);
        const [name, says] = text.children;
        check(`World row ${i} is ${part.id}`, name.textContent === part.name);
        check(`${part.id}'s expected numbers are listed in this test`, part.id in EXPECT);
        const said = (says.textContent.match(/\d+/g) || []).map(Number);
        check(`${part.id}: "${says.textContent}" says [${said}], rules say [${EXPECT[part.id]}]`, JSON.stringify(said) === JSON.stringify(EXPECT[part.id]));
        check(`${part.id}: gremlins named only in the Gremlin row`, /gremlin/i.test(name.textContent + ' ' + says.textContent) === (part.id === 'GREMLIN'));
    });
    check('the milestone ladder starts 10, 20, 50, 100', ladder.slice(0, 4).join() === '10,20,50,100');
});
run('About opens over the game and holds Go; < > and the arrow keys turn its pages; links, buttons and the version stay; another key or a click closes (D-59)', () => {
    els['new-game'].fire('click'); key('1');
    const s = ui.state;
    const shown = id => !els[id].classList.set.has('hidden');
    const page = () => [0, 1].filter(i => shown('about-page-' + i)).join();
    delete document.documentElement.dataset.version;   // this page is stamped for telemetry; About reads dev unstamped
    els.go.fire('click');
    advance(1000);
    els.about.fire('click');
    if (ui.overlay !== 'about' || !shown('about-panel')) throw new Error('About did not open');
    if (page() !== '0' || !els['about-prev'].disabled || els['about-next'].disabled) throw new Error('About must open on the credits page, got ' + page());
    if (els['about-version'].textContent !== 'dev') throw new Error('an unstamped page must read dev, got ' + els['about-version'].textContent);
    if (!shown('about-seed-part') || els['about-seed'].textContent !== String(s.seed)) throw new Error('the seed must show beside the version');
    const home = els['about-home'];
    if (home.href !== 'https://yuwakisa.com' || home.target !== '_blank' || home.rel !== 'noopener' || home.textContent !== 'yuwakisa.com') throw new Error('the way back must open yuwakisa.com in a new tab');
    if (shown('about-feedback-line')) throw new Error('the feedback line must stay hidden while its URL is empty');
    settle(); advance(500);
    const held = s.turn;
    advance(2000);
    if (s.turn !== held) throw new Error('ticked while About was open');
    els['about-next'].fire('click');
    if (ui.overlay !== 'about' || page() !== '1' || els['about-prev'].disabled || !els['about-next'].disabled) throw new Error('> must turn to the privacy page');
    if (els['about-count'].textContent !== '2 / 2') throw new Error('page count: ' + els['about-count'].textContent);
    els['about-prev'].fire('click');
    if (ui.overlay !== 'about' || page() !== '0') throw new Error('< must turn back to the credits');
    key('ArrowRight');
    if (ui.overlay !== 'about' || page() !== '1') throw new Error('→ must turn to the privacy page');
    key('ArrowRight');
    if (ui.overlay !== 'about' || page() !== '1') throw new Error('→ on the last page must stay put');
    key('ArrowLeft');
    if (ui.overlay !== 'about' || page() !== '0') throw new Error('← must turn back');
    els['about-panel'].fire('click', { target: { closest: () => home } });
    if (ui.overlay !== 'about') throw new Error('a click on a link, a button or the version must not close About');
    selectedText = 'dev';
    els['about-panel'].fire('click');
    selectedText = '';
    if (ui.overlay !== 'about') throw new Error('a click that ends a text selection must not close About');
    key('q');
    if (ui.overlay || shown('about-panel')) throw new Error('another key must close About');
    advance(1000);
    if (s.turn === held || !ui.running) throw new Error('Go did not pick up after About closed');
    els.go.fire('click'); settle();
    els.about.fire('click');
    els['about-panel'].fire('click');
    if (ui.overlay) throw new Error('a click elsewhere on the panel must close About');
    document.documentElement.dataset.version = 'abc1234';
    try {
        els.about.fire('click');
        if (els['about-version'].textContent !== 'abc1234') throw new Error('a stamped build must show its version');
        els['about-panel'].fire('click');
        if (ui.overlay) throw new Error('a click must close About');
    } finally {
        document.documentElement.dataset.version = TEST_VERSION;
    }
});
run('the Sound button and M flip the muted flag', () => {
    const before = ui.sound.isMuted();
    els.sound.fire('click');
    if (ui.sound.isMuted() === before) throw new Error('the Sound button did not flip the flag');
    if (els.sound.textContent !== (before ? 'Sound: on' : 'Sound: off')) throw new Error('label does not show the state');
    key('m');
    if (ui.sound.isMuted() !== before) throw new Error('M did not flip it back');
    if (els.sound.textContent !== (before ? 'Sound: off' : 'Sound: on')) throw new Error('label did not follow M');
});
run('Space while Go runs finishes the tick in flight, then stops', () => {
    els['new-game'].fire('click'); key('1');
    const s = ui.state;
    els.go.fire('click');
    advance(1000);
    for (let i = 0; i < 40 && !ui.anim; i++) advance(50);   // catch a tick mid-animation
    const t = s.turn;
    if (!ui.anim) throw new Error('expected a tick in flight');
    key(' ');
    if (els.go.textContent !== 'Go' || ui.running) throw new Error('Space did not turn Go off');
    settle(); advance(2000);
    if (s.turn !== t) throw new Error('ticked again after Space stopped Go');
    key(' '); settle(); advance(2000);
    if (s.turn !== t + 1) throw new Error('Space with Go off must do exactly one tick');
});
run('X during a tick animation waits for the tick, then discards; Esc before then cancels it', () => {
    els['new-game'].fire('click'); key('1');
    const s = ui.state;
    els.go.fire('click');
    advance(1000);
    for (let i = 0; i < 40 && !ui.anim; i++) advance(50);   // catch a tick mid-animation
    if (!ui.anim) throw new Error('expected a tick in flight');
    let t = s.turn;
    s.hand[1] = { kind: 'BOMB' };   // not dealt on a new game, so a redraw replaces it
    key('2'); key('x');
    if (s.turn !== t || !ui.picked || s.hand[1].kind !== 'BOMB') throw new Error('X discarded mid-animation');
    if (!ui.queue.has()) throw new Error('X was dropped, not queued');
    settle();
    if (s.turn !== t + 1 || ui.picked || s.hand[1].kind === 'BOMB') throw new Error('the queued X did not discard when the tick ended');
    advance(1000);
    for (let i = 0; i < 40 && !ui.anim; i++) advance(50);
    if (!ui.anim) throw new Error('expected a second tick in flight');
    t = s.turn;
    s.hand[1] = { kind: 'BOMB' };
    key('2'); key('x'); key('Escape');
    if (ui.picked || ui.queue.has()) throw new Error('Esc did not put the card back and drop the queued X');
    els.go.fire('click');   // Go off; the tick in flight finishes
    settle(); advance(2000);
    if (s.turn !== t || s.hand[1].kind !== 'BOMB') throw new Error('a discard ran after Esc');
});
run('Shift+2 and the red X during a tick animation wait for the tick, then discard; locked or under an overlay they do nothing', () => {
    els['new-game'].fire('click'); key('1');
    const s = ui.state;
    els.go.fire('click');
    advance(1000);
    for (let i = 0; i < 40 && !ui.anim; i++) advance(50);
    if (!ui.anim) throw new Error('expected a tick in flight');
    const t = s.turn;
    s.hand[1] = { kind: 'BOMB' };
    windowListeners.keydown.forEach(fn => fn({ key: '@', code: 'Digit2', shiftKey: true, preventDefault() {} }));
    if (s.turn !== t || s.hand[1].kind !== 'BOMB' || !ui.queue.has()) throw new Error('Shift+2 mid-animation must queue, not discard');
    els.go.fire('click');   // Go off; the tick in flight finishes, then the queued discard runs
    settle();
    if (s.turn !== t + 1 || s.hand[1].kind === 'BOMB') throw new Error('the queued Shift+2 did not discard when the tick ended');
    settle();
    const t2 = s.turn;
    ui.showHelp();
    els.cards.children[0].querySelector('.x').fire('click', { stopPropagation() {} });
    if (s.turn !== t2) throw new Error('the red X must do nothing under an overlay');
    ui.dismissOverlay();
    ui.picked = { slot: 0, card: 'MOVER', mode: 'carry', legal: new Set(), kind: 'BELT', color: 'white', from: { q: 0, r: 0 }, booms: [] };
    els.cards.children[1].querySelector('.x').fire('click', { stopPropagation() {} });
    if (s.turn !== t2 || !ui.picked) throw new Error('the red X must do nothing while the hand is locked');
    ui.picked = null;
});
run('a click selects a hex and holds Go; a second click turns its mover; a click elsewhere lets go', () => {
    els['new-game'].fire('click'); key('1');
    const s = ui.state;
    s.hand[0] = { kind: 'BELT' };
    key('1');
    const [k] = ui.picked.legal;
    const [q, r] = k.split(',').map(Number);
    clickHex(q, r); settle();
    const belt = ui.engine.thingAt(q, r);
    if (!belt) throw new Error('belt not placed');
    els.go.fire('click');
    advance(1000);
    clickHex(q, r);
    if (!ui.selected || ui.selected.q !== q || ui.selected.r !== r) throw new Error('click did not select');
    const facing = belt.facing;
    if (ui.engine.thingAt(q, r).facing !== facing) throw new Error('the first click must not turn it');
    settle(); advance(1000);
    const held = s.turn;
    advance(2000);
    if (s.turn !== held) throw new Error('ticked while a hex was selected');
    clickHex(q, r);
    if (ui.engine.thingAt(q, r).facing === facing) throw new Error('the second click did not turn it');
    if (s.turn !== held) throw new Error('turning must not tick');
    const other = [...s.hexes.values()].find(h => h.q !== q || h.r !== r);
    clickHex(other.q, other.r);
    if (ui.selected) throw new Error('a click elsewhere did not deselect');
    advance(1000);
    if (s.turn === held) throw new Error('Go did not resume after deselecting');
    els.go.fire('click'); settle();
});
run('a newly opened color or unlocked card shows a panel that holds Go until a click or any key', () => {
    const s = ui.state;
    const opened = () => ui.startAnim(new Map(), { events: [{ type: 'open', color: 'red', source: s.sources[0], target: s.targets[0] }] });
    els.go.fire('click');
    settle();
    opened(); settle();
    if (ui.overlay !== 'news' || els['news-panel'].classList.set.has('hidden')) throw new Error('no new-color panel');
    if (els['news-title'].textContent !== 'Red crates!') throw new Error('panel title: ' + els['news-title'].textContent);
    const held = s.turn;
    advance(2000);
    if (s.turn !== held) throw new Error('Go ticked behind the panel');
    key('1');
    if (ui.overlay || ui.picked) throw new Error('a key must close the panel and do nothing else');
    advance(1000);
    if (s.turn === held) throw new Error('Go did not resume after the panel closed');
    els.go.fire('click'); settle();
    opened(); settle();
    els['news-panel'].fire('click');
    if (ui.overlay || !els['news-panel'].classList.set.has('hidden')) throw new Error('a click must close the panel');
    // A color and cards at once (a medium board's first milestone): one panel names both.
    ui.startAnim(new Map(), { events: [{ type: 'open', color: 'red', source: s.sources[0], target: s.targets[0] },
        { type: 'unlock', kinds: ['PUSHER', 'PULLER'] }] });
    settle();
    if (ui.overlay !== 'news' || els['news-title'].textContent !== 'Red crates!' || !/Pusher.*Puller/.test(els['news-sub'].textContent))
        throw new Error('color + cards panel: ' + els['news-title'].textContent + ' / ' + els['news-sub'].textContent);
    key('x');
    // Two milestones crossed at once, cards only: one banner covers both and names every card.
    ui.startAnim(new Map(), { events: [{ type: 'milestone', count: 50 }, { type: 'unlock', kinds: ['SPRING'] },
        { type: 'milestone', count: 100 }, { type: 'unlock', kinds: ['ROCKET'] }] });
    settle();
    if (ui.overlay) throw new Error('cards alone must not open the panel');
    const named = els['milestone-cards'].children.filter(c => c.className === 'mcard').map(c => c.children[1].textContent);
    if (els['milestone-title'].textContent !== '100 crates!' || !els['milestone-sub'].textContent.startsWith('passed 50 and 100')
        || named.join() !== 'Spring,Rocket')
        throw new Error('two-milestone banner: ' + els['milestone-title'].textContent + ' / ' + els['milestone-sub'].textContent + ' / ' + named.join());
    // The last unlock step, the Cannon (R-49, D-36): named on the banner, and on the panel with its
    // verb line when a color opens with it.
    ui.startAnim(new Map(), { events: [{ type: 'milestone', count: 100 }, { type: 'unlock', kinds: ['CANNON'] }] });
    settle();
    const last = els['milestone-cards'].children.filter(c => c.className === 'mcard').map(c => c.children[1].textContent);
    if (ui.overlay || last.join() !== 'Cannon') throw new Error('Cannon banner: ' + last.join());
    ui.startAnim(new Map(), { events: [{ type: 'open', color: 'red', source: s.sources[0], target: s.targets[0] },
        { type: 'unlock', kinds: ['CANNON'] }] });
    settle();
    if (ui.overlay !== 'news' || !/Cannon \(lobs/.test(els['news-sub'].textContent))
        throw new Error('Cannon panel: ' + els['news-sub'].textContent);
    key('x');
});
run('a Pusher with one color open places at once in that color, no picker', () => {
    els['new-game'].fire('click'); key('1');
    const s = ui.state;
    s.hand[0] = { kind: 'PUSHER' };
    ui.render();
    if (els.cards.children[0].querySelector('.name').textContent !== 'Pusher') throw new Error('the card must read plain "Pusher"');
    key('1');
    const turn = s.turn;
    const [q, r] = [...ui.picked.legal][0].split(',').map(Number);
    clickHex(q, r);
    if (ui.overlay || s.turn !== turn + 1) throw new Error('expected a place and a tick, no picker');
    if (ui.engine.thingAt(q, r).color !== s.targets[0].color) throw new Error('not placed in the one open color');
    settle();
});
run('with two colors open, a Pusher asks for its color: pick, cancel three ways, keys and swatches', () => {
    els['new-game'].fire('click'); key('2');
    const s = ui.state, e = ui.engine;
    const second = vm.runInContext('GameArtifacts.CRATE_COLORS', ctx).find(c => c !== s.targets[0].color);
    const spot = [...s.hexes.values()].find(h => !h.isEdge && e.board.isPassable(h) && !e.isEndpoint(h) && !e.pieceAt(h.q, h.r));
    s.targets.push({ q: spot.q, r: spot.r, color: second, delivered: 0 });
    const colors = e.openColors();
    const pickPusher = () => {
        s.hand[0] = { kind: 'PUSHER' };
        ui.render();
        key('1');
        return [...ui.picked.legal][0].split(',').map(Number);
    };
    const [q, r] = pickPusher();
    const turn = s.turn;
    const open = () => {
        clickHex(q, r);
        if (ui.overlay !== 'color' || els['color-panel'].classList.set.has('hidden')) throw new Error('no color picker');
        if (s.turn !== turn || e.thingAt(q, r)) throw new Error('the picker must not place or tick');
        if (els['color-picker'].children.length !== colors.length) throw new Error('one swatch per open color');
    };
    const closed = how => {
        if (ui.overlay || ui.choosing || !els['color-panel'].classList.set.has('hidden')) throw new Error(how + ' did not close the picker');
        if (!ui.picked || s.turn !== turn || e.thingAt(q, r)) throw new Error(how + ' must keep the card picked and place nothing');
    };
    open(); key('Escape'); closed('Esc');
    open(); els['color-panel'].fire('contextmenu'); closed('right-click');
    open(); els['color-panel'].fire('click'); closed('a click off the swatches');
    open(); key('9'); key('r');
    if (ui.overlay !== 'color' || s.turn !== turn) throw new Error('other keys must do nothing while the picker is open');
    key('2');
    if (ui.overlay || ui.picked || s.turn !== turn + 1) throw new Error('key 2 did not place and tick');
    if (e.thingAt(q, r).kind !== 'PUSHER' || e.thingAt(q, r).color !== colors[1]) throw new Error('not placed in the second color');
    settle();
    // A swatch click places too; Go holds while the picker is open.
    els.go.fire('click');
    settle();   // Go's first tick finishes; a click waits for the animation
    const [q2, r2] = pickPusher();
    clickHex(q2, r2);
    if (ui.overlay !== 'color') throw new Error('no picker for the second Pusher');
    settle(); advance(500);
    const held = s.turn;
    advance(2000);
    if (s.turn !== held) throw new Error('Go ticked while the picker was open');
    els['color-picker'].children[0].fire('click', { stopPropagation() {} });
    if (ui.overlay || e.thingAt(q2, r2).color !== colors[0] || s.turn !== held + 1) throw new Error('a swatch click did not place in its color');
    advance(1000);
    if (s.turn === held + 1) throw new Error('Go did not resume after the pick');
    els.go.fire('click'); settle();
});
run('the Mover: Esc before a pick-up keeps the card, a bare hex does nothing, a pick-up carries the Thing, put down or scrapped (D-47)', () => {
    els['new-game'].fire('click'); key('1');
    const s = ui.state, e = ui.engine;
    const free = [...s.hexes.values()].filter(h => !h.isEdge && h.terrain === 1 && !e.isEndpoint(h) && !e.pieceAt(h.q, h.r));
    const [a, b, c] = free;
    s.things.push({ kind: 'BELT', color: 'white', q: a.q, r: a.r, facing: 0 });
    s.hand[0] = { kind: 'MOVER' };
    ui.render();
    if (els.cards.children[0].querySelector('.name').textContent !== 'Mover') throw new Error('the card must read "Mover"');
    const turn = s.turn;
    key('1');
    if (!ui.picked || ui.picked.mode !== 'pickup' || !ui.picked.legal.has(`${a.q},${a.r}`) || ui.picked.legal.has(`${b.q},${b.r}`))
        throw new Error('pick-up mode must offer exactly the Thing hexes');
    key('Escape');
    if (ui.picked || s.turn !== turn || s.hand[0].kind !== 'MOVER') throw new Error('Esc before a pick-up must keep the card, no tick');
    key('1');
    clickHex(b.q, b.r);
    if (!ui.picked || ui.picked.mode !== 'pickup' || s.turn !== turn) throw new Error('a bare hex must do nothing');
    clickHex(a.q, a.r);
    if (ui.picked.mode !== 'carry' || ui.picked.kind !== 'BELT' || s.turn !== turn || !e.thingAt(a.q, a.r))
        throw new Error('the pick-up must carry the Belt without a tick (the engine still holds it)');
    if (els.cards.children[0].querySelector('.name').textContent !== 'Belt') throw new Error('the spent card must show the carried Belt');
    key('2'); key(' '); key('b'); els['end-turn'].fire('click');
    if (ui.picked.slot !== 0 || ui.picked.mode !== 'carry' || s.turn !== turn) throw new Error('the hand, Wait and B are locked while carrying');
    key('r');
    const facing = ui.facing;
    clickHex(c.q, c.r);
    if (ui.picked || s.turn !== turn + 1 || e.thingAt(a.q, a.r) || e.thingAt(c.q, c.r).kind !== 'BELT' || e.thingAt(c.q, c.r).facing !== facing)
        throw new Error('the put-down must move the Belt in one tick');
    settle();
    // Pick it up again and back out with a right-click: scrapped, one tick.
    s.hand[1] = { kind: 'MOVER' };
    ui.render();
    key('2');
    clickHex(c.q, c.r);
    const { x, y } = ui.hexToScreen(c.q, c.r);
    canvas.fire('mousedown', { button: 2, clientX: x, clientY: y });
    if (ui.picked || s.turn !== turn + 2 || e.thingAt(c.q, c.r) || s.things.length) throw new Error('backing out of a carry must scrap the Thing and tick once');
    settle();
});
run('the Bomb: Esc before a boom keeps the card, each click blows its hex up at once with no tick, 5 booms or Esc end it in one tick (D-48)', () => {
    els['new-game'].fire('click'); key('1');
    const s = ui.state, e = ui.engine;
    const free = [...s.hexes.values()].filter(h => !h.isEdge && h.terrain === 1 && !e.isEndpoint(h) && !e.pieceAt(h.q, h.r) && !e.thingAt(h.q, h.r));
    const [a, b, c, d, f, g, bare] = free;
    s.things.push({ kind: 'BELT', color: 'white', q: a.q, r: a.r, facing: 0 },
        { kind: 'WALL', color: 'white', q: b.q, r: b.r, facing: null },
        { kind: 'TRAP', color: 'white', q: c.q, r: c.r, facing: null },
        { kind: 'TRAP', color: 'white', q: d.q, r: d.r, facing: null },
        { kind: 'WALL', color: 'white', q: f.q, r: f.r, facing: null },
        { kind: 'WALL', color: 'white', q: g.q, r: g.r, facing: null });
    const crate = e.addPiece('crate', a.q, a.r, s.targets[0].color);
    s.hand[0] = { kind: 'BOMB' };
    ui.render();
    if (els.cards.children[0].querySelector('.name').textContent !== 'Bomb') throw new Error('the card must read "Bomb"');
    const turn = s.turn, things = s.things.length, lost = s.lost;
    key('1');
    if (!ui.picked || ui.picked.mode !== 'pickup' || !ui.picked.legal.has(`${a.q},${a.r}`) || ui.picked.legal.has(`${bare.q},${bare.r}`))
        throw new Error('the armed Bomb must offer exactly the filled hexes');
    key('Escape');
    if (ui.picked || s.turn !== turn || s.hand[0].kind !== 'BOMB') throw new Error('Esc before a boom must keep the card, no tick');
    key('1');
    clickHex(bare.q, bare.r);
    if (!ui.picked || ui.picked.booms.length || ui.bursts.length || s.turn !== turn) throw new Error('a bare hex must do nothing');
    clickHex(a.q, a.r);
    if (ui.picked.mode !== 'bomb' || ui.picked.booms.length !== 1 || s.turn !== turn || !e.thingAt(a.q, a.r) || !e.pieceAt(a.q, a.r))
        throw new Error('the first boom must spend the card without a tick (the engine still holds the Belt and crate)');
    if (ui.bursts.length !== 1 || !ui.bursts[0].thing || !ui.bursts[0].piece) throw new Error('the first boom must burst the Belt and splat the crate at once');
    if (!ui.boomed(a.q, a.r) || /Belt|Crate/i.test(els['hover-info'].textContent)) throw new Error('a blown-up hex must draw cleared, gone from the hover bar');
    if (ui.picked.legal.has(`${a.q},${a.r}`)) throw new Error('a blown-up hex must leave the legal set');
    clickHex(a.q, a.r);
    if (ui.picked.booms.length !== 1) throw new Error('clicking a blown-up hex again must do nothing');
    if (!/4 more booms/.test(els.cards.children[0].querySelector('.does').textContent)) throw new Error('the spent card must show the booms left');
    advance(400);   // well over one hop (HOP_MS)
    if (ui.bursts.length) throw new Error('a boom\'s burst must play out over one hop');
    key('2'); key(' '); key('b'); els['end-turn'].fire('click');
    if (ui.picked.slot !== 0 || ui.picked.mode !== 'bomb' || s.turn !== turn) throw new Error('the hand, Wait and B are locked once the Bomb is spent');
    clickHex(b.q, b.r);
    if (ui.picked.booms.length !== 2 || s.turn !== turn || !e.thingAt(b.q, b.r)) throw new Error('the second boom must not send anything');
    clickHex(c.q, c.r); clickHex(f.q, f.r);
    if (!ui.picked || ui.picked.booms.length !== 4 || s.turn !== turn) throw new Error('the third and fourth booms must not send anything');
    clickHex(g.q, g.r);
    if (ui.picked || s.turn !== turn + 1 || [a, b, c, f, g].some(h => e.thingAt(h.q, h.r)) || s.things.length !== things - 5)
        throw new Error('the fifth boom must end the Bomb: five hexes cleared in one tick');
    if (e.pieceAt(a.q, a.r) === crate || s.lost !== lost + 1) throw new Error('the bombed crate must be gone and count as lost');
    const a2 = ui.anim;
    if (!a2 || a2.cleared.length || [...a2.tracks.keys()].includes(crate.id))
        throw new Error('the tick must not replay the bursts and splats the booms already showed');
    settle();
    // One boom, then a right-click: it ends on that one hex, one tick.
    s.hand[1] = { kind: 'BOMB' };
    ui.render();
    key('2');
    clickHex(d.q, d.r);
    const { x, y } = ui.hexToScreen(d.q, d.r);
    canvas.fire('mousedown', { button: 2, clientX: x, clientY: y });
    if (ui.picked || s.turn !== turn + 2 || e.thingAt(d.q, d.r)) throw new Error('backing out after a boom must end the Bomb and tick once');
    settle();
});
// Map scale (D-40): the 1 / 2 / 4 / ∞ buttons. One scale drives drawing and hit-testing, so
// screenToHex(hexToScreen(h)) must round-trip and clicks must land on the hex under them.
const zoomButton = label => els['zoom-buttons'].children.find(b => b.textContent === label);
const litZoom = () => els['zoom-buttons'].children.filter(b => b.classList.set.has('active')).map(b => b.textContent).join();
const roundTrips = () => [...ui.state.hexes.values()].every(h => {
    const { x, y } = ui.hexToScreen(h.q, h.r);
    const back = ui.screenToHex(x, y);
    return back.q === h.q && back.r === h.r;
});
const centerOnBoard = () => {
    const b = ui.boardBounds(), c = ui.centerWorld(ui.scale), eps = 1e-6;
    return c.x >= b.minX - eps && c.x <= b.maxX + eps && c.y >= b.minY - eps && c.y <= b.maxY + eps;
};
run('a refused click or key says why in the hover bar for a while, and a queued command shows no reason (D-55)', () => {
    els['new-game'].fire('click'); key('1');
    const s = ui.state, e = ui.engine;
    const bar = () => els['hover-info'].textContent;
    const water = [...s.hexes.values()].find(h => h.terrain === 0);
    const free = [...s.hexes.values()].find(h => !h.isEdge && h.terrain === 1 && !e.isEndpoint(h) && !e.pieceAt(h.q, h.r) && !e.thingAt(h.q, h.r));
    const turn = s.turn;
    key('d');
    if (bar() !== 'Select a Thing first, then D') throw new Error('D with nothing selected must say why, got: ' + bar());
    key('b'); // no hovered hex
    ui.hoveredHex = null; ui.notice = null; key('b');
    if (!/crate/.test(bar())) throw new Error('B with nothing under the cursor must say why, got: ' + bar());
    advance(3000);
    if (ui.notice) throw new Error('a reason must go away after a couple of seconds');
    key('1');
    clickHex(water.q, water.r);
    if (ui.picked || !/water/.test(bar())) throw new Error('a click on water must say why, got: ' + bar());
    if (s.turn !== turn) throw new Error('a refusal must not tick');
    advance(3000);
    // Mover pick-up on a bare hex, then carrying.
    s.things.push({ kind: 'BELT', color: 'white', q: free.q, r: free.r, facing: 0 });
    s.hand[0] = { kind: 'MOVER' }; ui.render();
    key('1');
    const bare = [...s.hexes.values()].find(h => !h.isEdge && h.terrain === 1 && !e.isEndpoint(h) && !e.thingAt(h.q, h.r) && !e.pieceAt(h.q, h.r) && !(h.q === free.q && h.r === free.r));
    clickHex(bare.q, bare.r);
    if (ui.picked.mode !== 'pickup' || bar() !== 'Pick a Thing to move') throw new Error('a bare hex in Mover pick-up must say why, got: ' + bar());
    clickHex(free.q, free.r);
    if (ui.picked.mode !== 'carry') throw new Error('the Mover must be carrying');
    key('2');
    if (bar() !== 'Put the Thing down or Esc first') throw new Error('the hand while carrying must say why, got: ' + bar());
    ui.notice = null;
    els['end-turn'].fire('click');
    if (bar() !== 'Put the Thing down or Esc first') throw new Error('Wait while carrying must say why');
    key('Escape'); settle();
    // A command queued during a tick is not a refusal.
    ui.notice = null;
    els['end-turn'].fire('click');
    if (!ui.anim) throw new Error('Wait must start a tick animation');
    key('d');
    if (ui.notice !== 'Select a Thing first, then D') throw new Error('D with nothing selected still says why mid-animation');
    ui.notice = null;
    ui.selected = { q: free.q, r: free.r };
    key('d');
    if (!ui.queue.has() || ui.notice) throw new Error('a queued remove must show no reason');
    settle();
});
run('the map-scale buttons set the scale, light up, keep the center, and round-trip hit-testing', () => {
    els['new-game'].fire('click'); key('1');
    if (els['zoom-buttons'].children.map(b => b.textContent).join() !== '1,2,∞') throw new Error('expected buttons 1, 2, ∞');
    if (ui.scale !== 1 || litZoom() !== '1') throw new Error('a new game must open at 1x');
    for (const [label, scale] of [['2', 0.5], ['1', 1]]) {
        const before = ui.centerWorld(ui.scale);
        zoomButton(label).fire('click');
        if (ui.scale !== scale || litZoom() !== label) throw new Error(`button ${label}: scale ${ui.scale}, lit ${litZoom()}`);
        const after = ui.centerWorld(ui.scale);
        if (Math.abs(after.x - before.x) > 1e-6 || Math.abs(after.y - before.y) > 1e-6) throw new Error(`button ${label} moved the center`);
        if (!roundTrips()) throw new Error('screenToHex(hexToScreen(h)) failed at ' + label);
    }
    zoomButton('∞').fire('click');
    if (!(ui.scale > 0 && ui.scale <= 1) || litZoom() !== '∞' || !roundTrips()) throw new Error('∞ on the small board: ' + ui.scale);
    if (!ui.readable(11) || !ui.readable(16)) throw new Error('at 1x 11px and 16px text must show');
    zoomButton('2').fire('click');
    if (ui.readable(11) || !ui.readable(16)) throw new Error('at 1/2 11px text hides, 16px text stays');
});
run('every crate color has a derived light shade for port marks; a source of 0, 1 or every color renders (D-42)', () => {
    const shades = vm.runInContext('GameDisplayArtifacts.CRATE_SHADES', ctx);
    const sum = hex => [1, 3, 5].reduce((n, i) => n + parseInt(hex.slice(i, i + 2), 16), 0);
    for (const [color, s] of Object.entries(shades)) {
        if (!/^#[0-9a-f]{6}$/.test(s.light)) throw new Error(`${color}: no light shade`);
        if (!(sum(s.light) > sum(s.left))) throw new Error(`${color}: light ${s.light} is not lighter than ${s.left}`);
    }
    const src = ui.state.sources[0], kept = src.colors;
    for (const colors of [[], [kept[0]], Object.keys(shades)]) {
        src.colors = colors;
        ui.render();
    }
    src.colors = kept;
});
run('at 1/2 a click selects and places on the right hex, a tick animates, and a drag cannot lose the board', () => {
    const s = ui.state, e = ui.engine;
    if (ui.scale !== 0.5) throw new Error('expected 1/2');
    const bare = [...s.hexes.values()].find(h => !e.thingAt(h.q, h.r));
    clickHex(bare.q, bare.r);
    if (!ui.selected || ui.selected.q !== bare.q || ui.selected.r !== bare.r) throw new Error('the click did not select its hex');
    key('Escape');
    s.hand[0] = { kind: 'BELT' };
    key('1');
    const [q, r] = [...ui.picked.legal].find(k => !e.thingAt(...k.split(',').map(Number))).split(',').map(Number);
    const turn = s.turn;
    clickHex(q, r);
    if (!e.thingAt(q, r) || e.thingAt(q, r).kind !== 'BELT' || s.turn !== turn + 1) throw new Error('the Belt did not land on the clicked hex');
    settle();
    if (ui.anim) throw new Error('the tick animation never finished at 1/2');
    canvas.fire('mousedown', { button: 0, clientX: 640, clientY: 360 });
    canvas.fire('mousemove', { clientX: 640 + 9000, clientY: 360 - 9000 });
    windowListeners.mouseup.forEach(fn => fn({ button: 0, clientX: 640 + 9000, clientY: 360 - 9000, preventDefault() {} }));
    if (!centerOnBoard()) throw new Error('a drag pushed the board off the screen');
});
run('∞ fits a 60×60 board above the hand; a new game opens at 1x', () => {
    const sizes = vm.runInContext('GameArtifacts.MAP_SIZES', ctx);
    const huge = Object.keys(sizes).find(k => sizes[k].cols === 60 && sizes[k].rows === 60);
    els['new-game'].fire('click'); els['new-sizes'].children[Object.keys(sizes).indexOf(huge)].fire('click');
    if (ui.state.size !== huge || ui.scale !== 1 || litZoom() !== '1') throw new Error('the huge board must open at 1x');
    const handTop = canvas.height - 120;
    els['hand'].getBoundingClientRect = () => ({ top: handTop });
    zoomButton('∞').fire('click');
    delete els['hand'].getBoundingClientRect;
    const reach = vm.runInContext('GameDisplayArtifacts.HEX_SIZE', ctx) * ui.scale;
    const off = [...ui.state.hexes.values()].find(h => {
        const { x, y } = ui.hexToScreen(h.q, h.r);
        return x - reach < -1e-6 || x + reach > canvas.width + 1e-6 || y - reach < -1e-6 || y + reach > handTop + 1e-6;
    });
    if (off || ui.scale >= 1 || litZoom() !== '∞') throw new Error('∞ left a hex off the canvas or under the hand: ' + JSON.stringify(off) + ' at ' + ui.scale);
    if (!roundTrips()) throw new Error('round-trip failed at the fit scale');
    key(' '); settle();
    if (ui.anim) throw new Error('the tick animation never finished at the fit scale');
    els['new-game'].fire('click'); key('1');
    if (ui.scale !== 1 || litZoom() !== '1') throw new Error('a new game must reset to 1x');
});
run('New Game asks for a size, then resets', () => {
    key(' '); settle();
    els['new-game'].fire('click');
    if (ui.overlay !== 'size' || ui.state.turn === 1) throw new Error('the picker must not reset the game yet');
    key('2');
    if (ui.state.turn !== 1 || ui.overlay) throw new Error('not reset');
});
// D-41: a fresh page per pointer kind, each with its own stub DOM. `media` is what
// window.matchMedia reports for the touch-only query, or undefined for no matchMedia at all.
// `opts.win` adds to the stub window, `opts.doc` to the stub document and `opts.globals` to the page's globals
// (location, fetch, crypto, …); `opts.version` stamps the page as a ship build; `opts.patch` is `{ before, src }`: source run just before the script `before` (D-63);
// a throw out of the page is kept as `thrown`, as a browser would report it to window 'error'.
function bootPointer(media, nav, opts = {}) {
    const pageEls = {};
    const listeners = {};
    const page = {
        getElementById: id => (pageEls[id] ||= fakeEl(id)),
        createElement: tag => fakeEl(tag),
        body: fakeEl('body'),
        documentElement: fakeEl('html'),
        ...opts.doc,
    };
    if (opts.version) page.documentElement.dataset.version = opts.version;
    const win = { location: { href: 'https://example.test/thing' }, innerWidth: 390, innerHeight: 844, getSelection: () => ({ toString: () => '' }), addEventListener: (t, fn) => (listeners[t] ||= []).push(fn), AudioContext: SilentAudio, ...opts.win };
    const asked = [];
    if (media !== undefined) win.matchMedia = q => { asked.push(q); return { matches: media, media: q }; };
    const pageCtx = vm.createContext({
        console, document: page, Math: seededMath, JSON, Number, String, Array, Map, Set, Object, Proxy, parseInt, Float64Array, URLSearchParams,
        window: win, performance: { now: () => clock }, requestAnimationFrame: () => {},
        setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout, AudioContext: SilentAudio,
        ...opts.globals,
    });
    if (nav) pageCtx.navigator = nav;
    const boot = '\n;globalThis.__boot = { get ui() { return ui; }, get state() { return state; }, get engine() { return engine; } };';
    const src = opts.patch === undefined ? pageSource
        : scripts.map(f => (f === opts.patch.before ? opts.patch.src + '\n;\n' : '') + sourceOf(f)).join('\n;\n');
    let thrown = null;
    try { vm.runInContext(src + boot, pageCtx, { filename: 'page.js' }); } catch (e) { thrown = e; }
    if (thrown && opts.patch === undefined) throw thrown;
    if (thrown) vm.runInContext(boot, pageCtx);
    return { boot: pageCtx.__boot, els: pageEls, body: page.body, listeners, asked, thrown, ctx: pageCtx };
}
run('a coarse pointer with no hover gets the sorry page: no intro, no game, no input (D-41)', () => {
    const p = bootPointer(true);
    if (p.asked[0] !== '(pointer: coarse) and (hover: none) and (not (any-pointer: fine))') throw new Error('asked matchMedia for ' + JSON.stringify(p.asked));
    if (p.boot.ui || p.boot.state || p.boot.engine) throw new Error('a touch-only page must not build a game');
    if (p.els['sorry-panel'].classList.set.has('hidden')) throw new Error('the sorry page must show');
    if (!p.body.classList.set.has('touch-only')) throw new Error('the body must hide every other panel (intro included)');
    if (p.els['sorry-picture'].children.length !== 1) throw new Error('the sorry page draws one Belt');
    if (p.els['intro-sizes']?.children.length) throw new Error('the intro size buttons must not be built');
    const input = Object.keys(p.listeners).filter(t => t !== 'error' && t !== 'unhandledrejection');   // the crash screen's (D-63)
    if (input.length) throw new Error('a touch-only page must not listen: ' + input);
});
run('the sorry page has Try it anyway (boots the game) and Copy link (share, else clipboard + note) (D-41)', () => {
    const p = bootPointer(true);
    p.els['sorry-anyway'].fire('click');
    if (!p.boot.ui || p.boot.ui.overlay !== 'intro') throw new Error('Try it anyway must boot to the intro');
    if (p.body.classList.set.has('touch-only') || !p.els['sorry-panel'].classList.set.has('hidden')) throw new Error('the sorry page must go away');
    if (!p.listeners.keydown) throw new Error('input must be wired after Try it anyway');
    const shared = [];
    const s = bootPointer(true, { share: o => (shared.push(o), Promise.resolve()), clipboard: { writeText: () => { throw new Error('share wins'); } } });
    s.els['sorry-copy'].fire('click');
    if (shared.length !== 1 || shared[0].url !== 'https://example.test/thing') throw new Error('navigator.share not used with the page URL');
    const written = [];
    const c = bootPointer(true, { clipboard: { writeText: t => (written.push(t), { then: ok => ok() }) } });
    c.els['sorry-copy'].fire('click');
    if (written[0] !== 'https://example.test/thing') throw new Error('clipboard not written');
    if (c.els['sorry-copied'].classList.set.has('hidden')) throw new Error('no copied note');
});
run('the intro has an About link with no seed yet; closing About goes back to the intro (D-59)', () => {
    const p = bootPointer(false);
    const pui = p.boot.ui;
    p.els['intro-about'].fire('click');
    if (pui.overlay !== 'about' || p.els['about-panel'].classList.set.has('hidden')) throw new Error('the intro link must open About');
    if (!p.els['about-seed-part'].classList.set.has('hidden')) throw new Error('no board yet, so no seed');
    p.listeners.keydown.forEach(fn => fn({ key: 'ArrowRight', preventDefault() {} }));
    if (pui.overlay !== 'about' || p.els['about-page-1'].classList.set.has('hidden')) throw new Error('→ must turn the page over the intro too');
    p.listeners.keydown.forEach(fn => fn({ key: 'Escape', preventDefault() {} }));
    if (pui.overlay !== 'intro' || p.els['intro-panel'].classList.set.has('hidden') || pui.state.hexes) throw new Error('closing About must go back to the intro');
});
run('a fine pointer, or no matchMedia at all, boots the game on the intro as before', () => {
    for (const media of [false, undefined]) {
        const p = bootPointer(media);
        if (!p.boot.ui || !p.boot.state || p.boot.ui.overlay !== 'intro') throw new Error('matchMedia ' + media + ': the intro must show');
        if (p.body.classList.set.has('touch-only') || p.els['sorry-picture']) throw new Error('matchMedia ' + media + ': no sorry page');
        if (!p.listeners.keydown) throw new Error('matchMedia ' + media + ': input must be wired');
    }
});
// D-63: the crash screen. An uncaught error (window 'error') or an unhandled rejection shows
// #crash-panel once, with the message and version/seed; Reload reloads; Start fresh removes only
// the saved-run key and reloads. It needs no GameUI.
function crashPage(media, patch) {
    const removed = [], reloads = [];
    const storage = {
        removeItem: k => removed.push(k),
        clear: () => { throw new Error('Start fresh must not clear localStorage'); },
        getItem: () => null, setItem: () => {},
    };
    const p = bootPointer(media, undefined, { patch, win: { localStorage: storage, location: { href: 'https://example.test/thing', reload: () => reloads.push(1) } } });
    // index.html starts the panel hidden; the stub DOM makes elements on first lookup, so nothing
    // may have looked it up yet, and it starts hidden here.
    if (p.els['crash-panel']) throw new Error('nothing may touch the crash screen before an error');
    p.els['crash-panel'] = fakeEl('crash-panel');
    p.els['crash-panel'].classList.add('hidden');
    const fire = (type, ev) => (p.listeners[type] || []).forEach(fn => fn(ev));
    const shown = () => !p.els['crash-panel'].classList.set.has('hidden');
    return { ...p, removed, reloads, fire, shown };
}
run('a thrown error shows the crash screen once, with the message, version and seed; later errors don\'t replace it (D-63)', () => {
    const p = crashPage(false);
    if (!p.listeners.error || !p.listeners.unhandledrejection) throw new Error('index.js must listen for error and unhandledrejection');
    const pui = p.boot.ui;
    p.els['intro-sizes'].children[0].fire('click');
    const seed = p.boot.state.seed;
    p.listeners.keydown.forEach(fn => fn({ key: 'Escape', preventDefault() {} }));   // close Help
    if (pui.overlay) throw new Error('Help should have closed');
    pui.running = true;
    pui.engine.wait = () => { throw new TypeError('wait broke'); };
    const keyListeners = p.listeners.keydown.length;
    let thrown = null;
    try { p.els['end-turn'].fire('click'); } catch (e) { thrown = e; }
    if (!thrown) throw new Error('the patched wait should have thrown');
    p.fire('error', { message: 'Uncaught TypeError: wait broke', error: thrown });
    if (!p.shown()) throw new Error('a thrown error must show the crash screen');
    if (p.els['crash-message'].textContent !== 'TypeError: wait broke') throw new Error('message: ' + p.els['crash-message'].textContent);
    if (p.els['crash-build'].textContent !== 'Version dev · Seed ' + seed) throw new Error('build line: ' + p.els['crash-build'].textContent);
    if (pui.running) throw new Error('Go must stop behind the crash screen');
    p.fire('error', { message: 'Script error.', error: null });
    p.fire('unhandledrejection', { reason: new Error('later') });
    if (p.els['crash-message'].textContent !== 'TypeError: wait broke') throw new Error('a later error must not replace the first');
    if (p.els['crash-reload'].listeners.click.length !== 1 || p.listeners.keydown.length !== keyListeners + 1) throw new Error('the crash screen must be wired once');
    let stopped = false;
    p.listeners.keydown[keyListeners]({ key: ' ', stopImmediatePropagation: () => { stopped = true; } });
    if (!stopped) throw new Error('keys must stop reaching the game behind the crash screen');
    p.els['crash-reload'].fire('click');
    if (p.reloads.length !== 1 || p.removed.length) throw new Error('Reload must reload and remove nothing');
    p.els['crash-fresh'].fire('click');
    const key = vm.runInContext('GameDisplayArtifacts.SAVE_KEY', p.ctx);
    if (p.reloads.length !== 2 || p.removed.length !== 1 || p.removed[0] !== key) throw new Error('Start fresh must remove only ' + key + ': ' + JSON.stringify(p.removed));
    if (key === 'thingfactory.muted' || !key.startsWith('thingfactory.')) throw new Error('the save key must be its own thingfactory.* key');
});
run('the crash screen works with no GameUI: a boot that throws, a script that throws as it loads, a rejection, the sorry page, no storage (D-63)', () => {
    const b = crashPage(false, { before: 'index.js', src: 'GameUI.prototype.start = function () { throw new Error("boot broke"); };' });
    if (!b.thrown) throw new Error('the patched boot should have thrown');
    b.fire('error', { message: 'Uncaught Error: boot broke', error: b.thrown });
    if (!b.shown() || b.els['crash-message'].textContent !== 'Error: boot broke' || b.els['crash-build'].textContent !== 'Version dev') throw new Error('a boot failure must show the crash screen with no seed');
    // A script that throws as it loads, before displayartifacts.js and index.js: Start fresh
    // still removes the saved-run key.
    const l = crashPage(false, { before: 'displayartifacts.js', src: 'throw new Error("load broke");' });
    if (!l.thrown || l.listeners.keydown) throw new Error('the patched load should have thrown before anything wired input');
    l.fire('error', { message: 'Uncaught Error: load broke', error: l.thrown });
    if (!l.shown() || l.els['crash-message'].textContent !== 'Error: load broke' || l.els['crash-build'].textContent !== 'Version dev') throw new Error('a load failure must show the crash screen with no seed');
    l.els['crash-fresh'].fire('click');
    const savedKey = vm.runInContext('GameDisplayArtifacts.SAVE_KEY', crashPage(false, undefined).ctx);
    if (l.reloads.length !== 1 || l.removed.join() !== savedKey) throw new Error('Start fresh before displayartifacts.js must remove ' + savedKey + ': ' + JSON.stringify(l.removed));
    const r = crashPage(false);
    r.fire('unhandledrejection', { reason: 'nope' });
    if (!r.shown() || r.els['crash-message'].textContent !== 'nope') throw new Error('an unhandled rejection must show the crash screen');
    const s = crashPage(true);
    if (s.boot.ui) throw new Error('the sorry page builds no UI');
    s.fire('error', { message: 'Script error.', error: null });
    if (!s.shown() || s.els['crash-message'].textContent !== 'Script error.') throw new Error('the crash screen must show over the sorry page');
    const n = bootPointer(false, undefined, { win: { location: { reload() { n.reloaded = true; } } } });
    Object.defineProperty(n.ctx.window, 'localStorage', { get() { throw new Error('denied'); } });
    n.listeners.error.forEach(fn => fn({ message: 'x', error: new Error('x') }));
    n.els['crash-fresh'].fire('click');
    if (!n.reloaded) throw new Error('Start fresh must still reload when storage throws');
});
// D-67: the save around the sign-in redirect. The main page plays some commands and saves; a
// fresh page with the same localStorage and the sign-in return marker in its URL picks the game
// up: same board, turn, tallies and hand, no intro or Help, and the save is gone.
run('saveForRedirect, then a fresh page on the sign-in return: the same game goes on, the save is gone (D-67)', () => {
    const store = memoryStorage(), stored = store.map;
    ctx.window.localStorage = store;
    // Play: a placement, a discard, some waits, and the map at half size.
    const slot = ui.state.hand.findIndex(c => vm.runInContext('GameArtifacts.THINGS', ctx)[c.kind]);
    if (slot >= 0) {
        key(String(slot + 1));
        const legal = [...ui.picked.legal];
        if (legal.length) { const [q, r] = legal[0].split(',').map(Number); clickHex(q, r); settle(); }
        else key('Escape');
    }
    key('2'); key('x'); settle();
    for (let i = 0; i < 4; i++) { key(' '); settle(); }
    els['zoom-buttons'].children.find(b => b.dataset.zoom === '2').fire('click');
    if (ui.state.turn < 5 || ui.overlay) throw new Error('expected a game some turns in, no overlay: turn ' + ui.state.turn + ', ' + ui.overlay);
    if (!ui.saveForRedirect() || !stored.has(vm.runInContext('GameDisplayArtifacts.SAVE_KEY', ctx))) throw new Error('saveForRedirect must save a game in play');
    const search = '?code=c0de&state=' + vm.runInContext('GameDisplayArtifacts.SIGNIN_STATE_PREFIX', ctx) + 'r4nd0m';
    const url = 'https://ttdat.yuwakisa.com/' + search;
    const p = bootPointer(false, undefined, { win: { localStorage: store, innerWidth: 1280, innerHeight: 720, location: { href: url, search } } });
    const s = p.boot.state, pui = p.boot.ui;
    if (pui.overlay !== null || !p.els['intro-panel'].classList.set.has('hidden') || !p.els['help-panel'].classList.set.has('hidden'))
        throw new Error('the restored page must skip the intro and the first-time Help: ' + pui.overlay);
    const terrain = st => [...st.hexes.values()].map(h => h.q + ',' + h.r + '=' + h.terrain).join(';');
    const pieces = st => JSON.stringify(st.pieces.map(x => [x.id, x.kind, x.q, x.r, x.color]));
    if (s.seed !== ui.state.seed || s.size !== ui.state.size || terrain(s) !== terrain(ui.state)) throw new Error('the board differs');
    if (JSON.stringify(s.things) !== JSON.stringify(ui.state.things) || pieces(s) !== pieces(ui.state)) throw new Error('the Things or pieces differ');
    if (JSON.stringify(s.sources) !== JSON.stringify(ui.state.sources) || JSON.stringify(s.targets) !== JSON.stringify(ui.state.targets)) throw new Error('the ports differ');
    for (const f of ['turn', 'delivered', 'lost', 'exGremlins', 'trapped'])
        if (s[f] !== ui.state[f]) throw new Error(f + ' differs: ' + s[f] + ' vs ' + ui.state[f]);
    if (JSON.stringify(s.hand) !== JSON.stringify(ui.state.hand)) throw new Error('the hand differs');
    if (pui.zoom !== '2' || pui.scale !== ui.scale || pui.running) throw new Error('the zoom must come back and Go stay off');
    if (stored.size !== 0) throw new Error('the save must be gone after the restore');
    // The two pages tick on alike, the Rando stream included.
    const a = ui.engine.wait(), b = p.boot.engine.wait();
    if (JSON.stringify(a) !== JSON.stringify(b) || JSON.stringify(ui.engine.save()) !== JSON.stringify(p.boot.engine.save())) throw new Error('the restored game ticks differently');
    if (pui.state.hand.length !== 3 || !p.listeners.keydown) throw new Error('the restored page must be playable');
    // Reloaded again, with the marker still in the URL: no save, so the intro.
    const again = bootPointer(false, undefined, { win: { localStorage: store, location: { href: url, search } } });
    if (again.boot.ui.overlay !== 'intro' || again.boot.state.hexes) throw new Error('a second load finds no save and shows the intro');
    delete ctx.window.localStorage;
});
// D-69: Sign out. A fresh page on the live site, a ship build, with a stored sign-in: the bar
// shows the handle and Sign out. Under Help the click does nothing; mid-animation it signs out
// at once: the key is gone, Sign in is back, About says signed out, what was queued went with
// the token, and the same game's next batch carries none, under a new random ID.
run('Sign out: a signed-in page signs out by the button mid-game, the game going on (D-69)', () => {
    const AUTH_KEY = vm.runInContext('GameDisplayArtifacts.AUTH_KEY', ctx);
    const store = memoryStorage({ [AUTH_KEY]: JSON.stringify({ token: '01.tok', handle: 'alice.test', expiresAt: Math.floor(Date.now() / 1000) + 600 }) }), stored = store.map;
    const site = 'https://ttdat.yuwakisa.com';
    const loc = { protocol: 'https:', hostname: 'ttdat.yuwakisa.com', origin: site, href: site + '/', search: '', pathname: '/', hash: '' };
    const sent = [];
    let ids = 0;
    const p = bootPointer(false, { userAgent: 'UiBoot/1.0', sendBeacon: () => true }, {
        version: TEST_VERSION, doc: { visibilityState: 'visible', addEventListener() {} },
        win: { localStorage: store, location: loc, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 },
        globals: { location: loc, crypto: { randomUUID: () => 'out-' + (++ids) },
            fetch: (url, init) => { sent.push(JSON.parse(init.body)); return Promise.resolve({ status: 204 }); } },
    });
    const pui = p.boot.ui, hidden = id => p.els[id].classList.set.has('hidden');
    const press = k => p.listeners.keydown.forEach(fn => fn({ key: k, shiftKey: false, preventDefault() {} }));
    if (hidden('signout') || !hidden('signin') || hidden('signin-label') || p.els['signin-label'].textContent !== '@alice.test')
        throw new Error('signed in, the bar must show the handle and Sign out');
    press('1');   // the intro's size pick; first-time Help opens over the game
    if (pui.overlay !== 'help') throw new Error('expected first-time Help, got ' + pui.overlay);
    p.els.signout.fire('click');
    if (!stored.has(AUTH_KEY) || hidden('signout')) throw new Error('Sign out must do nothing under an overlay');
    press('Escape');
    press('1'); press('x');   // a discard: recorded, and its tick animation is in flight
    const before = vm.runInContext('GameTelemetry.pending()', p.ctx);
    if (!pui.anim || !before || before.token !== '01.tok' || before.events.length !== 1) throw new Error('expected a queued, token-carrying discard mid-animation');
    const turn = pui.state.turn, sentBefore = sent.length;
    p.els.signout.fire('click');
    if (stored.has(AUTH_KEY)) throw new Error('Sign out must remove the stored sign-in');
    if (!hidden('signout') || hidden('signin') || !hidden('signin-label')) throw new Error('signed out, the bar must show Sign in again');
    if (!/Not signed in/.test(p.els['about-signin'].textContent)) throw new Error("About's line must follow");
    const flushed = sent[sentBefore];
    if (sent.length !== sentBefore + 1 || flushed.token !== '01.tok' || flushed.player !== before.player || flushed.events.length !== 1)
        throw new Error('the queue must go first, under the signed-in identity: ' + JSON.stringify(flushed));
    if (vm.runInContext('GameTelemetry.pending()', p.ctx) !== null) throw new Error('nothing may stay queued');
    if (pui.overlay !== null || pui.state.turn !== turn || !pui.anim) throw new Error('Sign out must not tick, reload or stop the animation');
    pui.finishAnim();
    press('1'); press('x');   // the same game goes on
    const after = vm.runInContext('GameTelemetry.pending()', p.ctx);
    if (!after || 'token' in after || after.player === before.player || after.games[0].gameKey !== before.games[0].gameKey || pui.state.turn !== turn + 1)
        throw new Error('the next batch must carry no token, under a new random ID, in the same game: ' + JSON.stringify(after && { token: after.token, player: after.player }));
    const idsBefore = ids;
    pui.signOut();
    if (sent.length !== sentBefore + 1 || ids !== idsBefore || vm.runInContext('GameTelemetry.pending()', p.ctx).player !== after.player) throw new Error('signed out, Sign out does nothing');
});
done();

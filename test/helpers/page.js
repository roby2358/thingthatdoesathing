// test/helpers/page.js — boot the real page (every script index.html loads, in order) in a vm
// with a bare stub DOM, for R-rows about GameUI's boot and storage (D-67) and its panels (D-76).
// Elements keep their listeners (`el.fire(type, ev)`). Timers and animation frames never fire,
// unless the page is `live`: then they run on a fake clock that `settle()` (until the tick
// animation ends) and `advance(ms)` move, and `key(k)` sends a keydown to the window.
// test/integration/uiboot.js has the full stub that plays through the UI.
//
//   const page = bootPage({ storage, search: '?code=c&state=signin.x' });
//   page.ui, page.state, page.engine, page.els, page.run('GameTelemetry.gameKey()')
//   const live = bootPage({ live: true }); live.key('1'); live.settle(); live.advance(1000)
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT } = require('./load');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const sourceOf = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pageSource = scripts.map(sourceOf).join('\n;\n');

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
        classList: { set: new Set(), toggle(c, on) { on ? this.set.add(c) : this.set.delete(c); }, add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); } },
        listeners: {},
        addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
        fire(type, ev = {}) { for (const fn of this.listeners[type] || []) fn({ preventDefault() {}, stopPropagation() {}, target: this, ...ev }); },
        appendChild(c) { this.children.push(c); return c; },
        closest: () => null,
        getContext: () => fakeCtx(),
        querySelector(sel) { this._q ||= {}; return (this._q[sel] ||= fakeEl(sel)); },
    };
    Object.defineProperty(el, 'innerHTML', { set() { el.children = []; el._q = {}; }, get: () => '' });
    return el;
}

// A localStorage over a Map, logging every write and removal.
function memoryStorage(entries = {}) {
    const m = new Map(Object.entries(entries));
    const log = [];
    return {
        map: m, log,
        getItem: k => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { log.push(['set', k]); m.set(k, String(v)); },
        removeItem: k => { log.push(['remove', k]); m.delete(k); },
        clear: () => { throw new Error('nothing may clear localStorage'); },
    };
}

class SilentAudio {
    constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; }
    createPeriodicWave() { return {}; }
    createOscillator() { return { setPeriodicWave() {}, frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    resume() {}
}

// A page load. `storage` is window.localStorage (a memoryStorage, or a getter that throws when
// `storage` is 'throws'); `search` the URL's query string; `origin` the page's origin (the live
// site by default; 'null' with a file: protocol for file://). The page is a ship build, so
// telemetry records (sending into a stub fetch). `win` adds to window (sessionStorage, history),
// `globals` to the page's globals (fetch, crypto, …); location.assign calls land in `assigned`.
// `version` is <html data-version> (null: a dev page). `patch` ({before, src}) runs src just
// before the named script; a throw there stops the page as it would stop that script, and is
// returned as `thrown` (the page's globals made so far are still readable through `run`).
function bootPage({ storage = memoryStorage(), search = '', origin = 'https://ttdat.yuwakisa.com', win = {}, globals = {}, version = 'page1234', patch, live = false } = {}) {
    const els = {};
    const document = {
        getElementById: id => (els[id] ||= fakeEl(id)),
        createElement: tag => fakeEl(tag),
        body: fakeEl('body'),
        documentElement: fakeEl('html'),
        visibilityState: 'visible',
        addEventListener() {},
    };
    if (version !== null) document.documentElement.dataset.version = version;
    const fileUrl = origin === 'null';
    const href = (fileUrl ? 'file:///home/player/ttdat' : origin) + '/' + search;
    const assigned = [];
    const location = {
        protocol: fileUrl ? 'file:' : origin.slice(0, origin.indexOf(':') + 1), hostname: fileUrl ? '' : origin.replace(/^\w+:\/\/|:\d+$/g, ''),
        origin, href, search, pathname: '/', hash: '', assign: url => assigned.push(url),
    };
    const windowListeners = {};
    const window = {
        innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, location, AudioContext: SilentAudio,
        getSelection: () => ({ toString: () => '' }), addEventListener: (t, fn) => (windowListeners[t] ||= []).push(fn), ...win,
    };
    // The live clock: animation frames and timers fire as it moves.
    const clock = { now: 0, frames: [], timers: [], id: 0 };
    const liveGlobals = !live ? {} : {
        performance: { now: () => clock.now },
        requestAnimationFrame: fn => clock.frames.push(fn),
        setTimeout: (fn, ms) => { clock.timers.push({ id: ++clock.id, due: clock.now + (ms || 0), fn }); return clock.id; },
        clearTimeout: id => { clock.timers = clock.timers.filter(t => t.id !== id); },
    };
    const step = () => {
        clock.now += 50;
        const frames = clock.frames;
        clock.frames = [];
        frames.forEach(fn => fn(clock.now));
        const due = clock.timers.filter(t => t.due <= clock.now);
        clock.timers = clock.timers.filter(t => t.due > clock.now);
        due.forEach(t => t.fn());
    };
    if (storage === 'throws') Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } });
    else window.localStorage = storage;
    let uuids = 0;
    const ctx = vm.createContext({
        console, document, window, location, AudioContext: SilentAudio, URLSearchParams,
        performance: { now: () => 0 }, requestAnimationFrame: () => {}, setTimeout: () => 0, clearTimeout: () => {},
        navigator: { userAgent: 'Page/1.0', sendBeacon: () => true },
        fetch: () => Promise.resolve({ status: 204 }),
        crypto: { randomUUID: () => 'page-uuid-' + (++uuids) },
        ...liveGlobals,
        ...globals,
    });
    const src = patch === undefined ? pageSource
        : scripts.map(f => (f === patch.before ? patch.src + '\n;\n' : '') + sourceOf(f)).join('\n;\n');
    let thrown = null;
    try { vm.runInContext(src + '\n;globalThis.__page = { ui, state, engine };', ctx, { filename: 'page.js' }); } catch (e) {
        if (patch === undefined) throw e;
        thrown = e;
    }
    const run = src => vm.runInContext(src, ctx);
    const page = ctx.__page || {};
    const settle = () => { for (let i = 0; i < 500 && (clock.frames.length || (page.ui && page.ui.anim)); i++) step(); };
    const advance = ms => { for (let t = 0; t < ms; t += 50) step(); };
    const key = (k, more = {}) => (windowListeners.keydown || []).forEach(fn => fn({ key: k, shiftKey: false, preventDefault() {}, ...more }));
    return { ...page, els, ctx, run, storage, assigned, location, thrown, windowListeners, settle, advance, key };
}

module.exports = { bootPage, memoryStorage };

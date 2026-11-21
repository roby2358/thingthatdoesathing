// test/helpers/page.js — boot the real page (every script index.html loads, in order) in a vm
// with a bare stub DOM, for R-rows about GameUI's boot and storage (D-67). No input driving and
// no animation: timers and animation frames never fire. test/integration/uiboot.js has the full
// stub that plays through the UI.
//
//   const page = bootPage({ storage, search: '?code=c&state=signin.x' });
//   page.ui, page.state, page.engine, page.els, page.run('GameTelemetry.gameKey()')
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
        addEventListener() {},
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
function bootPage({ storage = memoryStorage(), search = '', origin = 'https://ttdat.yuwakisa.com', win = {}, globals = {}, version = 'page1234', patch } = {}) {
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
    const window = {
        innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, location, AudioContext: SilentAudio,
        getSelection: () => ({ toString: () => '' }), addEventListener() {}, ...win,
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
    return { ...(ctx.__page || {}), els, ctx, run, storage, assigned, location, thrown };
}

module.exports = { bootPage, memoryStorage };

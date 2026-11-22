// test/helpers/achievements.js — the achievements rows' shared setup (D-79, R-102..R-108): a live
// page (test/helpers/page.js) with a game in play and first-time Help closed, on a file:// copy,
// the live site signed in or out, or a portal; a fake fetch whose POST /achievements calls wait
// for the test to answer them; and ways to read the page.
'use strict';
const { bootPage, memoryStorage } = require('./page');

const LIVE = 'https://ttdat.yuwakisa.com';
const FILE = 'null';
const PORTAL = 'https://html-classic.itch.zone';
const TOKEN = 'tok-123';

// A stored sign-in (signin.js current()), good for years.
const signedIn = (more = {}) => memoryStorage({ 'thingfactory.auth': JSON.stringify({ token: TOKEN, handle: 'pat.example', expiresAt: 4e9 }), ...more });

// fetch: telemetry's /t answered 204 at once; each /achievements call kept in `calls` as
// {url, init, body (parsed), reply(status, data)}, answered when the test says.
function fakeFetch() {
    const calls = [];
    const fn = (url, init) => {
        if (!String(url).endsWith('/achievements')) return Promise.resolve({ status: 204 });
        let resolve;
        const p = new Promise(r => { resolve = r; });
        calls.push({ url, init, body: JSON.parse(init.body),
            reply(status, data) { resolve({ status, ok: status === 200, json: () => Promise.resolve(data) }); } });
        return p;
    };
    return { fn, calls };
}

// A live page at `origin` with a game of `size` in play, first-time Help closed.
function achGame({ origin = FILE, storage = memoryStorage(), size = 'small', globals = {}, fetcher = fakeFetch() } = {}) {
    const p = bootPage({ live: true, origin, storage, globals: { fetch: fetcher.fn, ...globals } });
    // A seeded Math.random, so the board (its seed) and every tick are the same each run.
    p.run('{ let s = 12345; Math.random = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }');
    p.ui.startGame(size);
    p.ui.dismissOverlay();
    p.fetcher = fetcher;
    p.ach = src => p.run('GameAchievements.' + src);
    return p;
}

// Let promise callbacks run (the fake fetch's answers).
const tick = () => new Promise(r => setImmediate(r));
async function flushPromises() { for (let i = 0; i < 10; i++) await tick(); }

const el = (p, id) => p.run('document.getElementById(' + JSON.stringify(id) + ')');
const shown = (p, id) => !el(p, id).classList.set.has('hidden');
const bannerLines = p => el(p, 'rung-banner-lines').children.map(c => c.textContent);
// Counters {key: n} for GameAchievements.counted, every other key 0.
function counts(p, values) {
    const out = {};
    for (const c of p.run('GameArtifacts.COUNTERS')) if (c.perGame) out[c.key] = 0;
    return Object.assign(out, values);
}

module.exports = { LIVE, FILE, PORTAL, TOKEN, signedIn, fakeFetch, achGame, flushPromises, el, shown, bannerLines, counts, memoryStorage };

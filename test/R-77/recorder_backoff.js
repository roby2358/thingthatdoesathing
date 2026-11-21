// R-77 — the recorder's backoff (telemetry.js, D-70): after the Worker answers a fetch with 429
// or 403 it drops that batch and records and sends nothing for TELEMETRY_BACKOFF_MS; records made
// meanwhile are dropped, not queued. Another answer (204, 400, 500) changes nothing.
//
// The recorder runs in a vm with stubbed document, location, navigator, fetch (answering the status
// a case sets), crypto, window, timers and a hand-moved Date.now.
'use strict';

const vm = require('vm');
const { check, done } = require('../helpers/check');
const { source } = require('../helpers/load');

function page() {
    const p = { sent: [], beacons: [], timers: [], winL: {}, status: 204 };
    let ids = 0;
    const ctx = vm.createContext({
        console,
        document: { documentElement: { dataset: { version: 'abc1234' } }, visibilityState: 'visible', addEventListener() {} },
        location: { protocol: 'https:', hostname: 'ttdat.yuwakisa.com', origin: 'https://ttdat.yuwakisa.com' },
        navigator: { userAgent: 'TestBrowser/1.0', globalPrivacyControl: false,
            sendBeacon: (url, body) => { p.beacons.push(JSON.parse(body)); return true; } },
        fetch: (url, init) => { p.sent.push(JSON.parse(init.body)); return Promise.resolve({ status: p.status }); },
        crypto: { randomUUID: () => 'uuid-' + (++ids) },
        window: { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener: (t, fn) => (p.winL[t] ||= []).push(fn) },
        setTimeout: (fn, ms) => { p.timers.push({ fn, ms, live: true }); return p.timers.length; },
        clearTimeout: id => { if (id && p.timers[id - 1]) p.timers[id - 1].live = false; },
    });
    ctx.__now = 1763700000000;
    vm.runInContext('Date.now = () => globalThis.__now;\n' + ['artifacts.js', 'displayartifacts.js', 'telemetry.js'].map(source).join('\n;\n') +
        '\n;globalThis.__x = { GameTelemetry, GameDisplayArtifacts };', ctx);
    Object.assign(p, ctx.__x);
    p.T = p.GameTelemetry;
    p.advance = ms => { ctx.__now += ms; };
    p.fire = () => { const due = p.timers.filter(t => t.live); due.forEach(t => { t.live = false; t.fn(); }); return due.length; };
    p.hide = () => (p.winL.pagehide || []).forEach(fn => fn({}));
    return p;
}

const STATE = { turn: 1, delivered: 0, lost: 0, exGremlins: 0, trapped: 0, things: [], pieces: [], targets: [] };
const placeArgs = { kind: 'BELT', q: 1, r: 1, facing: 0, color: 'white' };
const place = p => p.T.command('place', placeArgs, { ok: true, events: [] }, STATE);
const settle = () => new Promise(r => setImmediate(r));

(async () => {
    const BACKOFF = page().GameDisplayArtifacts.TELEMETRY_BACKOFF_MS;
    check('TELEMETRY_BACKOFF_MS is 5 minutes', BACKOFF === 300000);

    for (const status of [429, 403]) {
        const p = page();
        p.T.startGame({ seed: 1, size: 'small' });
        place(p);
        p.status = status;
        p.fire();
        await settle();
        check(`${status}: the batch went once by fetch`, p.sent.length === 1 && p.sent[0].events.length === 1);
        place(p);
        place(p);
        check(`${status}: records made after it are dropped, not queued, and no timer runs`, p.T.pending() === null || p.T.pending().events.length === 0);
        check(`${status}: … nothing more sent by timer or pagehide`, p.fire() === 0 && (p.hide(), p.beacons.length === 0) && p.sent.length === 1);
        p.T.startGame({ seed: 2, size: 'small' });
        check(`${status}: a new game while backing off sends nothing either`, p.sent.length === 1 && p.fire() === 0);
        p.advance(BACKOFF - 1000);
        place(p);
        check(`${status}: still quiet just before TELEMETRY_BACKOFF_MS`, p.fire() === 0 && p.sent.length === 1);
        p.advance(1000);
        p.status = 204;
        place(p);
        const b = p.T.pending();
        check(`${status}: after TELEMETRY_BACKOFF_MS records queue again, only the new one`, b && b.events.length === 1 && b.games.length === 1);
        check(`${status}: … and the timer sends them`, p.fire() === 1 && p.sent.length === 2 && p.sent[1].events.length === 1);
    }

    for (const status of [204, 400, 500]) {
        const p = page();
        p.status = status;
        p.T.startGame({ seed: 1, size: 'small' });
        place(p);
        p.fire();
        await settle();
        place(p);
        check(`${status}: no backoff, the next record queues and is sent`, p.T.pending().events.length === 1 && p.fire() === 1 && p.sent.length === 2);
    }
    done();
})().catch(e => { console.log('FAIL threw: ' + (e && e.stack)); process.exit(1); });

// R-77 — POST /t's guards (worker/telemetry.js, D-70): the Origin allow-list and the per-IP rate
// limit, both before the body is read.
//
// The worker is imported as the ES module wrangler deploys (worker/index.js) with a stub
// TELEMETRY_LIMIT binding in place of Cloudflare's, and a fake D1 that records every bind and
// batch. Cases:
//   - allowed (the stub says success) with the live site's Origin → 204 and the rows written; the
//     limiter was asked with the request's CF-Connecting-IP as its key
//   - limited → 429 with Access-Control-Allow-Origin *, nothing written, the body never parsed
//     (a body that isn't JSON still gets 429, not 400)
//   - a foreign Origin → 403, nothing written, the limiter not asked; each TELEMETRY_ORIGINS entry
//     is let through; http://localhost:8787 only with wrangler dev's TELEMETRY_DEV_ORIGINS var
//   - no Origin header → on to the limiter and allowed
//   - no binding, or a limiter that throws → let through (logged without the IP)
//   - a counting limiter at TELEMETRY_RATE_LIMIT and 1200 requests in one window → 1000 written, 200 × 429
//   - the IP never reaches a D1 bind, a log line or a response
//   - wrangler.jsonc binds TELEMETRY_LIMIT in both environments with TELEMETRY_RATE_LIMIT's numbers,
//     and TELEMETRY_DEV_ORIGINS only at top level (wrangler dev), as http://localhost:8787
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { check, done } = require('../helpers/check');

const ROOT = path.join(__dirname, '..', '..');
const IP = '198.51.100.23';
const logged = [];
const say = (...a) => process.stdout.write(a.join(' ') + '\n');
for (const k of ['info', 'warn', 'error', 'debug']) console[k] = (...a) => logged.push(a.map(String).join(' '));
// console.log is also the check harness's output: that still prints but isn't kept.
console.log = (...a) => { const l = a.map(String).join(' '); if (!/^  (ok  |FAIL) /.test(l)) logged.push(l); say(...a); };

function fakeD1() {
    const d1 = { binds: [], batches: 0, rows: 0 };
    d1.prepare = sql => ({ bind: (...args) => { d1.binds.push(args); return { sql, args }; } });
    d1.batch = async statements => { d1.batches++; d1.rows += statements.length; };
    return d1;
}

/** A limiter stub: `verdict(key)` decides; every key asked is kept. */
function limiter(verdict) {
    const l = { keys: [] };
    l.limit = async ({ key }) => { l.keys.push(key); return { success: verdict(key) }; };
    return l;
}

const GAME = { gameKey: 'g1', startedUnixSeconds: 1763700000, seed: 1, size: 'small', version: 'abc1234', rulesVersion: 1 };
const BATCH = JSON.stringify({ format: 1, player: 'p', games: [GAME] });
let worker;

async function post(env, { origin, body = BATCH, ip = IP } = {}) {
    const headers = { 'Content-Type': 'text/plain' };
    if (ip) headers['CF-Connecting-IP'] = ip;
    if (origin) headers.Origin = origin;
    const waits = [];
    const res = await worker.fetch(new Request('https://ttdat.yuwakisa.com/t', { method: 'POST', headers, body }), env,
        { waitUntil: p => waits.push(p) });
    await Promise.all(waits);
    const text = await res.text();
    return { status: res.status, cors: res.headers.get('Access-Control-Allow-Origin'), echoed: text + JSON.stringify([...res.headers]) };
}

(async () => {
    worker = (await import(pathToFileURL(path.join(ROOT, 'worker', 'index.js')).href)).default;
    const { TELEMETRY_ORIGINS, TELEMETRY_RATE_LIMIT } = await import(pathToFileURL(path.join(ROOT, 'worker', 'telemetry.js')).href);
    const echoes = [];

    // Allowed.
    {
        const d1 = fakeD1(), lim = limiter(() => true);
        const r = await post({ TELEMETRY: d1, TELEMETRY_LIMIT: lim }, { origin: 'https://ttdat.yuwakisa.com' });
        echoes.push(r.echoed);
        check('allowed, live-site Origin → 204, rows written', r.status === 204 && d1.batches === 1 && d1.rows === 1);
        check('… the limiter keyed by CF-Connecting-IP', lim.keys.length === 1 && lim.keys[0] === IP);
    }
    // Limited: 429 before the body is read.
    {
        const d1 = fakeD1(), lim = limiter(() => false);
        logged.length = 0;
        const r = await post({ TELEMETRY: d1, TELEMETRY_LIMIT: lim }, { origin: 'https://ttdat.yuwakisa.com' });
        const r2 = await post({ TELEMETRY: d1, TELEMETRY_LIMIT: lim }, { body: '{not json' });
        echoes.push(r.echoed, r2.echoed);
        check('limited → 429 with Access-Control-Allow-Origin *, nothing written', r.status === 429 && r.cors === '*' && d1.batches === 0 && d1.binds.length === 0);
        check('… before the body is parsed (a non-JSON body gets 429, not 400), nothing logged', r2.status === 429 && logged.length === 0);
    }
    // Origins.
    {
        const d1 = fakeD1(), lim = limiter(() => true);
        const r = await post({ TELEMETRY: d1, TELEMETRY_LIMIT: lim }, { origin: 'https://evil.example' });
        echoes.push(r.echoed);
        check('a foreign Origin → 403 with CORS, nothing written, the limiter not asked', r.status === 403 && r.cors === '*' && d1.batches === 0 && lim.keys.length === 0);
        let all = true;
        for (const origin of TELEMETRY_ORIGINS) all = all && (await post({ TELEMETRY: fakeD1(), TELEMETRY_LIMIT: lim }, { origin })).status === 204;
        check('every TELEMETRY_ORIGINS entry (live site, itch.io, Newgrounds) is let through', all && TELEMETRY_ORIGINS.length === 3 &&
            ['https://ttdat.yuwakisa.com', 'https://html-classic.itch.zone', 'https://uploads.ungrounded.net'].every(o => TELEMETRY_ORIGINS.includes(o)));
        const local = 'http://localhost:8787';
        const noVar = await post({ TELEMETRY: fakeD1(), TELEMETRY_LIMIT: lim }, { origin: local });
        const withVar = await post({ TELEMETRY: fakeD1(), TELEMETRY_LIMIT: lim, TELEMETRY_DEV_ORIGINS: local }, { origin: local });
        check('localhost:8787 → 403 without TELEMETRY_DEV_ORIGINS, 204 with it', noVar.status === 403 && withVar.status === 204);
        check('… and TELEMETRY_DEV_ORIGINS lets nothing else in', (await post({ TELEMETRY: fakeD1(), TELEMETRY_LIMIT: lim, TELEMETRY_DEV_ORIGINS: local }, { origin: 'https://evil.example' })).status === 403);
        const before = lim.keys.length, d = fakeD1();
        const none = await post({ TELEMETRY: d, TELEMETRY_LIMIT: lim });
        check('no Origin header → on to the limiter, allowed, written', none.status === 204 && lim.keys.length === before + 1 && d.batches === 1);
        const denied = await post({ TELEMETRY: fakeD1(), TELEMETRY_LIMIT: limiter(() => false) });
        check('… and limited like any other', denied.status === 429);
    }
    // No binding, a failing limiter.
    {
        const d1 = fakeD1();
        check('no TELEMETRY_LIMIT binding → let through', (await post({ TELEMETRY: d1 })).status === 204 && d1.batches === 1);
        const d2 = fakeD1();
        logged.length = 0;
        const r = await post({ TELEMETRY: d2, TELEMETRY_LIMIT: { limit: async () => { throw new Error('limiter down ' + IP); } } });
        check('a limiter that throws → let through and written, one log line', r.status === 204 && d2.batches === 1 && logged.length === 1);
        check('… the line holds no IP', !logged.some(l => l.includes(IP)));
    }
    // A burst against a counting limiter at the binding's numbers.
    {
        const d1 = fakeD1();
        let n = 0;
        const lim = limiter(() => ++n <= TELEMETRY_RATE_LIMIT.limit);
        const statuses = await Promise.all(Array.from({ length: 1200 }, () => post({ TELEMETRY: d1, TELEMETRY_LIMIT: lim }).then(r => r.status)));
        const c = s => statuses.filter(x => x === s).length;
        check('1200 requests in one window at 1000 per window → 1000 × 204 (written), 200 × 429', c(204) === 1000 && c(429) === 200 && d1.rows === 1000);
    }
    // The IP stays out of D1, logs and responses.
    {
        const d1 = fakeD1();
        logged.length = 0;
        await post({ TELEMETRY: d1, TELEMETRY_LIMIT: limiter(() => true) }, { body: JSON.stringify({ format: 1, player: 'p', games: [GAME], crashes: [{ unixSeconds: 1, message: 'x' }] }) });
        await post({ TELEMETRY: d1, TELEMETRY_LIMIT: limiter(() => true) }, { body: '{bad' });
        check('the IP is in no D1 bind', d1.binds.length > 0 && !JSON.stringify(d1.binds).includes(IP));
        check('… no log line', !logged.some(l => l.includes(IP)));
        check('… and no response (body or header)', !echoes.some(e => e.includes(IP)));
    }
    // wrangler.jsonc.
    {
        const wrangler = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8');
        const limits = [...wrangler.matchAll(/\{\s*"name":\s*"TELEMETRY_LIMIT",\s*"namespace_id":\s*"(\d+)",\s*"simple":\s*\{\s*"limit":\s*(\d+),\s*"period":\s*(\d+)\s*\}\s*\}/g)];
        const envAt = wrangler.indexOf('"env"');
        check('wrangler.jsonc binds TELEMETRY_LIMIT at top level and in env.production', limits.length === 2 && limits[0].index < envAt && limits[1].index > envAt);
        check('… both with TELEMETRY_RATE_LIMIT\'s numbers (1000 per 10 s) and one namespace', limits.every(m => Number(m[2]) === TELEMETRY_RATE_LIMIT.limit &&
            Number(m[3]) === TELEMETRY_RATE_LIMIT.period) && TELEMETRY_RATE_LIMIT.limit === 1000 && TELEMETRY_RATE_LIMIT.period === 10 && limits[0][1] === limits[1][1]);
        const dev = [...wrangler.matchAll(/"TELEMETRY_DEV_ORIGINS":\s*"([^"]*)"/g)];
        check('TELEMETRY_DEV_ORIGINS only at top level, as http://localhost:8787', dev.length === 1 && dev[0].index < envAt && dev[0][1] === 'http://localhost:8787');
    }
    done();
})().catch(e => { say('FAIL threw: ' + (e && e.stack)); process.exit(1); });

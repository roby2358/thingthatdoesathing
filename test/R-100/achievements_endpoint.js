// R-100 — POST /achievements (worker/index.js → worker/achievements.js, D-78). The Worker is
// imported as plain JS (a stub for 'cloudflare:workers'); a stub verifier stands in for the
// auth-client's verifyAccessToken (by calling achievements() directly) and a fake PLAYER_TOTALS
// namespace hands out real PlayerTotals objects over fake kv storage, one per name. Cases:
//   - routing: POST /achievements reaches it through worker/index.js (no sign-in configured → 401);
//     GET /achievements → 404; PlayerTotals is index.js's named export
//   - guards, before the body is read: a foreign Origin → 403 (limiter not asked); the limiter
//     refuses → 429, even for a body that isn't JSON; the limiter keyed by CF-Connecting-IP; each
//     with Access-Control-Allow-Origin *
//   - bad bodies → 400, the object untouched: not JSON, not an object, an array, over
//     MAX_BODY_BYTES, add not an object, a key not in ACHIEVEMENT_COUNTERS, more than MAX_ADD_KEYS
//     keys, a value negative, fractional, a string, over MAX_ADD_VALUE
//   - no token, a token that doesn't verify, a non-string one, the wrong audience, no play scope → 401
//   - a valid token: the object named by the player hash (SHA-256 of PLAYER_SALT + sub) gets the
//     add; 200 {totals}; a body without add reads the totals; adds accumulate across requests;
//     0 ≤ n ≤ MAX_ADD_VALUE accepted at both ends; another player's object is its own
//   - two concurrent requests' adds are both kept
//   - the verifier gets the issuer and TTDAT_CLIENT_ID as audience
//   - no PLAYER_TOTALS binding, or an object that throws → 503
//   - the sub, the token and the IP are in no log line, response or object name
'use strict';

const path = require('path');
const nodeCrypto = require('crypto');
const { pathToFileURL } = require('url');
const { check, done } = require('../helpers/check');
const { fakeKv } = require('../helpers/cloudflare');

const ROOT = path.join(__dirname, '..', '..');
const IP = '198.51.100.77';
const SUB = 'did:plc:achieverexample0000000';
const ISSUER = 'https://auth.example', CLIENT = 'ttdatClient00001';
const say = (...a) => process.stdout.write(a.join(' ') + '\n');
const logged = [];
for (const k of ['info', 'warn', 'error', 'debug']) console[k] = (...a) => logged.push(a.map(String).join(' '));
console.log = (...a) => { const l = a.map(String).join(' '); if (!/^  (ok  |FAIL) /.test(l)) logged.push(l); say(...a); };

const calls = [];
async function verify(token, opts) {
    calls.push(opts);
    const claims = { iss: ISSUER, sub: SUB, aud: CLIENT, exp: 2e9, iat: 1e9, scope: 'profile ttdat:play' };
    if (token === 'good') return { valid: true, claims };
    if (token === 'other') return { valid: true, claims: { ...claims, sub: SUB + '-2' } };
    if (token === 'noscope') return { valid: true, claims: { ...claims, scope: 'profile' } };
    if (token === 'otheraud') return { valid: false, reason: 'wrong_audience' };
    return { valid: false, reason: 'malformed_token' };
}

(async () => {
    const worker = await import(pathToFileURL(path.join(ROOT, 'worker', 'index.js')).href);
    const { achievements, MAX_ADD_KEYS, MAX_ADD_VALUE } = await import(pathToFileURL(path.join(ROOT, 'worker', 'achievements.js')).href);
    const { ACHIEVEMENT_COUNTERS } = await import(pathToFileURL(path.join(ROOT, 'worker', 'counters.js')).href);
    const { MAX_BODY_BYTES } = await import(pathToFileURL(path.join(ROOT, 'worker', 'telemetry.js')).href);
    const { PlayerTotals } = worker;

    /** A fake DurableObjectNamespace: idFromName → the name, get → that name's one PlayerTotals,
     *  methods called async as RPC would. */
    function fakeNamespace() {
        const objects = new Map();
        return {
            objects,
            idFromName: name => ({ name }),
            get: id => {
                if (!objects.has(id.name)) {
                    objects.set(id.name, new PlayerTotals({ storage: { kv: fakeKv() } }, {}));
                }
                const o = objects.get(id.name);
                return { add: async inc => o.add(inc), totals: async () => o.totals() };
            },
        };
    }
    const limiter = verdict => { const l = { keys: [] }; l.limit = async ({ key }) => { l.keys.push(key); return { success: verdict }; }; return l; };
    const ENV = (extra = {}) => ({ AUTH_ISSUER: ISSUER, TTDAT_CLIENT_ID: CLIENT,
        AUTH_SERVICE: { fetch: () => Promise.resolve(new Response('{}')) }, PLAYER_TOTALS: fakeNamespace(), ...extra });
    const responses = [];
    async function post(env, body, { origin, ip = IP, raw = false, method = 'POST', viaWorker = false } = {}) {
        const headers = { 'Content-Type': 'text/plain', 'CF-Connecting-IP': ip };
        if (origin) headers.Origin = origin;
        const req = new Request('https://ttdat.yuwakisa.com/achievements', { method, headers, body: method === 'GET' ? undefined : (raw ? body : JSON.stringify(body)) });
        const res = viaWorker ? await worker.default.fetch(req, env, { waitUntil() {} }) : await achievements(req, env, verify);
        const text = await res.text();
        responses.push(text + JSON.stringify([...res.headers]));
        return { status: res.status, cors: res.headers.get('Access-Control-Allow-Origin'), json: /json/.test(res.headers.get('Content-Type') || '') ? JSON.parse(text) : null };
    }
    const hashed = nodeCrypto.createHash('sha256').update('ttdat-player-v1:' + SUB).digest('hex');

    // Routing.
    {
        check('PlayerTotals is worker/index.js\'s named export', typeof PlayerTotals === 'function');
        const r = await post({}, { token: 'good' }, { viaWorker: true });
        check('POST /achievements routes to it (no sign-in configured → 401)', r.status === 401);
        check('GET /achievements → 404', (await post({}, null, { method: 'GET', viaWorker: true })).status === 404);
    }
    // Guards.
    {
        const env = ENV(), lim = limiter(true);
        const foreign = await post({ ...env, TELEMETRY_LIMIT: lim }, { token: 'good' }, { origin: 'https://evil.example' });
        check('a foreign Origin → 403 with CORS, the limiter not asked, nothing added', foreign.status === 403 && foreign.cors === '*' && lim.keys.length === 0 && env.PLAYER_TOTALS.objects.size === 0);
        const ok = await post({ ...env, TELEMETRY_LIMIT: lim }, { token: 'good' }, { origin: 'https://ttdat.yuwakisa.com' });
        check('the live site\'s Origin → on; the limiter keyed by CF-Connecting-IP', ok.status === 200 && lim.keys.length === 1 && lim.keys[0] === IP);
        const limited = await post({ ...env, TELEMETRY_LIMIT: limiter(false) }, '{not json', { raw: true });
        check('limited → 429 with CORS before the body is read (non-JSON body)', limited.status === 429 && limited.cors === '*');
    }
    // Bad bodies.
    {
        const env = ENV();
        const many = Object.fromEntries(Array.from({ length: MAX_ADD_KEYS + 1 }, (_, i) => ['k' + i, 1]));
        const bad = [
            ['not JSON', '{nope', true],
            ['not an object', '42', true],
            ['an array', '[]', true],
            ['over MAX_BODY_BYTES', JSON.stringify({ token: 'good', pad: 'x'.repeat(MAX_BODY_BYTES) }), true],
            ['add not an object', { token: 'good', add: [1] }],
            ['add a number', { token: 'good', add: 3 }],
            ['a key not in ACHIEVEMENT_COUNTERS', { token: 'good', add: { notACounter: 1 } }],
            ['more than MAX_ADD_KEYS keys', { token: 'good', add: many }],
            ['a negative value', { token: 'good', add: { placed: -1 } }],
            ['a fractional value', { token: 'good', add: { placed: 1.5 } }],
            ['a string value', { token: 'good', add: { placed: '1' } }],
            ['a value over MAX_ADD_VALUE', { token: 'good', add: { placed: MAX_ADD_VALUE + 1 } }],
        ];
        let all = true;
        logged.length = 0;
        for (const [label, body, raw] of bad) {
            const r = await post(env, body, { raw });
            if (r.status !== 400 || r.cors !== '*') { all = false; say('  not 400: ' + label + ' → ' + r.status); }
        }
        check('every bad body → 400 with CORS', all);
        check('… each refusal logged with what failed (the key count before the keys)', logged.length === bad.length &&
            logged.includes('achievements refused: add: too many keys') && logged.includes('achievements refused: body too big'));
        check('… and no object was touched', env.PLAYER_TOTALS.objects.size === 0);
        check('MAX_ADD_KEYS is 64, MAX_ADD_VALUE 100000', MAX_ADD_KEYS === 64 && MAX_ADD_VALUE === 100000);
    }
    // 401.
    {
        const env = ENV();
        let all = true;
        for (const body of [{}, { token: '' }, { token: 'garbage' }, { token: 42 }, { token: 'otheraud' }, { token: 'noscope' }, { add: { placed: 1 } }]) {
            const r = await post(env, body);
            all = all && r.status === 401 && r.cors === '*';
        }
        check('no token, a bad, non-string, wrong-audience or scopeless one → 401', all && env.PLAYER_TOTALS.objects.size === 0);
        const r = await post(ENV({ TTDAT_CLIENT_ID: undefined }), { token: 'good' });
        check('sign-in not configured → 401', r.status === 401);
    }
    // Add and read.
    {
        const env = ENV();
        calls.length = 0;
        const read0 = await post(env, { token: 'good' });
        check('a valid token, no add → 200 {totals: {}}', read0.status === 200 && JSON.stringify(read0.json) === '{"totals":{}}');
        check('the verifier gets the issuer and TTDAT_CLIENT_ID as audience', calls[0].expected_issuer === ISSUER && calls[0].expected_audience === CLIENT);
        const r1 = await post(env, { token: 'good', add: { cratesDelivered: 10, rungsReached: 1, discards: 0 } });
        check('an add → 200 with every key that has a total', r1.status === 200 && JSON.stringify(r1.json) === JSON.stringify({ totals: { cratesDelivered: 10, rungsReached: 1 } }));
        check('… in the object named by the player hash', [...env.PLAYER_TOTALS.objects.keys()].join() === hashed);
        const r2 = await post(env, { token: 'good', add: { cratesDelivered: MAX_ADD_VALUE, placed: 3 } });
        check('adds accumulate across requests (MAX_ADD_VALUE accepted)', r2.json.totals.cratesDelivered === 10 + MAX_ADD_VALUE && r2.json.totals.placed === 3 && r2.json.totals.rungsReached === 1);
        const read = await post(env, { token: 'good', add: {} });
        check('an empty add reads the totals', JSON.stringify(read.json) === JSON.stringify(r2.json));
        const all = await post(env, { token: 'good', add: Object.fromEntries(ACHIEVEMENT_COUNTERS.map(k => [k, 1])) });
        check('every ACHIEVEMENT_COUNTERS key accepted', all.status === 200 && ACHIEVEMENT_COUNTERS.every(k => all.json.totals[k] >= 1));
        const other = await post(env, { token: 'other', add: { trapped: 2 } });
        check('another player\'s object is its own', JSON.stringify(other.json) === '{"totals":{"trapped":2}}' && env.PLAYER_TOTALS.objects.size === 2);
        const [a, b] = await Promise.all([post(env, { token: 'other', add: { trapped: 5 } }), post(env, { token: 'other', add: { trapped: 7 } })]);
        const after = await post(env, { token: 'other' });
        check('two concurrent requests\' adds are both kept', a.status === 200 && b.status === 200 && after.json.totals.trapped === 14);
    }
    // 503.
    {
        logged.length = 0;
        const none = await post(ENV({ PLAYER_TOTALS: undefined }), { token: 'good' });
        const throws = await post(ENV({ PLAYER_TOTALS: { idFromName: n => n, get: () => ({ totals: async () => { throw new Error('object down ' + SUB); } }) } }), { token: 'good' });
        check('no PLAYER_TOTALS binding, or an object that throws → 503', none.status === 503 && throws.status === 503);
        check('… the log lines hold no sub', logged.length === 2 && !logged.some(l => l.includes(SUB)));
    }
    // Privacy.
    {
        check('the sub, token and IP in no log line', !logged.some(l => l.includes(SUB) || l.includes(IP) || /\bgood\b/.test(l)));
        check('… and no response', !responses.some(r => r.includes(SUB) || r.includes(IP) || r.includes(hashed)));
    }
    done();
})().catch(e => { say('FAIL threw: ' + (e && e.stack)); process.exit(1); });

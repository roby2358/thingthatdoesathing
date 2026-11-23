// R-74 — a telemetry batch's sign-in token → its rows' identity (worker/auth.js identityFor,
// worker/telemetry.js, D-68). The Worker is imported as plain JS and handed a stub verifier in
// place of the vendored auth-client's verifyAccessToken; D1 is node:sqlite with the schema.
//   - a valid token for this client with the play scope → every row of the batch (games, events,
//     milestones, crashes, goal_sets, goals_met, rungs) has player_id = SHA-256 hex of PLAYER_SALT + sub and signed_in 1;
//     neither the token nor sub is in any bind or log line
//   - the verifier is asked for AUTH_ISSUER and TTDAT_CLIENT_ID, and its fetcher goes through
//     the AUTH_SERVICE binding
//   - an invalid, expired or wrong-audience token, a token without the play scope, a verifier that
//     throws, a missing, empty, non-string or over-long token, or sign-in not configured → 204 and
//     the batch's random player with signed_in 0 (never a 400)
//   - through worker/index.js with sign-in not configured, a token batch is written under its
//     random ID without loading the vendored client
//   - PLAY_SCOPE is in the browser's SIGNIN_SCOPE; each SIGNIN_SITES client id is wrangler.jsonc's
//     TTDAT_CLIENT_ID for that environment
'use strict';

const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');
const { pathToFileURL } = require('url');
const { DatabaseSync } = require('node:sqlite');
const { check, done } = require('../helpers/check');
require('../helpers/cloudflare');   // worker/index.js imports 'cloudflare:workers'

const ROOT = path.join(__dirname, '..', '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'worker', 'telemetry_schema.sql'), 'utf8');
const say = (...a) => process.stdout.write(a.join(' ') + '\n');
const logged = [];
for (const k of ['info', 'warn', 'error', 'debug']) console[k] = (...a) => logged.push(a.map(String).join(' '));
console.log = (...a) => { logged.push(a.map(String).join(' ')); say(...a); };

function fakeD1() {
    const db = new DatabaseSync(':memory:');
    db.exec(SCHEMA);
    const binds = [];
    return {
        binds,
        prepare(sql) { return { bind(...args) { binds.push(args); return { sql, args }; } }; },
        async batch(statements) { for (const s of statements) db.prepare(s.sql).run(...s.args.map(v => v === undefined ? null : v)); },
        ids(table) { return db.prepare(`SELECT player_id, signed_in FROM ${table}`).all().map(r => r.player_id + '/' + r.signed_in); },
    };
}

const SUB = '01JSUBJECT0000000000000042';
const ISSUER = 'https://auth.example', CLIENT = 'ttdatClient00001';
const GAME = { gameKey: 'g1', startedUnixSeconds: 1763700000, seed: 1, size: 'small', version: 'v', rulesVersion: 1 };
const SNAP = { turn: 3, delivered: 0, lost: 0, exGremlins: 0, trapped: 0, things: 1, crates: 1, deliveredByColor: [0, 0, 0, 0] };
const BATCH = { format: 1, player: 'random-player', games: [GAME],
    events: [{ gameKey: 'g1', seq: 0, unixSeconds: 1763700001, command: 'place', accepted: true, ...SNAP, args: { kind: 'BELT', q: 1, r: 1, facing: 0 } }],
    milestones: [{ gameKey: 'g1', milestone: 10, unixSeconds: 1763700002, ...SNAP }],
    crashes: [{ unixSeconds: 1763700003, message: 'oops' }],
    goalSets: [{ gameKey: 'g1', set: 0, how: 'start', turn: 1, unixSeconds: 1763700000,
        goals: [{ counter: 'placed', amount: 5 }, { counter: 'trapped', amount: 500 }, { counter: 'cannonLobs', amount: 50 }] }],
    goalsMet: [{ gameKey: 'g1', set: 0, index: 0, counter: 'placed', amount: 5, turn: 3, unixSeconds: 1763700001, met: true }],
    rungs: [{ gameKey: 'g1', counter: 'placed', rung: 10, unixSeconds: 1763700001 }] };
const TABLES = ['games', 'events', 'milestones', 'crashes', 'goal_sets', 'goals_met', 'rungs'];

// The stub verifier: by token, what verifyAccessToken would answer.
const calls = [];
async function verify(token, opts) {
    calls.push({ token, opts });
    const claims = { iss: ISSUER, sub: SUB, aud: CLIENT, exp: 2e9, iat: 1e9, kid: 'k1', scope: 'profile ttdat:play' };
    switch (token) {
        case 'good': return { valid: true, claims };
        case 'noscope': return { valid: true, claims: { ...claims, scope: 'profile' } };
        case 'expired': return { valid: false, reason: 'expired' };
        case 'otheraud': return { valid: false, reason: 'wrong_audience' };
        case 'boom': throw new Error('jwks down');
        default: return { valid: false, reason: 'malformed_token' };
    }
}

const serviceCalls = [];
const ENV = (d1, extra = {}) => ({ TELEMETRY: d1, AUTH_ISSUER: ISSUER, TTDAT_CLIENT_ID: CLIENT,
    AUTH_SERVICE: { fetch: (input, init) => { serviceCalls.push(input); return Promise.resolve(new Response('{}')); } }, ...extra });

(async () => {
    const tel = await import(pathToFileURL(path.join(ROOT, 'worker', 'telemetry.js')).href);
    const auth = await import(pathToFileURL(path.join(ROOT, 'worker', 'auth.js')).href);
    const worker = (await import(pathToFileURL(path.join(ROOT, 'worker', 'index.js')).href)).default;

    async function post(env, body, viaWorker = false) {
        const waits = [];
        const req = new Request('https://ttdat.yuwakisa.com/t', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
        const ctx = { waitUntil: p => waits.push(p) };
        const res = viaWorker ? await worker.fetch(req, env, ctx) : await tel.telemetry(req, env, ctx, verify);
        await Promise.all(waits);
        return res;
    }

    const hashed = nodeCrypto.createHash('sha256').update(auth.PLAYER_SALT + SUB).digest('hex');
    check('PLAYER_SALT is a constant of its own', typeof auth.PLAYER_SALT === 'string' && auth.PLAYER_SALT.length >= 8);
    check('playerIdFor is the salted SHA-256 of sub, 64 hex chars', (await auth.playerIdFor(SUB)) === hashed && /^[0-9a-f]{64}$/.test(hashed));

    // A valid token: every row signed in under the hash.
    {
        const d1 = fakeD1();
        logged.length = 0;
        calls.length = 0;
        serviceCalls.length = 0;
        const res = await post(ENV(d1), { ...BATCH, token: 'good' });
        check('a valid token → 204', res.status === 204);
        check('every row of every table carries the sub hash, signed_in 1',
            TABLES.every(t => { const ids = d1.ids(t); return ids.length === 1 && ids[0] === hashed + '/1'; }));
        check('the random player is in no bind', !d1.binds.flat().includes('random-player'));
        check('neither the token nor sub is in any bind', !d1.binds.flat().some(v => v === 'good' || (typeof v === 'string' && v.includes(SUB))));
        check('neither is in any log line', !logged.some(l => l.includes('good') || l.includes(SUB)));
        const o = calls[0] && calls[0].opts;
        check('the verifier is asked for the issuer and this client as audience', calls.length === 1 && o.expected_issuer === ISSUER && o.expected_audience === CLIENT
            && Number.isInteger(o.now_s) && o.clock_skew_s === auth.CLOCK_SKEW_S);
        await o.fetcher(ISSUER + '/.well-known/jwks.json');
        check('its fetcher goes through the AUTH_SERVICE binding', serviceCalls.includes(ISSUER + '/.well-known/jwks.json'));
    }

    // Everything else keeps the random ID, and is never refused.
    const signedOut = [
        ['an invalid token', { token: 'garbage' }],
        ['an expired token', { token: 'expired' }],
        ['a token for another audience', { token: 'otheraud' }],
        ['a token without the play scope', { token: 'noscope' }],
        ['a verifier that throws', { token: 'boom' }],
        ['no token', {}],
        ['an empty token', { token: '' }],
        ['a number for a token', { token: 42 }],
        ['an object for a token', { token: { sub: SUB } }],
        ['an over-long token', { token: 'good' + 'x'.repeat(auth.MAX_TOKEN_CHARS) }],
    ];
    for (const [label, extra] of signedOut) {
        const d1 = fakeD1();
        const res = await post(ENV(d1), { ...BATCH, ...extra });
        check(label + ' → 204, every row under the random player, signed_in 0',
            res.status === 204 && TABLES.every(t => d1.ids(t).join() === 'random-player/0'));
    }
    for (const [label, env] of [['no AUTH_SERVICE', { AUTH_SERVICE: undefined }], ['no AUTH_ISSUER', { AUTH_ISSUER: '' }], ['no TTDAT_CLIENT_ID', { TTDAT_CLIENT_ID: undefined }]]) {
        const d1 = fakeD1();
        calls.length = 0;
        const res = await post(ENV(d1, env), { ...BATCH, token: 'good' });
        check('sign-in not configured (' + label + '): random player, the verifier never asked',
            res.status === 204 && calls.length === 0 && TABLES.every(t => d1.ids(t).join() === 'random-player/0'));
    }
    check('identityFor without a verifier → null', (await auth.identityFor('good', ENV(fakeD1()), undefined, 1)) === null);

    // Through the deployed entry module, sign-in not configured: the vendored client never loads.
    {
        const d1 = fakeD1();
        const res = await post({ TELEMETRY: d1 }, { ...BATCH, token: 'good' }, true);
        check('worker/index.js, no sign-in configured: 204 under the random player', res.status === 204 && TABLES.every(t => d1.ids(t).join() === 'random-player/0'));
    }

    // The browser and the wrangler config agree with the Worker.
    const display = fs.readFileSync(path.join(ROOT, 'displayartifacts.js'), 'utf8');
    const scope = display.match(/SIGNIN_SCOPE:\s*'([^']+)'/);
    check('PLAY_SCOPE is in the browser\'s SIGNIN_SCOPE', scope && scope[1].split(' ').includes(auth.PLAY_SCOPE));
    const wrangler = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8');
    const ids = [...wrangler.matchAll(/"TTDAT_CLIENT_ID":\s*"([^"]+)"/g)].map(m => m[1]);
    const issuers = [...wrangler.matchAll(/"AUTH_ISSUER":\s*"([^"]+)"/g)].map(m => m[1]);
    const site = origin => { const m = display.match(new RegExp("'" + origin.replace(/[.:/]/g, '\\$&') + "':\\s*\\{\\s*issuer:\\s*'([^']+)',\\s*clientId:\\s*'([^']+)'")); return m && { issuer: m[1], clientId: m[2] }; };
    const live = site('https://ttdat.yuwakisa.com'), dev = site('http://localhost:8787');
    check('wrangler dev\'s client id and issuer are SIGNIN_SITES\' localhost:8787 ones', ids.length === 2 && dev && dev.clientId === ids[0] && dev.issuer === issuers[0]);
    check('production\'s client id and issuer are SIGNIN_SITES\' live-site ones', live && live.clientId === ids[1] && live.issuer === issuers[1]);
    check('wrangler.jsonc binds AUTH_SERVICE to auth/ in both environments', (wrangler.match(/"binding":\s*"AUTH_SERVICE",\s*"service":\s*"auth"/g) || []).length === 2);
    done();
})().catch(e => { say('FAIL threw: ' + (e && e.stack)); process.exit(1); });

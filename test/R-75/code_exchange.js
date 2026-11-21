// R-75 — POST /auth/token, the sign-in's code exchange (worker/auth.js exchangeCode through
// worker/index.js, D-68). The browser's code, PKCE verifier and redirect URI go to auth/'s POST
// /token through the AUTH_SERVICE binding (stubbed here) as a form with grant_type
// authorization_code and the Worker's own TTDAT_CLIENT_ID (a client_id the browser sends is
// ignored); auth/'s answer comes back as { access_token, expires_in, handle } (the handle from
// the ID token's preferred_username, null without one), no-store. auth/'s refusal → 400 with its
// error code; a missing field or an over-long body → 400 without calling auth/; auth/ unreadable
// → 502; sign-in not configured → 404; GET → 404. Nothing it handles is logged.
'use strict';

const path = require('path');
const { pathToFileURL } = require('url');
const { check, done } = require('../helpers/check');

const ROOT = path.join(__dirname, '..', '..');
const say = (...a) => process.stdout.write(a.join(' ') + '\n');
const logged = [];
for (const k of ['info', 'warn', 'error', 'debug']) console[k] = (...a) => logged.push(a.map(String).join(' '));
console.log = (...a) => { logged.push(a.map(String).join(' ')); say(...a); };

const ISSUER = 'http://localhost:8788', CLIENT = 'ttdatClient00001';
const b64url = s => Buffer.from(s).toString('base64url');
const ID_TOKEN = b64url('{"alg":"EdDSA","typ":"JWT","kid":"k1"}') + '.' +
    b64url(JSON.stringify({ iss: ISSUER, sub: 'u1', aud: CLIENT, preferred_username: 'alice.bsky.social' })) + '.c2ln';

function service(reply) {
    const seen = [];
    return { seen, fetch: async (input, init) => { seen.push({ input, init }); return reply(); } };
}
const OK = () => Response.json({ access_token: '01.secret-token', token_type: 'Bearer', expires_in: 14400, scope: 'profile ttdat:play', id_token: ID_TOKEN });

(async () => {
    const worker = (await import(pathToFileURL(path.join(ROOT, 'worker', 'index.js')).href)).default;
    const auth = await import(pathToFileURL(path.join(ROOT, 'worker', 'auth.js')).href);
    const send = (env, body, method = 'POST') => worker.fetch(new Request('https://ttdat.yuwakisa.com/auth/token', method === 'POST'
        ? { method, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body } : { method }), env, { waitUntil() {} });
    const form = o => new URLSearchParams(o).toString();
    const GOOD = form({ code: 'the-code', code_verifier: 'v'.repeat(43), redirect_uri: 'http://localhost:8787/', client_id: 'someone-else' });

    {
        const s = service(OK);
        logged.length = 0;
        const res = await send({ AUTH_SERVICE: s, AUTH_ISSUER: ISSUER, TTDAT_CLIENT_ID: CLIENT }, GOOD);
        const body = await res.json();
        check('a good exchange → 200 { access_token, expires_in, handle }', res.status === 200 &&
            JSON.stringify(body) === JSON.stringify({ access_token: '01.secret-token', expires_in: 14400, handle: 'alice.bsky.social' }));
        check('… not cached', res.headers.get('Cache-Control') === 'no-store');
        const call = s.seen[0];
        check('auth/\'s /token is called once, through the binding, as a POST form', s.seen.length === 1 && call.input === ISSUER + '/token'
            && call.init.method === 'POST' && call.init.headers['Content-Type'] === 'application/x-www-form-urlencoded');
        const sent = Object.fromEntries(new URLSearchParams(call.init.body));
        check('the form has grant_type, the code, the verifier, the redirect URI and the Worker\'s client id',
            JSON.stringify(sent) === JSON.stringify({ grant_type: 'authorization_code', code: 'the-code', redirect_uri: 'http://localhost:8787/', client_id: CLIENT, code_verifier: 'v'.repeat(43) }));
        check('nothing it handled is logged', !logged.some(l => /secret-token|the-code|alice|vvvv/.test(l)));
    }
    {
        const s = service(() => Response.json({ access_token: 'tok', expires_in: 60, scope: 'ttdat:play' }));
        const body = await (await send({ AUTH_SERVICE: s, AUTH_ISSUER: ISSUER, TTDAT_CLIENT_ID: CLIENT }, GOOD)).json();
        check('no ID token → handle null', body.access_token === 'tok' && body.handle === null);
    }
    check('handleFrom: no preferred_username → null', auth.handleFrom(b64url('{}') + '.' + b64url('{"sub":"u"}') + '.x') === null);
    check('handleFrom: garbage → null', auth.handleFrom('not.a.jwt') === null && auth.handleFrom(42) === null);
    {
        const s = service(() => Response.json({ error: 'invalid_grant', error_description: 'code spent' }, { status: 400 }));
        logged.length = 0;
        const res = await send({ AUTH_SERVICE: s, AUTH_ISSUER: ISSUER, TTDAT_CLIENT_ID: CLIENT }, GOOD);
        const body = await res.json();
        check('auth/ refuses → 400 with its error code only', res.status === 400 && JSON.stringify(body) === '{"error":"invalid_grant"}');
        check('… logged by its code, with nothing of the request', logged.some(l => l.includes('invalid_grant')) && !logged.some(l => l.includes('the-code')));
    }
    {
        const s = service(() => new Response('<html>oops</html>', { status: 500 }));
        const res = await send({ AUTH_SERVICE: s, AUTH_ISSUER: ISSUER, TTDAT_CLIENT_ID: CLIENT }, GOOD);
        check('auth/ unreadable → 502', res.status === 502);
    }
    for (const [label, body] of [
        ['no code', form({ code_verifier: 'v'.repeat(43), redirect_uri: 'http://localhost:8787/' })],
        ['no verifier', form({ code: 'c', redirect_uri: 'http://localhost:8787/' })],
        ['no redirect URI', form({ code: 'c', code_verifier: 'v'.repeat(43) })],
        ['an over-long body', form({ code: 'c'.repeat(auth.MAX_EXCHANGE_BYTES), code_verifier: 'v'.repeat(43), redirect_uri: 'http://localhost:8787/' })],
    ]) {
        const s = service(OK);
        const res = await send({ AUTH_SERVICE: s, AUTH_ISSUER: ISSUER, TTDAT_CLIENT_ID: CLIENT }, body);
        check(label + ' → 400 invalid_request, auth/ never called', res.status === 400 && (await res.json()).error === 'invalid_request' && s.seen.length === 0);
    }
    {
        const res = await send({}, GOOD);
        check('sign-in not configured → 404', res.status === 404 && (await res.json()).error === 'sign_in_unavailable');
        const get = await send({ AUTH_SERVICE: service(OK), AUTH_ISSUER: ISSUER, TTDAT_CLIENT_ID: CLIENT }, null, 'GET');
        check('GET /auth/token → 404', get.status === 404);
    }
    done();
})().catch(e => { say('FAIL threw: ' + (e && e.stack)); process.exit(1); });

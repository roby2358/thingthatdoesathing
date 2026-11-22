// worker/auth.js — the ttdat Worker's half of the optional Bluesky sign-in (D-68).
//
// Thing Factory is a public OAuth client of yuwakisacloud's auth/ (authorization code with PKCE,
// run in the browser, signin.js). auth/ is reached only through the AUTH_SERVICE service binding
// (a public fetch from one same-zone Worker to another can fail with an edge 522), with its issuer
// URL in AUTH_ISSUER and this game's client row id in TTDAT_CLIENT_ID. Two jobs:
//
//   exchangeCode — POST /auth/token: the browser's code and PKCE verifier, passed on to auth/'s
//     POST /token, which has no CORS (auth/ D-38), so the browser can't call it itself. Answers
//     { access_token, expires_in, handle } (the handle from the ID token's preferred_username,
//     which came straight from auth/ over the binding), or { error }.
//   identityFor — a telemetry batch's `token`: verified offline with auth/'s keys (the vendored
//     auth-client's verifyAccessToken, handed in by worker/index.js so tests can stub it). A
//     valid token for this client with the play scope gives the batch the identity
//     { playerId: SHA-256 hex of PLAYER_SALT + sub, signedIn: 1 }; anything else gives null and
//     the batch keeps its random per-load ID. A batch is never refused over auth.
//
// Nothing here logs or stores a token, a code, a verifier, a handle or a `sub`. Plain JavaScript.

/** The scope this game asks for and a telemetry token must carry. */
export const PLAY_SCOPE = 'ttdat:play';
/** Hashed with `sub` into a signed-in player_id. A constant of this game's own, so the ID matches
 *  no other service's hash of the same account. Changing it splits every signed-in player in two. */
export const PLAYER_SALT = 'ttdat-player-v1:';
export const CLOCK_SKEW_S = 60;
export const MAX_TOKEN_CHARS = 4096;      // longer than any auth/ access token; a longer one isn't verified
export const MAX_EXCHANGE_BYTES = 4096;   // the token exchange's form body
export const MAX_HANDLE_CHARS = 253;      // a DNS name, which a Bluesky handle is

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Is sign-in wired into this Worker (the binding and both vars)? */
function configured(env) {
    return !!(env && env.AUTH_SERVICE && typeof env.AUTH_SERVICE.fetch === 'function' && env.AUTH_ISSUER && env.TTDAT_CLIENT_ID);
}

/** The salted SHA-256 of `sub`, as 64 hex chars (the telemetry player_id's limit). */
export async function playerIdFor(sub) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(PLAYER_SALT + sub));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A batch's token → its signed-in identity, or null (no token, a token that isn't a string, sign-in
 * not configured, a token that fails verification, the wrong audience or no play scope, or any
 * error, which it never throws). `verify` is the auth-client's verifyAccessToken(token, options) → VerifyResult.
 */
export async function identityFor(token, env, verify, nowSeconds) {
    if (typeof token !== 'string' || token === '' || token.length > MAX_TOKEN_CHARS) return null;
    if (!configured(env)) return null;
    try {
        const result = await verify(token, {
            expected_issuer: env.AUTH_ISSUER,
            expected_audience: env.TTDAT_CLIENT_ID,
            fetcher: (input, init) => env.AUTH_SERVICE.fetch(input, init),
            now_s: nowSeconds,
            clock_skew_s: CLOCK_SKEW_S,
        });
        if (!result || result.valid !== true) {
            console.error('sign-in token not accepted: ' + (result && typeof result.reason === 'string' ? result.reason : 'invalid'));
            return null;
        }
        const { sub, scope } = result.claims || {};
        if (typeof sub !== 'string' || sub === '' || typeof scope !== 'string' || !scope.split(' ').includes(PLAY_SCOPE)) {
            console.error('sign-in token not accepted: no ' + PLAY_SCOPE);
            return null;
        }
        return { playerId: await playerIdFor(sub), signedIn: 1 };
    } catch (e) {
        console.error('sign-in token not checked: ' + (e && e.name ? e.name : 'error'));
        return null;
    }
}

function answer(body, status) {
    return Response.json(body, { status, headers: NO_STORE });
}

/** The ID token's preferred_username (a JWT's payload, read, not verified: it came from auth/ over
 *  the binding in the same response as the access token), or null. */
export function handleFrom(idToken) {
    if (typeof idToken !== 'string') return null;
    try {
        const part = idToken.split('.')[1];
        const json = atob(part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4));
        const name = JSON.parse(new TextDecoder().decode(Uint8Array.from(json, c => c.charCodeAt(0)))).preferred_username;
        return typeof name === 'string' && name !== '' && name.length <= MAX_HANDLE_CHARS ? name : null;
    } catch (e) {
        return null;
    }
}

/**
 * POST /auth/token: form fields code, code_verifier, redirect_uri (the browser's own; auth/ checks
 * it against the client row and the code). The client id is this Worker's, never the browser's.
 * 200 { access_token, expires_in, handle } · 400 { error } (auth/'s error code, or invalid_request)
 * · 404 { error: 'sign_in_unavailable' } when sign-in isn't configured · 502 when auth/ can't be read.
 */
export async function exchangeCode(request, env) {
    if (!configured(env)) return answer({ error: 'sign_in_unavailable' }, 404);
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_EXCHANGE_BYTES) return answer({ error: 'invalid_request' }, 400);
    const form = new URLSearchParams(text);
    const code = form.get('code'), verifier = form.get('code_verifier'), redirectUri = form.get('redirect_uri');
    if (!code || !verifier || !redirectUri) return answer({ error: 'invalid_request' }, 400);
    const body = new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: env.TTDAT_CLIENT_ID, code_verifier: verifier,
    });
    let res, data;
    try {
        res = await env.AUTH_SERVICE.fetch(env.AUTH_ISSUER + '/token', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
        });
        data = await res.json();
    } catch (e) {
        console.error('sign-in token exchange failed: auth/ unreadable');
        return answer({ error: 'server_error' }, 502);
    }
    if (!res.ok || !data || typeof data.access_token !== 'string') {
        const error = data && typeof data.error === 'string' && /^[a-z_]{1,40}$/.test(data.error) ? data.error : 'server_error';
        console.error('sign-in token exchange refused: ' + error);
        return answer({ error }, 400);
    }
    const expiresIn = Number.isSafeInteger(data.expires_in) && data.expires_in > 0 ? data.expires_in : null;
    return answer({ access_token: data.access_token, expires_in: expiresIn, handle: handleFrom(data.id_token) }, 200);
}

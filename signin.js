// signin.js — GameSignIn, the browser half of the optional "Sign in with Bluesky" (D-68).
//
// Playing never needs it; for now signing in only changes how telemetry counts the player (a
// salted hash of the auth/ account instead of a random per-load ID). Thing Factory is a public
// OAuth client of yuwakisacloud's auth/: authorization code with PKCE, run here. begin() makes a
// verifier and a state (SIGNIN_STATE_PREFIX + a random part), keeps both in sessionStorage
// (SIGNIN_FLOW_KEY) across the redirect, and sends the page to auth/'s /authorize, where the player
// picks "Sign in with Bluesky". auth/ comes back to the origin's root with ?code&state; GameUI's
// boot restores the saved game (D-67) and then calls finish(), which takes the flow out of
// sessionStorage, strips the OAuth parameters from the URL and trades the code for an access
// token at the Worker's SIGNIN_TOKEN_PATH (auth/'s /token has no CORS, so the Worker passes it on
// through its service binding). The token, the handle (when auth/ sent one) and its expiry go in
// localStorage[AUTH_KEY]. No refresh token: an expired or unreadable sign-in counts as signed out.
//
// Offered only where SIGNIN_SITES names the page's origin (the live site, wrangler dev): never
// from file://, the dev page or a portal's iframe, where a redirect would break the frame. Every
// storage touch is in try/catch; nothing here throws into the game.
const GameSignIn = (function () {
    const { SIGNIN_SITES, SIGNIN_SCOPE, SIGNIN_TOKEN_PATH, SIGNIN_STATE_PREFIX, AUTH_KEY, SIGNIN_FLOW_KEY } = GameDisplayArtifacts;
    // The OAuth parameters a return may carry; finish() strips them from the URL.
    const RETURN_PARAMS = ['code', 'state', 'error', 'error_description', 'iss'];

    const loc = () => window.location || {};
    const unixSeconds = () => Math.floor(Date.now() / 1000);

    // This origin's sign-in settings, or null where sign-in isn't offered.
    function site() {
        const l = loc();
        if (!/^https?:$/.test(l.protocol || '') || typeof l.origin !== 'string') return null;
        return Object.prototype.hasOwnProperty.call(SIGNIN_SITES, l.origin) ? SIGNIN_SITES[l.origin] : null;
    }

    const redirectUri = () => loc().origin + '/';

    function storage(kind) {
        try { return window[kind] || null; } catch (e) { return null; }
    }

    function readJson(kind, key) {
        try {
            const s = storage(kind), text = s && s.getItem(key);
            return text ? JSON.parse(text) : null;
        } catch (e) { return undefined; }   // there, but unreadable
    }

    function writeJson(kind, key, value) {
        try { storage(kind).setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    }

    function remove(kind, key) {
        try { const s = storage(kind); if (s) s.removeItem(key); } catch (e) { /* nothing to remove */ }
    }

    function base64url(bytes) {
        let s = '';
        for (const b of bytes) s += String.fromCharCode(b);
        return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    const randomPart = n => base64url(crypto.getRandomValues(new Uint8Array(n)));

    function params() {
        try { return new URLSearchParams(loc().search || ''); } catch (e) { return new URLSearchParams(''); }
    }

    // The page's URL without the OAuth parameters, so a reload isn't another return.
    function stripUrl() {
        try {
            const l = loc(), p = params();
            for (const k of RETURN_PARAMS) p.delete(k);
            const q = p.toString();
            window.history.replaceState(null, '', (l.pathname || '/') + (q ? '?' + q : '') + (l.hash || ''));
        } catch (e) { /* no history API: the URL keeps them, and a reload finds no flow */ }
    }

    return {
        // Is sign-in offered on this page?
        offered() {
            return !!site();
        },

        // The sign-in in localStorage, or null: not offered here, none, unreadable or expired (the
        // last two are removed). { token, handle (null if auth/ sent none), expiresAt (unix s) }.
        current() {
            if (!site()) return null;
            const a = readJson('localStorage', AUTH_KEY);
            if (a === null) return null;
            if (!a || typeof a.token !== 'string' || !a.token || !Number.isFinite(a.expiresAt) || a.expiresAt <= unixSeconds()) {
                remove('localStorage', AUTH_KEY);
                return null;
            }
            return { token: a.token, handle: typeof a.handle === 'string' && a.handle ? a.handle : null, expiresAt: a.expiresAt };
        },

        // Forget the sign-in (the bar's Sign out, GameUI.signOut): only the local copy. auth/ is
        // never asked to revoke it; its access tokens are short-lived (D-69).
        signOut() {
            remove('localStorage', AUTH_KEY);
        },

        // Is this page load a return from the sign-in redirect? Its OAuth state has the prefix,
        // whether the sign-in worked (code) or not (error).
        isReturn() {
            const state = params().get('state');
            return typeof state === 'string' && state.startsWith(SIGNIN_STATE_PREFIX);
        },

        // Send the page to auth/'s /authorize. The caller saves the game first (D-67). Resolves
        // false, with the page left as it was, if sign-in isn't offered or the flow can't be kept.
        async begin() {
            const s = site();
            if (!s) return false;
            try {
                const verifier = randomPart(32), state = SIGNIN_STATE_PREFIX + randomPart(16);
                const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
                if (!writeJson('sessionStorage', SIGNIN_FLOW_KEY, { state, verifier })) return false;
                const query = new URLSearchParams({
                    response_type: 'code', client_id: s.clientId, redirect_uri: redirectUri(), scope: SIGNIN_SCOPE,
                    state, code_challenge: base64url(new Uint8Array(digest)), code_challenge_method: 'S256',
                });
                loc().assign(s.issuer + '/authorize?' + query.toString());
                return true;
            } catch (e) {
                return false;
            }
        },

        // At boot, after the save is restored: on a return, the flow leaves sessionStorage and the
        // OAuth parameters leave the URL, then a code whose state matches is traded for a token.
        // Resolves the new sign-in (as current() gives it), or null: not a return, cancelled, a
        // state that doesn't match, or any failure, all silently.
        async finish() {
            if (!this.isReturn()) return null;
            const p = params(), code = p.get('code'), state = p.get('state');
            const flow = readJson('sessionStorage', SIGNIN_FLOW_KEY);
            remove('sessionStorage', SIGNIN_FLOW_KEY);
            stripUrl();
            if (!site() || !code || !flow || flow.state !== state || typeof flow.verifier !== 'string') return null;
            try {
                const res = await fetch(SIGNIN_TOKEN_PATH, {
                    method: 'POST', credentials: 'omit',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ code, code_verifier: flow.verifier, redirect_uri: redirectUri() }).toString(),
                });
                if (!res.ok) return null;
                const data = await res.json();
                if (!data || typeof data.access_token !== 'string' || !data.access_token ||
                    !Number.isSafeInteger(data.expires_in) || data.expires_in <= 0) return null;
                const auth = {
                    token: data.access_token,
                    handle: typeof data.handle === 'string' && data.handle ? data.handle : null,
                    expiresAt: unixSeconds() + data.expires_in,
                };
                writeJson('localStorage', AUTH_KEY, auth);   // refused: signed in for this page load only
                return auth;
            } catch (e) {
                return null;
            }
        },
    };
})();

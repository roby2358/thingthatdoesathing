// R-76 — the browser half of the optional sign-in (signin.js GameSignIn and GameUI's sign-in
// spots, D-68), on the real page in a stub DOM (test/helpers/page.js).
//   - offered only on SIGNIN_SITES origins (the live site, localhost:8787): there the top-left bar,
//     the intro and New Game show Sign in and About's credits page a signed-out line; on any other
//     origin (the dev page, a portal's iframe, file://) every spot and the line are hidden and
//     both Sign in paths do nothing
//   - the intro's Sign in sends the page to auth/'s /authorize with response_type code, the site's
//     client id, the origin's root as redirect URI, SIGNIN_SCOPE, a state that starts with
//     SIGNIN_STATE_PREFIX and an S256 challenge of the verifier kept in sessionStorage; nothing is
//     saved. New Game's Sign in, over a game, doesn't save either
//   - the top-left bar's Sign in during play puts the picked card back, drops the selection, saves
//     the game (SAVE_KEY), turns Go off and redirects; under an overlay it does nothing; a save that
//     is refused leaves the page where it was with a notice
//   - a return (?code&state with the prefix) with a matching flow restores the game, trades the
//     code at SIGNIN_TOKEN_PATH (code, verifier, redirect URI), stores { token, handle, expiresAt }
//     under AUTH_KEY, removes the flow, strips the OAuth parameters from the URL, shows the handle
//     (bar, panels, About) and gives telemetry the token; a mismatched state, a cancelled sign-in
//     (error=access_denied) or a refused exchange stores nothing (the game is still restored)
//   - at boot a stored, unexpired sign-in shows its handle ("Signed in" without one) and telemetry
//     batches carry its token; an expired or unreadable one is removed and counts as signed out
'use strict';
const nodeCrypto = require('crypto');
const { check, done } = require('../helpers/check');
const { bootPage, memoryStorage } = require('../helpers/page');

const tick = () => new Promise(r => setImmediate(r));
async function settle() { for (let i = 0; i < 10; i++) await tick(); }
const hidden = (p, id) => p.els[id].classList.set.has('hidden');
const SPOTS = ['signin', 'intro-signin', 'size-signin'];
const LABELS = ['signin-label', 'intro-signin-label', 'size-signin-label'];

// A page with everything sign-in uses: real WebCrypto, session storage, history, a fetch stub.
function page({ origin = 'https://ttdat.yuwakisa.com', search = '', storage = memoryStorage(), session = memoryStorage(), reply = null } = {}) {
    const fetches = [], replaced = [];
    let uuids = 0;
    const p = bootPage({
        storage, search, origin,
        win: { sessionStorage: session, history: { replaceState: (s, t, url) => replaced.push(url) } },
        globals: {
            TextEncoder, btoa, atob,
            crypto: { getRandomValues: a => nodeCrypto.webcrypto.getRandomValues(a), subtle: nodeCrypto.webcrypto.subtle, randomUUID: () => 'uuid-' + (++uuids) },
            fetch: (url, init) => {
                fetches.push({ url, init });
                if (url === '/auth/token' && reply) return Promise.resolve(reply());
                return Promise.resolve({ ok: true, status: 204 });
            },
        },
    });
    return Object.assign(p, { fetches, replaced, session });
}

(async () => {
    const probe = page();
    const D = probe.run('GameDisplayArtifacts');
    const { AUTH_KEY, SIGNIN_FLOW_KEY, SIGNIN_STATE_PREFIX, SIGNIN_SCOPE, SIGNIN_TOKEN_PATH, SAVE_KEY, SIGNIN_SITES } = D;
    const now = () => Math.floor(Date.now() / 1000);

    // Offered or not, by origin.
    for (const origin of Object.keys(SIGNIN_SITES)) {
        const p = page({ origin });
        check(origin + ': Sign in shows in the bar and on both panels, the labels do not', SPOTS.every(id => !hidden(p, id)) && LABELS.every(id => hidden(p, id)));
        check(origin + ': About says signed out', !hidden(p, 'about-signin') && /Not signed in/.test(p.els['about-signin'].textContent));
    }
    for (const origin of ['http://localhost:8794', 'http://localhost:8000', 'https://html-classic.itch.zone', 'https://uploads.ungrounded.net', 'null']) {
        const p = page({ origin });
        check(origin + ': no Sign in anywhere, no About line', SPOTS.every(id => hidden(p, id)) && LABELS.every(id => hidden(p, id)) && hidden(p, 'about-signin'));
        p.ui.signInFromPanel();
        p.ui.startGame('small');
        p.ui.dismissOverlay();
        p.ui.signInFromGame();
        await settle();
        check(origin + ': both Sign in paths do nothing', p.assigned.length === 0 && !p.storage.map.has(SAVE_KEY));
    }

    // The intro's Sign in.
    {
        const p = page({ origin: 'http://localhost:8787' });
        check('the intro is up', p.ui.overlay === 'intro');
        p.ui.signInFromPanel();
        await settle();
        check('the intro\'s Sign in redirects once', p.assigned.length === 1);
        const url = new URL(p.assigned[0]);
        const q = Object.fromEntries(url.searchParams);
        const site = SIGNIN_SITES['http://localhost:8787'];
        check('… to the site\'s issuer /authorize', url.origin + url.pathname === site.issuer + '/authorize');
        check('… with response_type code, the client id, the root redirect URI and the scope',
            q.response_type === 'code' && q.client_id === site.clientId && q.redirect_uri === 'http://localhost:8787/' && q.scope === SIGNIN_SCOPE);
        const flow = JSON.parse(p.session.map.get(SIGNIN_FLOW_KEY));
        check('… a prefixed state, kept with the verifier in sessionStorage', q.state.startsWith(SIGNIN_STATE_PREFIX) && q.state.length > SIGNIN_STATE_PREFIX.length + 10 && flow.state === q.state);
        check('… the verifier is 43 unreserved chars', /^[A-Za-z0-9_-]{43}$/.test(flow.verifier));
        check('… and an S256 challenge of it', q.code_challenge_method === 'S256' && q.code_challenge === nodeCrypto.createHash('sha256').update(flow.verifier).digest('base64url'));
        check('… nothing saved', !p.storage.map.has(SAVE_KEY));
    }
    // New Game's Sign in over a game: no save either.
    {
        const p = page();
        p.ui.startGame('small');
        p.ui.dismissOverlay();
        p.ui.newGame();
        p.ui.signInFromPanel();
        await settle();
        check('New Game\'s Sign in redirects without saving', p.assigned.length === 1 && !p.storage.map.has(SAVE_KEY));
    }

    // The bar's Sign in during play.
    {
        const p = page();
        p.ui.startGame('small');
        p.ui.dismissOverlay();
        for (let i = 0; i < 4; i++) p.engine.wait();
        p.ui.openHelp();
        p.ui.signInFromGame();
        await settle();
        check('under an overlay the bar\'s Sign in does nothing', p.assigned.length === 0 && !p.storage.map.has(SAVE_KEY));
        p.ui.dismissOverlay();
        p.ui.setRunning(true);
        p.ui.pick(0);
        p.ui.select(p.state.sources[0].q, p.state.sources[0].r);
        p.ui.signInFromGame();
        check('it puts the card back, drops the selection and turns Go off', p.ui.picked === null && p.ui.selected === null && p.ui.running === false);
        const save = p.storage.map.has(SAVE_KEY) && JSON.parse(p.storage.map.get(SAVE_KEY));
        check('it saves the game first, Go as it was', save && JSON.stringify(save.state) === JSON.stringify(p.engine.save()) && save.ui.running === true);
        await settle();
        check('then redirects', p.assigned.length === 1 && p.assigned[0].startsWith(SIGNIN_SITES['https://ttdat.yuwakisa.com'].issuer + '/authorize?'));
    }
    {
        const full = { ...memoryStorage(), setItem: () => { throw new Error('QuotaExceededError'); } };
        const p = page({ storage: full });
        p.ui.startGame('small');
        p.ui.dismissOverlay();
        p.ui.signInFromGame();
        await settle();
        check('a refused save: no redirect, a notice', p.assigned.length === 0 && p.ui.notice === D.REASONS.signInSave);
    }

    // A return.
    const maker = page();
    maker.ui.startGame('small');
    maker.ui.dismissOverlay();
    for (let i = 0; i < 5; i++) maker.engine.wait();
    maker.ui.saveForRedirect();
    const saveText = maker.storage.map.get(SAVE_KEY);
    const state = SIGNIN_STATE_PREFIX + 'abcdefghijklmnop';
    const flowText = JSON.stringify({ state, verifier: 'w'.repeat(43) });
    const tokenReply = () => ({ ok: true, status: 200, json: async () => ({ access_token: '01.tok', expires_in: 14400, handle: 'alice.test' }) });
    {
        const p = page({ search: '?code=C0DE&state=' + state, storage: memoryStorage({ [SAVE_KEY]: saveText }), session: memoryStorage({ [SIGNIN_FLOW_KEY]: flowText }), reply: tokenReply });
        check('a return restores the game', p.ui.overlay === null && JSON.stringify(p.engine.save()) === JSON.stringify(maker.engine.save()));
        await settle();
        const ex = p.fetches.find(f => f.url === SIGNIN_TOKEN_PATH);
        const sent = ex && Object.fromEntries(new URLSearchParams(ex.init.body));
        check('it trades the code at SIGNIN_TOKEN_PATH with the verifier and the redirect URI', ex && ex.init.method === 'POST' &&
            JSON.stringify(sent) === JSON.stringify({ code: 'C0DE', code_verifier: 'w'.repeat(43), redirect_uri: 'https://ttdat.yuwakisa.com/' }));
        const stored = p.storage.map.has(AUTH_KEY) && JSON.parse(p.storage.map.get(AUTH_KEY));
        check('the sign-in is stored: token, handle, expiry', stored && stored.token === '01.tok' && stored.handle === 'alice.test' && Math.abs(stored.expiresAt - (now() + 14400)) <= 2);
        check('the flow is gone from sessionStorage', !p.session.map.has(SIGNIN_FLOW_KEY));
        check('the OAuth parameters are stripped from the URL', p.replaced.length === 1 && p.replaced[0] === '/');
        check('every spot shows @alice.test, no Sign in', LABELS.every(id => !hidden(p, id) && p.els[id].textContent === '@alice.test') && SPOTS.every(id => hidden(p, id)));
        check('About says so', p.els['about-signin'].textContent === 'Signed in with Bluesky as @alice.test.');
        const batches = p.fetches.filter(f => /\/t$/.test(f.url)).map(f => JSON.parse(f.init.body));
        check('what telemetry had queued went first, under the random ID and no token', batches.length === 1 && !('token' in batches[0]) && batches[0].games.length === 1);
        p.run("GameTelemetry.command('discard', { kind: 'BELT', how: 'pick' }, { ok: true, events: [] }, state)");
        const batch = p.run('GameTelemetry.pending()');
        check('the next batch carries the token, under a new random ID', batch && batch.token === '01.tok' && batch.player !== batches[0].player);
    }
    for (const [label, search, session, reply] of [
        ['a state that doesn\'t match', '?code=C0DE&state=' + SIGNIN_STATE_PREFIX + 'other', flowText, tokenReply],
        ['a cancelled sign-in', '?error=access_denied&state=' + state, flowText, tokenReply],
        ['no flow kept', '?code=C0DE&state=' + state, null, tokenReply],
        ['a refused exchange', '?code=C0DE&state=' + state, flowText, () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) })],
    ]) {
        const p = page({ search, storage: memoryStorage({ [SAVE_KEY]: saveText }), session: memoryStorage(session ? { [SIGNIN_FLOW_KEY]: session } : {}), reply });
        await settle();
        check(label + ': the game is restored, nothing stored, signed out', p.ui.overlay === null && !p.storage.map.has(AUTH_KEY) &&
            !hidden(p, 'signin') && hidden(p, 'signin-label') && !p.session.map.has(SIGNIN_FLOW_KEY));
    }

    // A stored sign-in at boot.
    {
        const p = page({ storage: memoryStorage({ [AUTH_KEY]: JSON.stringify({ token: '01.kept', handle: 'bob.test', expiresAt: now() + 600 }) }) });
        check('a stored sign-in shows its handle', LABELS.every(id => p.els[id].textContent === '@bob.test' && !hidden(p, id)) && SPOTS.every(id => hidden(p, id)));
        p.ui.startGame('small');
        check('… and telemetry carries its token', p.run('GameTelemetry.pending()').token === '01.kept');
        p.ui.signInFromGame();
        p.ui.signInFromPanel();
        await settle();
        check('… and Sign in does nothing while signed in', p.assigned.length === 0);
    }
    {
        const p = page({ storage: memoryStorage({ [AUTH_KEY]: JSON.stringify({ token: '01.kept', handle: null, expiresAt: now() + 600 }) }) });
        check('no handle: "Signed in"', p.els['signin-label'].textContent === 'Signed in' && p.els['about-signin'].textContent === 'Signed in with Bluesky.');
    }
    for (const [label, text] of [['expired', JSON.stringify({ token: '01.old', handle: 'x', expiresAt: now() - 1 })], ['unreadable', '{"tok'], ['no token', JSON.stringify({ handle: 'x', expiresAt: now() + 600 })]]) {
        const storage = memoryStorage({ [AUTH_KEY]: text });
        const p = page({ storage });
        p.ui.startGame('small');
        check('a stored sign-in ' + label + ': removed, signed out, no token sent', !storage.map.has(AUTH_KEY) && !hidden(p, 'signin') && hidden(p, 'signin-label') &&
            !('token' in p.run('GameTelemetry.pending()')));
    }
    done();
})().catch(e => { console.log('FAIL threw: ' + (e && e.stack)); process.exit(1); });

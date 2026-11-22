// worker/index.js — the ttdat Worker's entry module (D-64, D-68, D-78). The static assets (dist/web) serve
// every file; only a request that matches none reaches this script. POST /t takes a telemetry
// batch (telemetry.js); POST /auth/token passes the sign-in's code exchange on to auth/ (auth.js);
// POST /achievements reads and adds to a signed-in player's lifetime totals (achievements.js);
// everything else gets 404. The Workers runtime reads every named export of this module as an
// entrypoint, so its only named export is PlayerTotals, the Durable Object class wrangler.jsonc's
// PLAYER_TOTALS binding names (player_totals.js); the fetch handler is the default export.
//
// The vendored auth-client (TypeScript, compiled by wrangler's bundler) is imported lazily, on the
// first token it must check with sign-in configured: the Node tests import this module as
// plain JS (with a stub for 'cloudflare:workers', test/helpers/cloudflare.js) and never reach it.
import { telemetry } from './telemetry.js';
import { exchangeCode } from './auth.js';
import { achievements } from './achievements.js';

export { PlayerTotals } from './player_totals.js';

let authClient = null;
async function verifyAccessToken(token, options) {
    authClient ||= import('./vendor/auth-client/index.ts');
    return (await authClient).verifyAccessToken(token, options);
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (request.method === 'POST' && url.pathname === '/t') return telemetry(request, env, ctx, verifyAccessToken);
        if (request.method === 'POST' && url.pathname === '/auth/token') return exchangeCode(request, env);
        if (request.method === 'POST' && url.pathname === '/achievements') return achievements(request, env, verifyAccessToken);
        return new Response('Not found', { status: 404 });
    },
};

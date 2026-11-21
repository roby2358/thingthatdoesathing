// worker/index.js — the ttdat Worker's entry module (D-64, D-68). The static assets (dist/web) serve
// every file; only a request that matches none reaches this script. POST /t takes a telemetry
// batch (telemetry.js); POST /auth/token passes the sign-in's code exchange on to auth/ (auth.js);
// everything else gets 404. The Workers runtime reads every named export of this module as an
// entrypoint, so it has only the default one.
//
// The vendored auth-client (TypeScript, compiled by wrangler's bundler) is imported lazily, on the
// first batch that carries a token with sign-in configured: the Node tests import this module as
// plain JS and never reach it.
import { telemetry } from './telemetry.js';
import { exchangeCode } from './auth.js';

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
        return new Response('Not found', { status: 404 });
    },
};

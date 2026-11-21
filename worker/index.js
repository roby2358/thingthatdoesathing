// worker/index.js — the ttdat Worker's entry module (D-64). The static assets (dist/web) serve
// every file; only a request that matches none reaches this script, and of those only POST /t
// does anything (telemetry.js): everything else gets 404. The Workers runtime reads every named
// export of this module as an entrypoint, so it has only the default one.
import { telemetry } from './telemetry.js';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname !== '/t' || request.method !== 'POST') return new Response('Not found', { status: 404 });
        return telemetry(request, env, ctx);
    },
};

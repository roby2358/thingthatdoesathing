// worker/achievements.js — POST /achievements: a signed-in player's lifetime totals per counter,
// kept server-side in the PlayerTotals Durable Object (worker/player_totals.js), one per player,
// so achievements follow the player across devices (D-78). worker/index.js routes to it.
//
//   body (JSON, sent as text/plain like /t, so a browser sends it with no CORS preflight):
//     { token: string, add?: { counterKey: whole number } }
//   200 { totals: { key: n } }   every counter with a total, after the add
//   400  a bad body: not JSON or not an object, over MAX_BODY_BYTES, `add` not an object, more than
//        MAX_ADD_KEYS keys, a key not in ACHIEVEMENT_COUNTERS, a value not a whole number in
//        0…MAX_ADD_VALUE
//   401  no token, or one that doesn't verify (auth.js identityFor: issuer, audience
//        TTDAT_CLIENT_ID, PLAY_SCOPE)
//   403 / 429  the same Origin allow-list and TELEMETRY_LIMIT rate limit as /t, before the body
//        is read (telemetry.js, D-70)
//   503  no PLAYER_TOTALS binding, or the object failed
// Every answer carries Access-Control-Allow-Origin * (as /t's do) and Cache-Control no-store.
//
// The object is named by the player hash identityFor makes; the sub is never stored, logged or
// sent on. The IP is only the rate limiter's key. Nothing here writes telemetry rows. Plain
// JavaScript, no build.

import { identityFor } from './auth.js';
import { originAllowed, underLimit, readJsonObject } from './telemetry.js';

/** The counters a total may be kept for: every GameArtifacts.COUNTERS key, perGame or not, in
 *  table order, restated here (the Worker can't load the game's scripts; R-101 checks they match). */
export const ACHIEVEMENT_COUNTERS = ['cratesDelivered', 'bigDelivered', 'exGremlins', 'trapped', 'placed', 'springThrows',
    'rocketFlights', 'cannonLobs', 'moved', 'bombs', 'slides', 'mountainsFlown', 'pushes', 'pulls', 'pushesPulls',
    'milestones', 'goalsMet', 'rungsReached', 'cratesSunk', 'cratesSmashed', 'cratesLostOther', 'discards'];
/** The most keys one add may carry. */
export const MAX_ADD_KEYS = 64;
/** The largest increment one add may carry for a counter. */
export const MAX_ADD_VALUE = 100000;

const HEADERS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };

function answer(body, status) {
    return body === null ? new Response(null, { status, headers: HEADERS }) : Response.json(body, { status, headers: HEADERS });
}

/** A bad body: logged with the field it failed on, never a value. */
function refuse(where) {
    console.error('achievements refused: ' + where);
    return answer(null, 400);
}

/** The body's `add` → the increments, or a string naming what's wrong. */
function readAdd(add) {
    if (add === undefined || add === null) return {};
    if (typeof add !== 'object' || Array.isArray(add)) return 'add';
    const entries = Object.entries(add);
    if (entries.length > MAX_ADD_KEYS) return 'add: too many keys';
    for (const [key, n] of entries) {
        if (!ACHIEVEMENT_COUNTERS.includes(key)) return 'add: unknown counter';
        if (!Number.isSafeInteger(n) || n < 0 || n > MAX_ADD_VALUE) return 'add: bad value';
    }
    return Object.fromEntries(entries);
}

/** POST /achievements. `verify` checks the token (the auth-client's verifyAccessToken; worker/index.js passes it). */
export async function achievements(request, env, verify) {
    if (!originAllowed(request.headers.get('Origin'), env)) return answer(null, 403);
    if (!(await underLimit(request, env))) return answer(null, 429);
    const body = await readJsonObject(request);
    if (typeof body === 'string') return refuse(body);
    const increments = readAdd(body.add);
    if (typeof increments === 'string') return refuse(increments);

    const identity = await identityFor(body.token, env, verify, Math.floor(Date.now() / 1000));
    if (!identity) return answer(null, 401);

    const ns = env.PLAYER_TOTALS;
    if (!ns) {
        console.error('achievements unavailable: no PLAYER_TOTALS binding');
        return answer(null, 503);
    }
    try {
        const stub = ns.get(ns.idFromName(identity.playerId));
        const { totals } = Object.keys(increments).length > 0 ? await stub.add(increments) : await stub.totals();
        return answer({ totals }, 200);
    } catch (e) {
        console.error('achievements unavailable: ' + (e && e.name ? e.name : 'error'));
        return answer(null, 503);
    }
}

// worker/telemetry.js — POST /t, the ttdat Worker's one route: telemetry batches into D1 (D-64).
// worker/index.js routes to it. A batch is one JSON object sent as text/plain (so a browser
// sends it with no CORS preflight, and sendBeacon can carry it):
//
//   { format: 1, player: string, token?: string,
//     games?: [game…], events?: [event…], milestones?: [milestone…], crashes?: [crash…],
//     goalSets?: [goal set…], goalsMet?: [goal met…] }            // the goal lists: D-77
//
// It is checked whole (at most MAX_BODY_BYTES, at most MAX_RECORDS records, known record
// types, field types) and answered 204 before anything is written: the rows go to D1 in one
// db.batch() handed to ctx.waitUntil, so the reply never waits on the database, and a write
// that fails is logged and dropped. A batch that fails its checks gets 400 and writes nothing.
// A missing or unknown `format` gets 204 and is dropped quietly: the portal zips keep running
// old builds for months, and an old client isn't malformed. Bump TELEMETRY_FORMAT (here and in
// GameDisplayArtifacts) when a field is renamed, removed or retyped, keep the old reader in
// READERS, and add the new one; a new optional field needs no bump (unknown fields are ignored).
//
// Identity is per batch: every row a batch writes carries the batch's player_id and signed_in.
// A batch whose `token` is a valid sign-in access token (auth.js identityFor, D-68) is stamped
// with the salted hash of its `sub` and signed_in 1; any other batch (no token, a bad or expired
// one, sign-in not configured) with its random `player` and signed_in 0. A batch is never refused
// over its token, and the token is checked inside the ctx.waitUntil write, so the reply never
// waits on it either. The token is never logged or stored. The tables are in
// telemetry_schema.sql. Plain JavaScript, no build.
//
// Two guards run before the body is read (D-70):
//   - Origin allow-list: a request whose Origin header is set and isn't in TELEMETRY_ORIGINS (or
//     env.TELEMETRY_DEV_ORIGINS, a comma-separated var only wrangler dev's config sets) gets 403
//     and writes nothing. It only stops other websites posting from their visitors' browsers: a
//     request with no Origin (curl, some sendBeacons) goes on, and Origin is forged at will
//     outside a browser.
//   - Rate limit: the TELEMETRY_LIMIT binding (a Workers Rate Limiting binding, wrangler.jsonc's
//     `ratelimits`), keyed by the request's CF-Connecting-IP, allows TELEMETRY_RATE_LIMIT.limit
//     requests per TELEMETRY_RATE_LIMIT.period seconds: 1000 per 10 s, about 100 a second. A
//     tripwire for floods, not a budget: a player sends about 2 batches a minute, and a school's
//     worth of players behind one IP never comes near it. Over it: 429, nothing written. The IP is
//     only the limiter's key: never written to D1, logged or echoed back; the counters are
//     Cloudflare's, short-lived and in memory. No binding (the Node tests' plain env) or a
//     limiter that throws lets the request through: the limiter is a precaution, never a reason
//     to lose data.
// Nothing else here reads the request's IP or any header but Origin and the body's length.

import { identityFor } from './auth.js';

/** The format this build's browser sends (GameDisplayArtifacts.TELEMETRY_FORMAT). */
export const TELEMETRY_FORMAT = 1;
export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_RECORDS = 200;
/** The engine's commands an event may name (R-68 checks each is a GameEngine method). */
export const KNOWN_COMMANDS = ['place', 'rotate', 'remove', 'blast', 'move', 'scrap', 'bomb', 'discard', 'wait'];
export const CRASH_MESSAGE_CHARS = 500;     // a crash's message and stack are cut, not refused
export const CRASH_STACK_CHARS = 2000;
/** The goal counters a goal record may name (D-77): GameArtifacts.COUNTERS' keys with `goal` true,
 *  in table order, restated here (the Worker can't load the game's scripts; R-97 checks they match). */
export const GOAL_COUNTERS = ['cratesDelivered', 'bigDelivered', 'exGremlins', 'trapped', 'placed', 'springThrows',
    'rocketFlights', 'cannonLobs', 'moved', 'bombs', 'slides', 'mountainsFlown', 'pushes', 'pulls', 'pushesPulls'];
/** Goals in a set: GameArtifacts.GOALS_PER_GAME (R-97 checks it). */
export const GOALS_PER_SET = 3;
/** How a goal set came: a new game's set 0, New goals with goals unmet, New goals after a set all met. */
export const GOAL_HOWS = ['start', 'reroll', 'next'];

/** The pages allowed to post from a browser: the live site and the itch.io and Newgrounds
 *  builds' frames (D-70). wrangler dev adds http://localhost:8787 through TELEMETRY_DEV_ORIGINS. */
export const TELEMETRY_ORIGINS = ['https://ttdat.yuwakisa.com', 'https://html-classic.itch.zone', 'https://uploads.ungrounded.net'];
/** The TELEMETRY_LIMIT binding's numbers, restated here for the docs and R-77, which checks they
 *  match wrangler.jsonc's `ratelimits` in both environments (the binding is what enforces them). */
export const TELEMETRY_RATE_LIMIT = { limit: 1000, period: 10 };

const CORS = { 'Access-Control-Allow-Origin': '*' };

/** A batch that fails its checks: `where` names the field, never its value. */
class BadBatch extends Error {
    constructor(where) { super(where); this.where = where; }
}

/** POST /t: one batch, answered 204 (written, or dropped for its format) or 400 (written nowhere).
 *  `verify` checks a sign-in token (the auth-client's verifyAccessToken; worker/index.js passes it). */
export async function telemetry(request, env, ctx, verify) {
    if (!originAllowed(request.headers.get('Origin'), env)) return new Response(null, { status: 403, headers: CORS });
    if (!(await underLimit(request, env))) return new Response(null, { status: 429, headers: CORS });
    const length = Number(request.headers.get('Content-Length'));
    if (length > MAX_BODY_BYTES) return refuse('body too big');
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return refuse('body too big');
    let batch;
    try { batch = JSON.parse(text); } catch { return refuse('not JSON'); }
    if (!isObject(batch)) return refuse('not an object');

    const read = typeof batch.format === 'number' && Object.hasOwn(READERS, batch.format) ? READERS[batch.format] : null;
    if (!read) {
        console.error('telemetry batch dropped: unknown format');
        return new Response(null, { status: 204, headers: CORS });
    }
    let rows;
    try { rows = read(batch); } catch (e) {
        if (e instanceof BadBatch) return refuse(e.where);
        throw e;
    }
    if (rowCount(rows) > 0) ctx.waitUntil(identityFor(batch.token, env, verify, Math.floor(Date.now() / 1000)).then(signedIn =>
        write(env.TELEMETRY, statementsFor(env.TELEMETRY, signedIn ? { ...rows, identity: signedIn } : rows))));
    return new Response(null, { status: 204, headers: CORS });
}

/** No Origin header, or one on the list. */
function originAllowed(origin, env) {
    if (origin === null) return true;
    const dev = typeof env.TELEMETRY_DEV_ORIGINS === 'string' ? env.TELEMETRY_DEV_ORIGINS.split(',').map(s => s.trim()) : [];
    return TELEMETRY_ORIGINS.includes(origin) || dev.includes(origin);
}

/** The rate limiter's verdict for this request's IP; true without a binding or when it fails. */
async function underLimit(request, env) {
    const limiter = env.TELEMETRY_LIMIT;
    if (!limiter) return true;
    try {
        const { success } = await limiter.limit({ key: request.headers.get('CF-Connecting-IP') || 'no-ip' });
        return success !== false;
    } catch (e) {
        console.error('telemetry rate limiter failed; let through');
        return true;
    }
}

function refuse(where) {
    console.error('telemetry batch refused: ' + where);
    return new Response(null, { status: 400, headers: CORS });
}

function rowCount({ games, events, milestones, crashes, goalSets, goalsMet }) {
    return games.length + events.length + milestones.length + crashes.length + goalSets.length + goalsMet.length;
}

async function write(db, statements) {
    try { await db.batch(statements); }
    catch (e) { console.error('telemetry not written to D1: ' + (e && e.message)); }
}

// ---- format 1 -------------------------------------------------------------------------------

/** One reader per known format: batch → the rows to write, or a BadBatch. */
const READERS = { 1: readFormat1 };
/** The formats this Worker reads. */
export const KNOWN_FORMATS = Object.keys(READERS).map(Number);

// Field specs: [type, required, max length]. 'int' is a safe integer, 'str' a string, 'bool' a
// boolean; a field that isn't required may be missing or null. Unknown fields are ignored.
const GAME = {
    gameKey: ['str', true, 64], startedUnixSeconds: ['int', true], seed: ['int', true], size: ['str', true, 16],
    version: ['str', true, 64], rulesVersion: ['int', true], userAgent: ['str', false, 512], screen: ['str', false, 64],
};
const SNAPSHOT = {
    gameKey: ['str', true, 64], unixSeconds: ['int', true], turn: ['int', true], delivered: ['int', true],
    lost: ['int', true], exGremlins: ['int', true], trapped: ['int', true], things: ['int', true], crates: ['int', true],
};
const EVENT = { ...SNAPSHOT, seq: ['int', true], command: ['str', true, 16], accepted: ['bool', true] };
const MILESTONE = { ...SNAPSHOT, milestone: ['int', true] };
const CRASH = {
    unixSeconds: ['int', true], format: ['int', false], version: ['str', false, 64], gameKey: ['str', false, 64],
    seed: ['int', false], size: ['str', false, 16], turn: ['int', false],
    message: ['str', true, Infinity], stack: ['str', false, Infinity], userAgent: ['str', false, 512],
};
/** The crate colors in the order a record's deliveredByColor lists them and the delivered_<color>
 *  columns are bound: GameArtifacts.CRATE_COLORS, restated here (the Worker can't load the game's
 *  scripts; R-68 checks they match). */
export const DELIVERED_COLORS = ['red', 'green', 'blue', 'yellow'];
const GOAL_SET = {
    gameKey: ['str', true, 64], set: ['int', true], how: ['str', true, 16], turn: ['int', true], unixSeconds: ['int', true],
};
const GOAL_MET = {
    gameKey: ['str', true, 64], set: ['int', true], index: ['int', true], counter: ['str', true, 32], amount: ['int', true],
    turn: ['int', true], unixSeconds: ['int', true], met: ['bool', true],
};
const GOAL = { counter: ['str', true, 32], amount: ['int', true] };
/** An event's args that have their own columns, in the order INSERT_EVENT binds them; `rest` keeps the others. */
const ARG_COLUMNS = { kind: ['str', false, 16], q: ['int', false], r: ['int', false], facing: ['int', false], color: ['str', false, 16] };

function readFormat1(batch) {
    const identity = { playerId: field(batch, 'player', ['str', true, 64], 'player'), signedIn: 0 };
    const lists = {};
    let count = 0;
    for (const name of ['games', 'events', 'milestones', 'crashes', 'goalSets', 'goalsMet']) {
        const list = batch[name] ?? [];
        if (!Array.isArray(list)) throw new BadBatch(name);
        list.forEach((record, i) => { if (!isObject(record)) throw new BadBatch(`${name}[${i}]`); });
        lists[name] = list;
        count += list.length;
    }
    if (count > MAX_RECORDS) throw new BadBatch('too many records');

    const games = lists.games.map((g, i) => ({ ...fields(g, GAME, `games[${i}]`), format: batch.format }));
    const events = lists.events.map((e, i) => {
        const where = `events[${i}]`;
        const row = fields(e, EVENT, where);
        if (row.seq < 0) throw new BadBatch(where + '.seq');
        if (!KNOWN_COMMANDS.includes(row.command)) throw new BadBatch(where + '.command');
        const args = e.args ?? {};
        if (!isObject(args)) throw new BadBatch(where + '.args');
        row.columns = fields(args, ARG_COLUMNS, where + '.args');
        row.deliveredByColor = byColor(e, where);
        const others = Object.fromEntries(Object.entries(args).filter(([k]) => !Object.hasOwn(ARG_COLUMNS, k)));
        row.rest = Object.keys(others).length > 0 ? JSON.stringify({ args: others }) : null;
        return row;
    });
    const milestones = lists.milestones.map((m, i) => {
        const where = `milestones[${i}]`;
        // A milestone's rest holds nothing today (every field it reads has a column): NULL.
        return { ...fields(m, MILESTONE, where), deliveredByColor: byColor(m, where), rest: null };
    });
    const crashes = lists.crashes.map((c, i) => {
        const row = fields(c, CRASH, `crashes[${i}]`);
        row.format = row.format ?? batch.format;
        row.message = row.message.slice(0, CRASH_MESSAGE_CHARS);
        row.stack = row.stack === null ? null : row.stack.slice(0, CRASH_STACK_CHARS);
        return row;
    });
    const goalSets = lists.goalSets.map((s, i) => {
        const where = `goalSets[${i}]`;
        const row = goalPlace(fields(s, GOAL_SET, where), where);
        if (!GOAL_HOWS.includes(row.how)) throw new BadBatch(where + '.how');
        if (!Array.isArray(s.goals) || s.goals.length !== GOALS_PER_SET) throw new BadBatch(where + '.goals');
        row.goals = s.goals.map((g, j) => goal(g, `${where}.goals[${j}]`));
        return row;
    });
    const goalsMet = lists.goalsMet.map((m, i) => {
        const where = `goalsMet[${i}]`;
        const row = goalPlace(fields(m, GOAL_MET, where), where);
        if (row.index < 0 || row.index >= GOALS_PER_SET) throw new BadBatch(where + '.index');
        if (row.met !== true) throw new BadBatch(where + '.met');
        goal(row, where);
        return row;
    });
    return { identity, games, events, milestones, crashes, goalSets, goalsMet };
}

/** A goal record's set (0 on) and turn (1 on, as GameState's), D-77. */
function goalPlace(row, where) {
    if (row.set < 0) throw new BadBatch(where + '.set');
    if (row.turn < 1) throw new BadBatch(where + '.turn');
    return row;
}

/** A goal's counter (one of GOAL_COUNTERS) and amount (a whole number ≥ 1), D-77. */
function goal(record, where) {
    if (!isObject(record)) throw new BadBatch(where);
    const g = fields(record, GOAL, where);
    if (!GOAL_COUNTERS.includes(g.counter)) throw new BadBatch(where + '.counter');
    if (g.amount < 1) throw new BadBatch(where + '.amount');
    return g;
}

/** deliveredByColor: required, the crates delivered to each color's target, an array of
 *  DELIVERED_COLORS.length whole numbers ≥ 0 in DELIVERED_COLORS order (0 for a color not open). */
function byColor(record, where) {
    const list = record.deliveredByColor;
    if (!Array.isArray(list) || list.length !== DELIVERED_COLORS.length || !list.every(n => Number.isSafeInteger(n) && n >= 0))
        throw new BadBatch(where + '.deliveredByColor');
    return list;
}

function fields(record, spec, where) {
    const out = {};
    for (const [name, s] of Object.entries(spec)) out[name] = field(record, name, s, where + '.' + name);
    return out;
}

function field(record, name, [type, required, maxLength], where) {
    const v = record[name];
    if (v === undefined || v === null) {
        if (required) throw new BadBatch(where);
        return null;
    }
    const ok = type === 'int' ? Number.isSafeInteger(v)
        : type === 'bool' ? typeof v === 'boolean'
        : typeof v === 'string' && v.length <= maxLength && (!required || v.length > 0);
    if (!ok) throw new BadBatch(where);
    return v;
}

function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

// ---- D1 -------------------------------------------------------------------------------------

const INSERT_GAME = `
  INSERT OR IGNORE INTO games (game_key, player_id, signed_in, format, started_unix_seconds, seed, size, version,
    rules_version, user_agent, screen)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`;

/** An event's `seq` is the browser's: its game's event records numbered 0, 1, 2, … as queued
 *  (telemetry.js), bound as sent, so nothing here reads a game's earlier rows. INSERT OR IGNORE on
 *  the (game_key, seq) key keeps the first of a resent event. */
const INSERT_EVENT = `
  INSERT OR IGNORE INTO events (game_key, seq, player_id, signed_in, unix_seconds, command, accepted, turn, delivered,
    lost, ex_gremlins, trapped, things, crates, delivered_red, delivered_green, delivered_blue, delivered_yellow,
    kind, q, r, facing, color, rest)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)`;

const INSERT_MILESTONE = `
  INSERT OR IGNORE INTO milestones (game_key, milestone, player_id, signed_in, turn, unix_seconds, delivered, lost,
    ex_gremlins, trapped, things, crates, delivered_red, delivered_green, delivered_blue, delivered_yellow, rest)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`;

const INSERT_CRASH = `
  INSERT INTO crashes (unix_seconds, format, version, game_key, player_id, signed_in, seed, size, turn, message, stack,
    user_agent)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`;

/** Goal records (D-77): INSERT OR IGNORE on their natural keys, so a resent one is kept once. */
const INSERT_GOAL_SET = `
  INSERT OR IGNORE INTO goal_sets (game_key, set_no, player_id, signed_in, how, turn, unix_seconds,
    counter1, amount1, counter2, amount2, counter3, amount3)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`;

const INSERT_GOAL_MET = `
  INSERT OR IGNORE INTO goals_met (game_key, set_no, idx, player_id, signed_in, counter, amount, turn, unix_seconds)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`;

/** Every row of a batch as D1 statements, in the order they're written: games, events, milestones,
 *  crashes, goal sets, goals met. */
function statementsFor(db, { identity: { playerId, signedIn }, games, events, milestones, crashes, goalSets, goalsMet }) {
    return [
        ...games.map(g => db.prepare(INSERT_GAME).bind(g.gameKey, playerId, signedIn, g.format, g.startedUnixSeconds,
            g.seed, g.size, g.version, g.rulesVersion, g.userAgent, g.screen)),
        ...events.map(e => db.prepare(INSERT_EVENT).bind(e.gameKey, e.seq, playerId, signedIn, e.unixSeconds, e.command,
            e.accepted ? 1 : 0, e.turn, e.delivered, e.lost, e.exGremlins, e.trapped, e.things, e.crates, ...e.deliveredByColor,
            ...Object.keys(ARG_COLUMNS).map(k => e.columns[k]), e.rest)),
        ...milestones.map(m => db.prepare(INSERT_MILESTONE).bind(m.gameKey, m.milestone, playerId, signedIn, m.turn,
            m.unixSeconds, m.delivered, m.lost, m.exGremlins, m.trapped, m.things, m.crates, ...m.deliveredByColor, m.rest)),
        ...crashes.map(c => db.prepare(INSERT_CRASH).bind(c.unixSeconds, c.format, c.version, c.gameKey, playerId,
            signedIn, c.seed, c.size, c.turn, c.message, c.stack, c.userAgent)),
        ...goalSets.map(s => db.prepare(INSERT_GOAL_SET).bind(s.gameKey, s.set, playerId, signedIn, s.how, s.turn, s.unixSeconds,
            ...s.goals.flatMap(g => [g.counter, g.amount]))),
        ...goalsMet.map(m => db.prepare(INSERT_GOAL_MET).bind(m.gameKey, m.set, m.index, playerId, signedIn, m.counter, m.amount,
            m.turn, m.unixSeconds)),
    ];
}

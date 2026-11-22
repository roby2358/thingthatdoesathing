// tools/telemetry_report/records.js — where the telemetry report's records come from (ONTOLOGY
// "Telemetry report", D-66): the six tables of the ttdat-telemetry D1 database (D-64; the goal
// tables D-77), read by six read-only SELECTs through `wrangler d1 execute --json`, turned back into plain records
// shaped like the ones the browser sends (camelCase, ONTOLOGY "Records"), each with the
// player_id and signed_in of the batch that wrote it. Nothing here runs a process: the caller
// hands in a function that runs wrangler.
'use strict';

/** The database's name, as wrangler.jsonc and tools/telemetry_db.sh have it. */
const DATABASE = 'ttdat-telemetry';

/** What wrangler.jsonc's production environment holds until the production database exists,
 *  as tools/telemetry_db.sh has it. */
const ID_PLACEHOLDER = 'PUT-THE-DATABASE-ID-HERE';

/** How wrangler is told which database to read: wrangler dev's local one under .wrangler/, or production's. */
const D1_TARGETS = {
    'local-d1': ['--local'],
    production: ['--remote', '--env', 'production'],
};

/** Thrown for what the person running the report can put right; its message says how. */
class ReportRefusal extends Error {}

/** The number as SQL text. The queries go to wrangler as text with no bound parameters, so
 *  nothing but a whole number may go into one. */
function wholeNumber(value) {
    if (!Number.isSafeInteger(value)) throw new Error('Not a whole number: ' + value);
    return String(value);
}

/** The six read-only queries, one per table, for the period from `since` (Unix seconds) on.
 *  Every game is read (the table is small), so an event of a game started before the period
 *  is known as that game's, which figures.inPeriod drops, not as one with no game record. A
 *  game's events and milestones come after its start, so these hold every event and milestone
 *  of the games started in the period, and the same holds for its goal sets and goals met. A crash
 *  belongs to the period by its own time. */
function queries(since) {
    const s = wholeNumber(since);
    return {
        games: 'SELECT * FROM games ORDER BY started_unix_seconds, game_key',
        events: `SELECT * FROM events WHERE unix_seconds >= ${s} ORDER BY game_key, seq`,
        milestones: `SELECT * FROM milestones WHERE unix_seconds >= ${s} ORDER BY game_key, milestone`,
        crashes: `SELECT * FROM crashes WHERE unix_seconds >= ${s} ORDER BY unix_seconds, id`,
        goalSets: `SELECT * FROM goal_sets WHERE unix_seconds >= ${s} ORDER BY game_key, set_no`,
        goalsMet: `SELECT * FROM goals_met WHERE unix_seconds >= ${s} ORDER BY game_key, set_no, idx`,
    };
}

/** The rows in what `wrangler d1 execute --json --command <one statement>` prints: a list with
 *  one {results, success} per statement. */
function rowsFromWrangler(output) {
    let answers;
    try { answers = JSON.parse(output); } catch (e) { answers = null; }
    if (!Array.isArray(answers) || answers.length !== 1 || answers[0].success !== true || !Array.isArray(answers[0].results))
        throw new ReportRefusal('wrangler\'s answer is not one successful result: ' + String(output).slice(0, 200));
    return answers[0].results;
}

function identity(row) {
    return { playerId: row.player_id, signedIn: row.signed_in === 1 };
}

function restOf(row) {
    try { return JSON.parse(row.rest || '{}') || {}; } catch (e) { return {}; }
}

function snapshot(row) {
    return {
        gameKey: row.game_key, unixSeconds: row.unix_seconds, turn: row.turn, delivered: row.delivered,
        lost: row.lost, exGremlins: row.ex_gremlins, trapped: row.trapped, things: row.things, crates: row.crates,
    };
}

function gameFromRow(row) {
    return {
        gameKey: row.game_key, ...identity(row), format: row.format, startedUnixSeconds: row.started_unix_seconds,
        seed: row.seed, size: row.size, version: row.version, rulesVersion: row.rules_version,
        userAgent: row.user_agent ?? null, screen: row.screen ?? null,
    };
}

/** The delivered_<color> columns, in CRATE_COLORS order: a record's deliveredByColor is their
 *  values as the browser sent them (worker/telemetry.js DELIVERED_COLORS). */
const DELIVERED_COLUMNS = ['delivered_red', 'delivered_green', 'delivered_blue', 'delivered_yellow'];

function deliveredByColor(row) {
    return DELIVERED_COLUMNS.map(c => row[c]);
}

/** The args that have columns of their own (worker/telemetry.js ARG_COLUMNS); a NULL column is an arg the event didn't have. */
const ARG_COLUMNS = ['kind', 'q', 'r', 'facing', 'color'];

/** An event record: its args are the non-NULL arg columns and the rest's `args` together. */
function eventFromRow(row) {
    const rest = restOf(row);
    const columns = Object.fromEntries(ARG_COLUMNS.filter(k => row[k] !== null && row[k] !== undefined).map(k => [k, row[k]]));
    return {
        ...snapshot(row), seq: row.seq, ...identity(row), command: row.command, accepted: row.accepted === 1,
        args: { ...(rest.args || {}), ...columns }, deliveredByColor: deliveredByColor(row),
    };
}

function milestoneFromRow(row) {
    return { ...snapshot(row), milestone: row.milestone, ...identity(row), deliveredByColor: deliveredByColor(row) };
}

function crashFromRow(row) {
    return {
        id: row.id, unixSeconds: row.unix_seconds, format: row.format, version: row.version ?? null,
        gameKey: row.game_key ?? null, ...identity(row), seed: row.seed ?? null, size: row.size ?? null,
        turn: row.turn ?? null, message: row.message, stack: row.stack ?? null, userAgent: row.user_agent ?? null,
    };
}

/** A goal set record (D-77): its three goals back as a list, in the set's order. */
function goalSetFromRow(row) {
    return {
        gameKey: row.game_key, set: row.set_no, ...identity(row), how: row.how, turn: row.turn, unixSeconds: row.unix_seconds,
        goals: [1, 2, 3].map(n => ({ counter: row['counter' + n], amount: row['amount' + n] })),
    };
}

function goalMetFromRow(row) {
    return {
        gameKey: row.game_key, set: row.set_no, index: row.idx, ...identity(row), counter: row.counter, amount: row.amount,
        turn: row.turn, unixSeconds: row.unix_seconds,
    };
}

/** The records the rows of the six queries hold. */
function playFromRows({ games, events, milestones, crashes, goalSets, goalsMet }) {
    return {
        games: games.map(gameFromRow), events: events.map(eventFromRow),
        milestones: milestones.map(milestoneFromRow), crashes: crashes.map(crashFromRow),
        goalSets: goalSets.map(goalSetFromRow), goalsMet: goalsMet.map(goalMetFromRow),
    };
}

/** The records of a D1 telemetry database from `since` on, read by six read-only queries
 *  through `wrangler(args) → Promise<stdout>`. Production isn't asked while the config still
 *  holds the placeholder id: the database doesn't exist yet. */
async function playFromD1(wrangler, target, config, since) {
    if (!Object.hasOwn(D1_TARGETS, target)) throw new Error('Unknown D1 target: ' + target);
    if (target === 'production' && config.text.includes(ID_PLACEHOLDER)) {
        throw new ReportRefusal(
            `the production telemetry database does not exist yet: ${config.path} still holds ${ID_PLACEHOLDER}.\n` +
            'create it with: just d1-production (README, "Deploy"), or report on local play with: just telemetry-local');
    }
    const sql = queries(since);
    const rows = {};
    for (const table of Object.keys(sql)) {
        rows[table] = rowsFromWrangler(await wrangler(['d1', 'execute', DATABASE, ...D1_TARGETS[target],
            '--config', config.path, '--json', '--command', sql[table]]));
    }
    return playFromRows(rows);
}

module.exports = {
    DATABASE, ID_PLACEHOLDER, D1_TARGETS, ReportRefusal, queries, rowsFromWrangler,
    gameFromRow, eventFromRow, milestoneFromRow, crashFromRow, goalSetFromRow, goalMetFromRow, playFromRows, playFromD1,
};

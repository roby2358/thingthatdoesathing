// R-70 — the telemetry report's Volume section (tools/telemetry_report/volume.js, D-72,
// ONTOLOGY "Telemetry report"): rows written per UTC day against the D1 free plan.
//
// Cases:
//   - fixture rows over several days → the per-day table per table and in total, each row on the
//     day of its own time column (a game by its start), rows of the period only, rows with no
//     game record counted; the busiest day and its line
//   - the threshold: just under half the daily limit no mark and no warning; at half and over,
//     the day marked and the line prefixed WARNING:
//   - no rows: "busiest day: none"; the note on what isn't counted; the size line (bytes, at and
//     over half the free size, unknown)
//   - the section is printed once, last, with several rules versions and with no games
//   - sizeFromD1: d1 info's arguments per target, its database_size, and a failure
'use strict';

const path = require('path');
const { check, done } = require('../helpers/check');

const ROOT = path.join(__dirname, '..', '..');
const vol = require(path.join(ROOT, 'tools', 'telemetry_report', 'volume.js'));
const { report, volumeSection, formatBytes } = require(path.join(ROOT, 'tools', 'telemetry_report', 'render.js'));

const DAY = 86400;
const D0 = Date.UTC(2026, 10, 18) / 1000;   // 2026-11-18 00:00 UTC
const SIZES = ['small', 'medium', 'large', 'huge'];
const LOCAL = { unknown: 'local' };

const game = (key, t, o = {}) => ({ gameKey: key, playerId: 'p', signedIn: false, format: 1, startedUnixSeconds: t, seed: 1, size: 'small', version: 'v',
    rulesVersion: 1, userAgent: null, screen: null, ...o });
const snap = { turn: 1, delivered: 0, lost: 0, exGremlins: 0, trapped: 0, things: 0, crates: 1 };
const event = (key, seq, t) => ({ gameKey: key, seq, playerId: 'p', signedIn: false, unixSeconds: t, command: 'place', accepted: true, ...snap, args: {}, deliveredByColor: [0, 0, 0, 0] });
const milestone = (key, n, t) => ({ gameKey: key, milestone: n, playerId: 'p', signedIn: false, unixSeconds: t, ...snap, turn: n, delivered: n, deliveredByColor: [n, 0, 0, 0] });
const crash = (id, t, gameKey = null) => ({ id, unixSeconds: t, gameKey, playerId: 'p', signedIn: false, version: 'v', message: 'boom' });

/** Rows over three days (and one before the period): a game started late on day 0 whose events
 *  run past midnight into day 1, a ghost event with no game, a crash with no game. */
function fixture() {
    return {
        games: [game('old', D0 - 5 * DAY), game('a', D0 + DAY - 10), game('b', D0 + 2 * DAY + 5)],
        events: [event('a', 0, D0 + DAY - 5), event('a', 1, D0 + DAY + 5), event('a', 2, D0 + DAY + 6), event('ghost', 0, D0 + 2 * DAY + 50),
            event('old', 0, D0 - 5 * DAY + 1)],
        milestones: [milestone('a', 10, D0 + DAY + 7), milestone('b', 10, D0 + 2 * DAY + 60)],
        crashes: [crash(1, D0 + 2 * DAY + 70), crash(2, D0 + 70, 'a')],
    };
}

// ---- the per-day table ----
{
    const v = vol.volumeFigures(fixture(), D0);
    const row = d => v.perDay.find(r => r.day === d);
    check('days in order, only the period', v.perDay.map(r => r.day).join() === '2026-11-18,2026-11-19,2026-11-20');
    const d0 = row('2026-11-18'), d1 = row('2026-11-19'), d2 = row('2026-11-20');
    check('day 0: a game by its start, its first event, a crash', d0.games === 1 && d0.events === 1 && d0.milestones === 0 && d0.crashes === 1 && d0.total === 3);
    check("day 1: the game's events after midnight and its milestone, on their own day", d1.games === 0 && d1.events === 2 && d1.milestones === 1 && d1.total === 3);
    check('day 2: a game, a ghost event with no game record, a milestone, a crash with no game', d2.games === 1 && d2.events === 1 && d2.milestones === 1 && d2.crashes === 1 && d2.total === 4);
    check('the busiest day and its total', v.busiest.day === '2026-11-20' && v.busiest.total === 4);
    check('nothing marked far under the limit', v.perDay.every(r => !r.warn));
    const all = vol.volumeFigures(fixture(), 0);
    check('all time: the old game and its event count on their day', all.perDay[0].day === '2026-11-13' && all.perDay[0].total === 2);
    const text = volumeSection(v, LOCAL);
    check('table header and a day row', text.includes('  day         games  events  milestones  crashes  total  of limit')
        && /\n  2026-11-20 +1 +1 +1 +1 +4 +0%\n/.test(text));
    check("the busiest-day line", text.includes("\n  busiest day 2026-11-20 4 rows = 0% of the free plan's daily writes\n"));
    check('the limit named in the title', text.startsWith("Volume: rows written per day (UTC), against the D1 free plan's 100000 rows written per day"));
    check("a note: index writes and the Worker's requests aren't counted", text.includes('not counted: index writes') && text.includes("the Worker's requests, which the tables don't hold"));
    check('the size line last', text.endsWith('\n  size: unknown (local)'));
}

// ---- the threshold ----
{
    check('the numbers', vol.D1_FREE_ROWS_WRITTEN_PER_DAY === 100000 && vol.WARN_SHARE === 0.5 && vol.D1_FREE_DB_BYTES === 500e6);
    const half = vol.WARN_SHARE * vol.D1_FREE_ROWS_WRITTEN_PER_DAY;
    /** n events on 2026-11-19 of one game started then, plus a quiet day before. */
    const busy = n => ({
        games: [game('q', D0), game('g', D0 + DAY)],
        events: Array.from({ length: n - 1 }, (_, i) => event('g', i, D0 + DAY + 1 + (i % 80000))),
        milestones: [], crashes: [],
    });
    const under = vol.volumeFigures(busy(half - 1), 0);
    const underText = volumeSection(under, LOCAL);
    check('just under half: not marked', under.busiest.total === half - 1 && !under.busiest.warn);
    check("just under half: no WARNING", underText.includes("\n  busiest day 2026-11-19 49999 rows = 50% of the free plan's daily writes") && !underText.includes('WARNING'));
    const at = vol.volumeFigures(busy(half), 0);
    const atText = volumeSection(at, LOCAL);
    check('at half: the day marked, the quiet day not', at.busiest.warn && /\n  2026-11-19 +1 +49999 +0 +0 +50000 +50% +\*\n/.test(atText) && /\n  2026-11-18 +1 +0 +0 +0 +1 +0%\n/.test(atText));
    check('at half: WARNING', atText.includes("\n  WARNING: busiest day 2026-11-19 50000 rows = 50% of the free plan's daily writes\n"));
    const over = volumeSection(vol.volumeFigures(busy(120000), 0), LOCAL);
    check('over the limit: WARNING, share over 100%', over.includes("\n  WARNING: busiest day 2026-11-19 120000 rows = 120% of the free plan's daily writes\n"));
    check('the mark explained', atText.includes('  * at or over 50% of the daily limit'));
}

// ---- no rows, the size line ----
{
    const none = volumeSection(vol.volumeFigures({ games: [], events: [], milestones: [], crashes: [] }, 0), LOCAL);
    check('no rows: (none) and no busiest day', none.includes('\n  (none)\n') && none.includes('  busiest day: none (no rows written in the period)'));
    check('unknown size', none.endsWith('\n  size: unknown (local)'));
    const empty = vol.volumeFigures({ games: [], events: [], milestones: [], crashes: [] }, 0);
    check('a small size against 500 MB', volumeSection(empty, { bytes: 1234567 }).endsWith("\n  size: 1.2 MB = 0.2% of the free plan's 500.0 MB per database"));
    check('half the free size: WARNING', volumeSection(empty, { bytes: 250e6 }).endsWith("\n  WARNING: size: 250.0 MB = 50% of the free plan's 500.0 MB per database"));
    check('just under half: no WARNING', !volumeSection(empty, { bytes: 250e6 - 1 }).includes('WARNING'));
    check('bytes formatted', formatBytes(950) === '950 B' && formatBytes(12345) === '12.3 KB');
}

// ---- in the report: once, last ----
{
    const play = fixture();
    const one = report(play, { source: 'x', period: 'all time', since: 0, size: { bytes: 4096 } }, SIZES);
    check('printed last, after Players', one.indexOf('\nVolume:') > one.indexOf('\nPlayers (signed in)') && one.endsWith("of the free plan's 500.0 MB per database\n"));
    play.games[2].rulesVersion = 2;
    const two = report(play, { source: 'x', period: 'all time', since: 0, size: LOCAL }, SIZES);
    check('several rules versions: Volume once, after every version', two.split('\nVolume:').length === 2 && two.indexOf('\nVolume:') > two.lastIndexOf('=== Rules version'));
    check('several rules versions: every row of the period counted once', /\n  busiest day 2026-11-20 4 rows/.test(two));
    const nothing = report({ games: [], events: [], milestones: [], crashes: [crash(1, D0)] }, { source: 'x', period: 'all time', since: 0, size: LOCAL }, SIZES);
    check('no games: Volume still printed', nothing.includes('No games recorded.') && nothing.includes('\nVolume:') && nothing.endsWith('  size: unknown (local)\n'));
    const recent = report(fixture(), { source: 'x', period: 'games started in the last 1 day', since: D0 + 2 * DAY, size: LOCAL }, SIZES);
    check('a days limit: Volume counts the rows of the period only', /\n  busiest day 2026-11-20 4 rows/.test(recent) && !recent.includes('\n  2026-11-19 '));
}

async function main() {
    const config = { path: 'wrangler.jsonc', text: '' };
    const calls = [];
    const answering = out => async args => { calls.push(args); if (out instanceof Error) throw out; return out; };
    const local = await vol.sizeFromD1(answering(JSON.stringify({ database_size: 8192 })), 'local-d1', config);
    check('d1 info for local-d1: no --env, --json, the config', calls[0].join(' ') === 'd1 info ttdat-telemetry --config wrangler.jsonc --json' && local.bytes === 8192);
    const prod = await vol.sizeFromD1(answering(JSON.stringify({ database_size: 0 })), 'production', config);
    check('d1 info for production: --env production', calls[1].join(' ') === 'd1 info ttdat-telemetry --config wrangler.jsonc --json --env production' && prod.bytes === 0);
    check('local failure: unknown (local)', (await vol.sizeFromD1(answering(new Error('7404')), 'local-d1', config)).unknown === 'local');
    check('local without a size: unknown (local)', (await vol.sizeFromD1(answering('{}'), 'local-d1', config)).unknown === 'local');
    check('production without a size: said', (await vol.sizeFromD1(answering('not json'), 'production', config)).unknown === 'wrangler d1 info gave no size');
}

main().then(done, err => { console.log('  FAIL threw: ' + (err && err.stack)); process.exit(1); });

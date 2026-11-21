// tools/telemetry_report/volume.js — the figures behind the telemetry report's Volume section
// (ONTOLOGY "Telemetry report", D-72; render.js prints it): how many rows the period wrote per
// UTC day, against the D1 free plan's daily write limit, and the database's size against its size
// limit, so either is seen coming before it's hit. The free plan's numbers live here and nowhere else in the report's code.
'use strict';

const { utcDay } = require('./figures');
const { DATABASE } = require('./records');

/** D1 free plan: rows written per day, account-wide. From
 *  https://developers.cloudflare.com/d1/platform/pricing/ ("Rows written: 100,000 / day"),
 *  checked 2026-11-21. */
const D1_FREE_ROWS_WRITTEN_PER_DAY = 100000;

/** D1 free plan: the largest a database may grow. From
 *  https://developers.cloudflare.com/d1/platform/limits/ ("Maximum database size … 500 MB (Free)"),
 *  checked 2026-11-21. Taken as decimal megabytes, the smaller reading, so the warning comes early. */
const D1_FREE_DB_BYTES = 500 * 1000 * 1000;

/** A day's writes (or the database's size) at or over this share of the free limit is marked,
 *  and the summary line gets a WARNING: prefix. */
const WARN_SHARE = 0.5;

/** The four tables, with the column whose time puts a row on its day. */
const TABLES = [
    ['games', r => r.startedUnixSeconds],
    ['events', r => r.unixSeconds],
    ['milestones', r => r.unixSeconds],
    ['crashes', r => r.unixSeconds],
];

/** Rows written per UTC day over the period: every row read whose own time is at or after
 *  `since`, whether or not its game is in the report (a row was written either way). Days in
 *  order, each with its count per table and in total, and `warn` at or over WARN_SHARE of the
 *  daily limit; the busiest day (the earliest of equals), or null with no rows. */
function volumeFigures(loaded, since) {
    const days = new Map();
    for (const [table, timeOf] of TABLES) {
        for (const row of loaded[table]) {
            const t = timeOf(row);
            if (!(t >= since)) continue;
            const day = utcDay(t);
            if (!days.has(day)) days.set(day, { day, games: 0, events: 0, milestones: 0, crashes: 0, total: 0 });
            const counts = days.get(day);
            counts[table]++;
            counts.total++;
        }
    }
    const perDay = [...days.values()].sort((a, b) => a.day.localeCompare(b.day))
        .map(d => ({ ...d, warn: d.total >= WARN_SHARE * D1_FREE_ROWS_WRITTEN_PER_DAY }));
    const busiest = perDay.reduce((best, d) => (best === null || d.total > best.total ? d : best), null);
    return { perDay, busiest };
}

/** The database's size, from `wrangler d1 info ttdat-telemetry --json` (with --env production
 *  for production), as {bytes} or {unknown: why}. wrangler's d1 info asks Cloudflare's API, so
 *  for wrangler dev's local database it gives no size: that, or any failure, is "local". */
async function sizeFromD1(wrangler, target, config) {
    const args = ['d1', 'info', DATABASE, '--config', config.path, '--json', ...(target === 'production' ? ['--env', 'production'] : [])];
    let bytes;
    try {
        const info = JSON.parse(await wrangler(args));
        bytes = info && info.database_size;
    } catch (e) {
        bytes = undefined;
    }
    if (Number.isFinite(bytes) && bytes >= 0) return { bytes };
    return { unknown: target === 'production' ? 'wrangler d1 info gave no size' : 'local' };
}

module.exports = { D1_FREE_ROWS_WRITTEN_PER_DAY, D1_FREE_DB_BYTES, WARN_SHARE, volumeFigures, sizeFromD1 };

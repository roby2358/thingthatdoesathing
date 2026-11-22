// tools/telemetry_report/render.js — the telemetry report as plain text (ONTOLOGY "Telemetry
// report", D-66): figures.js's figures laid out as tables in the report's fixed order of
// sections, once per rules version when the period holds more than one.
'use strict';

const { LONG_PAUSE_SECONDS, WINDOW_BUCKET_PX, byRulesVersion, crashFigures, figures, inPeriod } = require('./figures');
const { D1_FREE_ROWS_WRITTEN_PER_DAY, D1_FREE_DB_BYTES, WARN_SHARE, volumeFigures } = require('./volume');

/** A length of real time: 45s, 2m 05s, 1h 02m 03s. */
function formatSeconds(seconds) {
    const whole = Math.round(seconds);
    const two = n => String(n).padStart(2, '0');
    if (whole < 60) return whole + 's';
    if (whole < 3600) return `${Math.floor(whole / 60)}m ${two(whole % 60)}s`;
    return `${Math.floor(whole / 3600)}h ${two(Math.floor((whole % 3600) / 60))}m ${two(whole % 60)}s`;
}

/** A count or an average: whole numbers bare, others to one decimal. */
function formatNumber(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** A share as a whole percentage, - of nothing. */
function formatShare(part, whole) {
    return whole === 0 ? '-' : Math.round((100 * part) / whole) + '%';
}

/** A table: the first column left-aligned, the others right-aligned, "(none)" without rows. */
function table(headers, rows) {
    if (rows.length === 0) return '  (none)';
    const cells = [headers, ...rows.map(row => row.map(String))];
    const widths = headers.map((_, c) => Math.max(...cells.map(row => row[c].length)));
    const line = row => '  ' + row.map((cell, c) => (c === 0 ? cell.padEnd(widths[c]) : cell.padStart(widths[c]))).join('  ').trimEnd();
    return cells.map(line).join('\n');
}

const SUMMARY_HEADERS = ['n', 'min', 'median', 'mean', 'max'];

/** A summary as cells under SUMMARY_HEADERS, each value printed by `print`; - with no numbers. */
function summaryCells(summary, print) {
    if (summary.count === 0) return [0, '-', '-', '-', '-'];
    return [summary.count, print(summary.min), print(summary.median), print(summary.mean), print(summary.max)];
}

function section(title, ...parts) {
    return [title, ...parts].join('\n');
}

function plural(count, one, many) {
    return `${count} ${count === 1 ? one : many}`;
}

function gamesSection({ games }) {
    return [
        section('Games started per day (UTC)', table(['day', 'games'], games.perDay.map(r => [r.day, r.games]))),
        section('Games by board size', table(['size', 'games'], games.bySize.map(r => [r.size, r.games]))),
        section('Games by version', table(['version', 'games', 'first day', 'last day'], games.byVersion.map(r => [r.version, r.games, r.first, r.last]))),
    ].join('\n\n');
}

function milestonesSection({ milestones }) {
    const headers = ['milestone', 'games', 'share', 'least turn', 'median turn', 'mean turn', 'most turn',
        'delivered', 'lost', 'ex-gremlins', 'trapped'];
    const parts = milestones.map(({ size, games, rows }) => section(
        `  ${size} (${plural(games, 'game', 'games')})`,
        table(headers, rows.map(r => [r.milestone, r.games, formatShare(r.games, games),
            ...summaryCells(r.turn, formatNumber).slice(1),
            formatNumber(r.delivered), formatNumber(r.lost), formatNumber(r.exGremlins), formatNumber(r.trapped)])),
    ));
    return section('Milestones per board size: games that reached each, the turn reached, and the median tally then',
        parts.length === 0 ? '  (none)' : parts.join('\n'));
}

function commandsSection({ commands }) {
    const tallyRows = (rows, key) => rows.map(r => [r[key], r.count, r.refused]);
    return [
        section('Commands (wait and rotate are not recorded)', table(['command', 'count', 'refused'], tallyRows(commands.perCommand, 'command'))),
        section('Place, by card kind', table(['kind', 'places', 'refused'], tallyRows(commands.placeByKind, 'kind'))),
        section('Discard, by card kind', table(['kind', 'discards', 'refused'], tallyRows(commands.discardByKind, 'kind'))),
        section("Discard, by how ('pick': picked then Discard or X; 'slot': the card's x or Shift+1/2/3)",
            table(['how', 'discards'], commands.discardByHow.map(r => [r.how, r.discards]))),
    ].join('\n\n');
}

function bombSection({ bomb }) {
    return section('Bomb: hexes per bomb (accepted bombs)',
        table(['hexes', 'bombs', 'share'], bomb.perHexes.map(r => [r.hexes, r.bombs, formatShare(r.bombs, bomb.bombs)])));
}

function sessionsSection({ sessions }) {
    const rows = [
        ['real length (first to last record)', ...summaryCells(sessions.realLength, formatSeconds)],
        [`without long pauses (${formatSeconds(LONG_PAUSE_SECONDS)} or more)`, ...summaryCells(sessions.activeLength, formatSeconds)],
        ['turns at the last record', ...summaryCells(sessions.turns, formatNumber)],
    ];
    return [
        section(`Sessions: games per page load (random player ID, not signed in): ${plural(sessions.pageLoads, 'page load', 'page loads')}`,
            table(['games', 'page loads'], sessions.gamesPerLoad.map(r => [r.games, r.loads])),
            `  per page load: ${summaryCells(sessions.gamesPerLoadSummary, formatNumber).map((v, i) => SUMMARY_HEADERS[i] + ' ' + v).join(', ')}`),
        section('Game length (games with an event or milestone)',
            table(['', ...SUMMARY_HEADERS], rows),
            `  long pauses: ${sessions.longPauses}    games with no event or milestone: ${sessions.unrecorded}`),
    ].join('\n\n');
}

function clientsSection({ clients }) {
    return [
        section('Clients: browser / OS (from the User-Agent)', table(['client', 'games'], clients.clients.map(r => [r.client, r.games]))),
        section(`Window sizes (rounded down to ${WINDOW_BUCKET_PX} px)`, table(['window', 'games'], clients.windows.map(r => [r.window, r.games]))),
        section('Device pixel ratios', table(['ratio', 'games'], clients.ratios.map(r => [r.ratio, r.games]))),
    ].join('\n\n');
}

function crashesBody(crashes) {
    return [
        section(`Crashes: ${crashes.count}, per version`, table(['version', 'crashes'], crashes.perVersion.map(r => [r.version, r.crashes]))),
        section('Crash messages (a number shows as N), most first',
            table(['message', 'crashes', 'games'], crashes.messages.map(r => [r.message, r.crashes, r.games])),
            `  crashes with no game: ${crashes.noGame}    with a game not in this report: ${crashes.gameNotInReport}`),
    ].join('\n\n');
}

function crashesSection({ crashes }) { return crashesBody(crashes); }

function playersSection({ players }) {
    const lines = players.signedIn === 0
        ? ['  no signed-in games']
        : [table(['', 'players'], [['signed-in players (distinct hashes)', players.signedIn], ['seen on more than one UTC day', players.severalDays]])];
    return section('Players (signed in)', ...lines, `  games that switched identity mid-game: ${players.switched}`);
}

function goalsSection({ goals }) {
    const how = goals.byHow.length === 0 ? '' : ' (' + goals.byHow.map(r => `${r.how} ${r.sets}`).join(', ') + ')';
    return section(`Goals: ${plural(goals.sets, 'set', 'sets')} dealt${how}, ${goals.done} done`,
        table(['counter', 'dealt', 're-rolled away', 'met', 'median turns to met'],
            goals.perCounter.map(r => [r.counter, r.dealt, r.rerolled, r.met, r.medianTurns === null ? '-' : formatNumber(r.medianTurns)])));
}

/** The sections, in the report's order. */
const SECTIONS = [gamesSection, milestonesSection, commandsSection, bombSection, sessionsSection, clientsSection, crashesSection, playersSection, goalsSection];

function sections(play, sizeOrder) {
    const f = figures(play, sizeOrder);
    return SECTIONS.map(render => render(f)).join('\n\n');
}

/** "a (3), b (1)": the values seen, most first. */
function seen(values) {
    const counts = new Map();
    for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
    const list = [...counts].sort(([a, n], [b, m]) => m - n || String(a).localeCompare(String(b)));
    return list.length === 0 ? 'none' : list.map(([v, n]) => `${v} (${n})`).join(', ');
}

/** A share of a free limit as a percentage, to one decimal when it isn't whole. */
function percent(part, whole) {
    return formatNumber(Math.round((1000 * part) / whole) / 10) + '%';
}

/** A size in bytes, in decimal units: 950 B, 12.3 KB, 4.5 MB. */
function formatBytes(bytes) {
    if (bytes < 1000) return bytes + ' B';
    if (bytes < 1000 * 1000) return (bytes / 1000).toFixed(1) + ' KB';
    return (bytes / (1000 * 1000)).toFixed(1) + ' MB';
}

/** A Volume line, with a WARNING: prefix when it is at or over WARN_SHARE of its limit. */
function warned(atRisk, line) {
    return '  ' + (atRisk ? 'WARNING: ' : '') + line;
}

/** The database size line. `size` is {bytes} or {unknown: why}. */
function sizeLine(size) {
    if (size.bytes === undefined) return `  size: unknown (${size.unknown})`;
    return warned(size.bytes >= WARN_SHARE * D1_FREE_DB_BYTES,
        `size: ${formatBytes(size.bytes)} = ${percent(size.bytes, D1_FREE_DB_BYTES)} of the free plan's ${formatBytes(D1_FREE_DB_BYTES)} per database`);
}

/** The Volume section (D-72): `volume` from volumeFigures, `size` from sizeFromD1. */
function volumeSection(volume, size) {
    const limit = D1_FREE_ROWS_WRITTEN_PER_DAY;
    const rows = volume.perDay.map(d => [d.day, d.games, d.events, d.milestones, d.crashes, d.goalSets, d.goalsMet, d.total,
        percent(d.total, limit), d.warn ? '*' : '']);
    const busiest = volume.busiest === null
        ? '  busiest day: none (no rows written in the period)'
        : warned(volume.busiest.warn, `busiest day ${volume.busiest.day} ${volume.busiest.total} rows = ${percent(volume.busiest.total, limit)} of the free plan's daily writes`);
    return [
        `Volume: rows written per day (UTC), against the D1 free plan's ${limit} rows written per day`,
        table(['day', 'games', 'events', 'milestones', 'crashes', 'goal sets', 'goals met', 'total', 'of limit', ''], rows),
        `  * at or over ${percent(WARN_SHARE, 1)} of the daily limit`,
        busiest,
        '  not counted: index writes (D1 counts another row written for each indexed column a write touches) and',
        "  the Worker's requests, which the tables don't hold; the real counts are higher.",
        sizeLine(size),
    ].join('\n');
}

/** The whole report. `heading` is {source, period, since, size} in words, Unix seconds and
 *  the database's size ({bytes} or {unknown}, sizeFromD1); `sizeOrder` the MAP_SIZES keys
 *  in order. Every section is printed once per rules version, lowest first, when the period's
 *  games ran under more than one; the Volume section, about the database, once, last. */
function report(loaded, heading, sizeOrder) {
    const { play, leftOut } = inPeriod(loaded, heading.since);
    const { versions, unattached } = byRulesVersion(play);
    const head = [
        'Thing Factory telemetry report',
        `  source: ${heading.source}`,
        `  period: ${heading.period}`,
        `  ${plural(play.games.length, 'game', 'games')}, ${plural(play.events.length, 'event', 'events')}, ${plural(play.milestones.length, 'milestone', 'milestones')}, ${plural(play.crashes.length, 'crash', 'crashes')}`,
        `  versions: ${seen(play.games.map(g => g.version))}`,
        `  rules versions: ${seen(play.games.map(g => g.rulesVersion))}`,
        `  signed-in games: ${play.games.filter(g => g.signedIn).length}`,
        ...(leftOut.events + leftOut.milestones === 0 ? []
            : [`  left out: ${plural(leftOut.events, 'event', 'events')} and ${plural(leftOut.milestones, 'milestone', 'milestones')} with no game record`]),
    ].join('\n');
    const volume = volumeSection(volumeFigures(loaded, heading.since), heading.size);
    if (versions.length === 0) {
        const crashes = play.crashes.length === 0 ? '' : '\n\n' + crashesBody(crashFigures(play.crashes, new Set()));
        return `${head}\n\nNo games recorded.${crashes}\n\n${volume}\n`;
    }
    if (versions.length === 1) return `${head}\n\n${sections(play, sizeOrder)}\n\n${volume}\n`;
    const perVersion = versions.map(v => `=== Rules version ${v.rulesVersion}: ${plural(v.play.games.length, 'game', 'games')} ===\n\n${sections(v.play, sizeOrder)}`);
    if (unattached.length > 0)
        perVersion.push(`=== Crashes with no game in this report ===\n\n${crashesBody(crashFigures(unattached, new Set()))}`);
    return `${head}\n\n${perVersion.join('\n\n')}\n\n${volume}\n`;
}

module.exports = { formatSeconds, formatNumber, formatShare, formatBytes, table, volumeSection, report };

// R-70 — the telemetry report (tools/telemetry_report.js and tools/telemetry_report/, D-66,
// ONTOLOGY "Telemetry report"): plain-text tables from the ttdat-telemetry tables, read only.
//
// Cases:
//   - fixture records → the figures and the tables of every section (games per day, size and
//     version; milestones per size with turn spread and median tally; commands, place and
//     discard by kind, discard by how; hexes per bomb; page loads, real and active length with a
//     long pause, turns; browser / OS buckets, window buckets, ratios; crashes per version,
//     messages with numbers as N, crashes with no game; players: "no signed-in games", then
//     signed-in hashes across days and a game that switched identity)
//   - the period: an old game and its events drop out; events with no game record are left out
//   - several rules versions: every section once per version, lowest first
//   - rows → records (signed_in, arg columns, rest, the delivered_<color> columns as deliveredByColor)
//   - playFromD1: seven SELECTs (the goal tables' too, D-77, and rungs, D-80) with --local --json; production with the placeholder is refused
//     without calling wrangler
//   - the CLI: usage errors and the placeholder refusal exit 1 without running wrangler; local-d1
//     end to end, batches written by the real Worker into node:sqlite with the schema, read back by
//     a fake wrangler running the report's SQL; its d1 info call for the Volume section's size
//     (failing locally → unknown (local), a size, production's --env production)
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');
const { DatabaseSync } = require('node:sqlite');
const { check, done } = require('../helpers/check');
require('../helpers/cloudflare');   // worker/index.js imports 'cloudflare:workers'

const ROOT = path.join(__dirname, '..', '..');
const TOOL = path.join(ROOT, 'tools', 'telemetry_report.js');
const records = require(path.join(ROOT, 'tools', 'telemetry_report', 'records.js'));
const fig = require(path.join(ROOT, 'tools', 'telemetry_report', 'figures.js'));
const { report, table } = require(path.join(ROOT, 'tools', 'telemetry_report', 'render.js'));

const DAY = 86400;
const T0 = Date.UTC(2026, 10, 20, 12) / 1000;    // 2026-11-20 12:00 UTC
const SIZES = ['small', 'medium', 'large', 'huge'];
const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0';
const SAFARI_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

function game(key, o = {}) {
    return { gameKey: key, playerId: 'p1', signedIn: false, format: 1, startedUnixSeconds: T0, seed: 1, size: 'small',
        version: 'abc1234', rulesVersion: 1, userAgent: CHROME_WIN, screen: '1280x720@1', ...o };
}
const snap = { turn: 1, delivered: 0, lost: 0, exGremlins: 0, trapped: 0, things: 0, crates: 1 };
function event(key, seq, command, o = {}) {
    return { gameKey: key, seq, playerId: 'p1', signedIn: false, unixSeconds: T0 + 10 * (seq + 1), command, accepted: true,
        ...snap, turn: seq + 1, args: {}, deliveredByColor: [0, 0, 0, 0], ...o };
}
function milestone(key, n, turn, o = {}) {
    return { gameKey: key, milestone: n, playerId: 'p1', signedIn: false, unixSeconds: T0 + turn, ...snap, turn, delivered: n, deliveredByColor: [n, 0, 0, 0], ...o };
}
function crash(o = {}) {
    return { id: 1, unixSeconds: T0 + 50, format: 1, version: 'abc1234', gameKey: null, playerId: 'p1', signedIn: false,
        seed: null, size: null, turn: null, message: 'boom', stack: null, userAgent: null, ...o };
}

/** Three games over two days and two sizes, every kind of record. */
function fixture() {
    return {
        games: [
            game('g1'),
            game('g2', { startedUnixSeconds: T0 + 100, size: 'medium', userAgent: FIREFOX_LINUX, screen: '1920x1080@1.5' }),
            game('g3', { playerId: 'p2', startedUnixSeconds: T0 + DAY, version: 'def5678', userAgent: SAFARI_MAC, screen: '1440x900@2' }),
        ],
        events: [
            event('g1', 0, 'place', { args: { kind: 'BELT', q: 1, r: 2, facing: 0, color: null } }),
            event('g1', 1, 'place', { args: { kind: 'BELT', q: 2, r: 2, facing: 0 } }),
            event('g1', 2, 'place', { accepted: false, args: { kind: 'SPRING', q: 3, r: 2, facing: 0 } }),
            event('g1', 3, 'discard', { args: { kind: 'WALL', how: 'pick' } }),
            event('g1', 4, 'discard', { args: { kind: 'WALL', how: 'slot' } }),
            event('g1', 5, 'discard', { args: { kind: 'TRAP', how: 'slot' } }),
            event('g1', 6, 'bomb', { args: { hexes: [{ q: 1, r: 1 }, { q: 2, r: 1 }] } }),
            event('g1', 7, 'bomb', { args: { hexes: [{ q: 1, r: 1 }] } }),
            event('g1', 8, 'bomb', { accepted: false, args: { hexes: [] } }),
            // a long pause (400 s) before g1's last event: real 490 s, without pauses 90 s
            event('g1', 9, 'remove', { unixSeconds: T0 + 490, turn: 30, args: { q: 1, r: 2, kind: 'BELT' } }),
            event('g3', 0, 'place', { playerId: 'p2', unixSeconds: T0 + DAY + 20, turn: 5, args: { kind: 'BELT' } }),
        ],
        milestones: [
            milestone('g1', 10, 20, { lost: 2, exGremlins: 3, trapped: 1 }),
            milestone('g3', 10, 40, { playerId: 'p2', unixSeconds: T0 + DAY + 40, lost: 0, exGremlins: 1, trapped: 3 }),
            milestone('g1', 20, 28, { lost: 4 }),
        ],
        crashes: [
            crash({ message: 'TypeError at line 12' }),
            crash({ id: 2, gameKey: 'g1', message: 'TypeError at line 40' }),
            crash({ id: 3, gameKey: 'g2', version: 'def5678', message: 'other bug' }),
        ],
        goalSets: [],
        goalsMet: [], rungs: [],
    };
}

const HEADING = { source: 'fixture', period: 'all time', since: 0, size: { unknown: 'local' } };

// ---- figures from fixtures ----
{
    const f = fig.figures(fixture(), SIZES);
    check('games per UTC day', JSON.stringify(f.games.perDay) === JSON.stringify([{ day: '2026-11-20', games: 2 }, { day: '2026-11-21', games: 1 }]));
    check('games by size in MAP_SIZES order', f.games.bySize.map(r => r.size + r.games).join() === 'small2,medium1');
    check('games by version, largest first, with days', f.games.byVersion[0].version === 'abc1234' && f.games.byVersion[0].games === 2 && f.games.byVersion[1].first === '2026-11-21');
    const small = f.milestones.find(m => m.size === 'small');
    const ten = small.rows.find(r => r.milestone === 10);
    check('milestone 10 on small: 2 games, turns 20..40', ten.games === 2 && ten.turn.min === 20 && ten.turn.max === 40 && ten.turn.median === 30 && ten.turn.mean === 30);
    check('milestone 10 medians of the tally', ten.lost === 1 && ten.exGremlins === 2 && ten.trapped === 2 && ten.delivered === 10);
    check('milestone 20 reached by 1', small.rows.find(r => r.milestone === 20).games === 1);
    check('a size with no milestones has no rows', f.milestones.find(m => m.size === 'medium').rows.length === 0);
    const c = f.commands;
    check('commands most first, with refused', c.perCommand[0].command === 'place' && c.perCommand[0].count === 4 && c.perCommand[0].refused === 1
        && c.perCommand.find(r => r.command === 'bomb').refused === 1);
    check('place by kind', c.placeByKind.map(r => r.kind + r.count + '/' + r.refused).join() === 'BELT3/0,SPRING1/1');
    check('discard by kind', c.discardByKind.map(r => r.kind + r.count).join() === 'WALL2,TRAP1');
    check('discard by how', c.discardByHow.map(r => r.how + r.discards).join() === 'slot2,pick1');
    check('hexes per accepted bomb', JSON.stringify(f.bomb.perHexes) === JSON.stringify([{ hexes: 1, bombs: 1 }, { hexes: 2, bombs: 1 }]));
    const s = f.sessions;
    check('page loads: p1 two games, p2 one', s.pageLoads === 2 && s.gamesPerLoad.map(r => r.games + ':' + r.loads).join() === '1:1,2:1');
    check('real length first to last record, with and without long pauses', s.realLength.max === 490 && s.activeLength.max === 90 && s.longPauses === 1);
    check('turns at the last record; games with nothing recorded counted', s.turns.min === 30 && s.turns.max === 40 && s.unrecorded === 1);
    check('UA buckets', f.clients.clients.map(r => r.client).sort().join('|') === 'Chrome / Windows|Firefox / Linux|Safari / macOS');
    check('UA buckets: Edge, Android, iOS, none', fig.clientOf('Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537 Edg/130') === 'Edge / Windows'
        && fig.clientOf('Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537') === 'Chrome / Android'
        && fig.clientOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18 Mobile Safari/604') === 'Safari / iOS'
        && fig.clientOf('curl/8') === 'other / other' && fig.clientOf(null) === 'unknown');
    check('window buckets of 100 px and ratios', f.clients.windows.map(r => r.window).sort().join() === '1200x700,1400x900,1900x1000'
        && f.clients.ratios.map(r => r.ratio).sort().join() === '1,1.5,2' && fig.screenOf(null).window === 'unknown');
    check('crashes per version', f.crashes.perVersion.map(r => r.version + r.crashes).join() === 'abc12342,def56781');
    check('crash messages with numbers as N, distinct games', f.crashes.messages[0].message === 'TypeError at line N'
        && f.crashes.messages[0].crashes === 2 && f.crashes.messages[0].games === 1);
    check('crashes with no game', f.crashes.noGame === 1 && f.crashes.gameNotInReport === 0);
    check('no signed-in players yet', f.players.signedIn === 0 && f.players.switched === 0);
}

// ---- signed-in players, identity switches ----
{
    const play = fixture();
    play.events.push(event('g2', 0, 'place', { playerId: 'h1', signedIn: true, unixSeconds: T0 + 200 }));
    play.milestones.push(milestone('g3', 20, 60, { playerId: 'h1', signedIn: true, unixSeconds: T0 + DAY + 60 }));
    play.crashes.push(crash({ id: 4, playerId: 'h2', signedIn: true }));
    const f = fig.figures(play, SIZES);
    check('signed-in hashes from rows of any table', f.players.signedIn === 2);
    check('a hash seen on two UTC days', f.players.severalDays === 1);
    check('games that switched identity mid-game', f.players.switched === 2);
    const text = report(play, HEADING, SIZES);
    check('players table when someone signed in', /signed-in players \(distinct hashes\)\s+2/.test(text) && !text.includes('no signed-in games'));
}

// ---- the rendered report ----
const text = report(fixture(), HEADING, SIZES);
{
    for (const title of ['Games started per day (UTC)', 'Games by board size', 'Games by version', 'Milestones per board size',
        'Commands (wait and rotate', 'Place, by card kind', 'Discard, by card kind', 'Discard, by how', 'Bomb: hexes per bomb',
        'Sessions: games per page load', 'Game length', 'Clients: browser / OS', 'Window sizes (rounded down to 100 px)',
        'Device pixel ratios', 'Crashes: 3, per version', 'Crash messages', 'Players (signed in)'])
        check('section: ' + title, text.includes('\n' + title));
    check('heading counts', text.includes('  3 games, 11 events, 3 milestones, 3 crashes'));
    check('heading versions and rules versions', text.includes('  versions: abc1234 (2), def5678 (1)') && text.includes('  rules versions: 1 (3)'));
    check('heading signed-in games', text.includes('  signed-in games: 0'));
    check('milestone row', /\n  10 +2 +100% +20 +30 +30 +40 +10 +1 +2 +2\n/.test(text));
    check('a size with no milestone shows (none)', /medium \(1 game\)\n  \(none\)/.test(text));
    check('session lengths printed as time', /real length \(first to last record\) +2 +40s +4m 25s +4m 25s +8m 10s/.test(text));
    check('long pause named and counted', text.includes('without long pauses (5m 00s or more)') && text.includes('long pauses: 1'));
    check('no signed-in games', text.includes('  no signed-in games'));
    check('crash line', text.includes('crashes with no game: 1'));
    check('table aligns first column left, the rest right', table(['a', 'bb'], [['xyz', 1]]) === '  a    bb\n  xyz   1');
}

// ---- the period, records with no game ----
{
    const play = fixture();
    play.games.push(game('old', { startedUnixSeconds: T0 - 10 * DAY }));
    play.events.push(event('old', 0, 'place', { unixSeconds: T0 - 10 * DAY + 5 }), event('ghost', 0, 'wait'));
    play.milestones.push(milestone('ghost', 10, 9));
    const { play: kept, leftOut } = fig.inPeriod(play, T0 - DAY);
    check('an old game and its events drop out', kept.games.length === 3 && !kept.events.some(e => e.gameKey === 'old'));
    check('events and milestones with no game record are left out', leftOut.events === 1 && leftOut.milestones === 1 && !kept.events.some(e => e.gameKey === 'ghost'));
    const t = report(play, { ...HEADING, source: 'x', period: 'games started in the last 1 day', since: T0 - DAY }, SIZES);
    check('heading says what was left out', t.includes('left out: 1 event and 1 milestone with no game record') && t.includes('  3 games, 11 events'));
    play.events.push(event('old', 1, 'place', { unixSeconds: T0 }));
    check('an older game\'s event inside the period drops with its game, not left out', fig.inPeriod(play, T0 - DAY).leftOut.events === 1);
    const none = report({ games: [], events: [], milestones: [], crashes: [crash()], goalSets: [], goalsMet: [], rungs: [] }, HEADING, SIZES);
    check('no games: said, crashes still shown', none.includes('No games recorded.') && none.includes('Crashes: 1, per version'));
}

// ---- several rules versions ----
{
    const play = fixture();
    play.games[2].rulesVersion = 2;
    play.games.unshift(game('g0', { rulesVersion: 3 }));
    const t = report(play, HEADING, SIZES);
    const v1 = t.indexOf('=== Rules version 1: 2 games ==='), v2 = t.indexOf('=== Rules version 2: 1 game ==='), v3 = t.indexOf('=== Rules version 3: 1 game ===');
    check('every section once per rules version, lowest first', v1 > 0 && v2 > v1 && v3 > v2);
    check('each version has all sections', t.split('\nGames started per day (UTC)').length === 4 && t.split('\nPlayers (signed in)').length === 4);
    check("a version's crashes are its games'", t.slice(v2, v3).includes('Crashes: 0, per version') && t.slice(v1, v2).includes('Crashes: 2, per version'));
    check('crashes with no game get their own block', t.includes('=== Crashes with no game in this report ===') && t.indexOf('=== Crashes with no game') > v3);
}

// ---- rows → records ----
{
    const e = records.eventFromRow({ game_key: 'g', seq: 3, player_id: 'p', signed_in: 1, unix_seconds: 9, command: 'discard', accepted: 0,
        turn: 4, delivered: 1, lost: 0, ex_gremlins: 2, trapped: 0, things: 3, crates: 1, kind: 'WALL', q: null, r: null, facing: null,
        color: null, delivered_red: 1, delivered_green: 0, delivered_blue: 2, delivered_yellow: 0, rest: '{"args":{"how":"slot"}}' });
    check('event row → record', e.signedIn === true && e.accepted === false && e.exGremlins === 2 && e.args.kind === 'WALL' && e.args.how === 'slot'
        && !('q' in e.args) && JSON.stringify(e.deliveredByColor) === '[1,0,2,0]');
    const bare = records.eventFromRow({ game_key: 'g', seq: 4, player_id: 'p', signed_in: 0, unix_seconds: 9, command: 'place', accepted: 1,
        turn: 4, delivered: 1, lost: 0, ex_gremlins: 0, trapped: 0, things: 3, crates: 1, kind: 'BELT', q: 1, r: 2, facing: 0,
        color: 'white', delivered_red: 0, delivered_green: 0, delivered_blue: 0, delivered_yellow: 0, rest: null });
    check('event row with rest NULL → its column args only', JSON.stringify(bare.args) === JSON.stringify({ kind: 'BELT', q: 1, r: 2, facing: 0, color: 'white' }));
    const ms = records.milestoneFromRow({ game_key: 'g', milestone: 10, player_id: 'p', signed_in: 0, unix_seconds: 9, turn: 40, delivered: 10,
        lost: 0, ex_gremlins: 0, trapped: 0, things: 3, crates: 1, delivered_red: 7, delivered_green: 3, delivered_blue: 0, delivered_yellow: 0, rest: null });
    check('milestone row → record, deliveredByColor from its columns', ms.milestone === 10 && JSON.stringify(ms.deliveredByColor) === '[7,3,0,0]');
    const g = records.gameFromRow({ game_key: 'g', player_id: 'p', signed_in: 0, format: 1, started_unix_seconds: 5, seed: 2, size: 'huge',
        version: 'v', rules_version: 1, user_agent: null, screen: null });
    check('game row → record', g.signedIn === false && g.startedUnixSeconds === 5 && g.rulesVersion === 1);
    const q = records.queries(100);
    check('queries are SELECTs of whole numbers only', [q.events, q.milestones, q.crashes].every(s => /^SELECT \* FROM \w+ WHERE \w+ >= 100 ORDER BY/.test(s)));
    // Every game is read, so a game started before the period whose events fall in it is known
    // (inPeriod drops it), not counted as "left out: no game record".
    check('the games query reads every game', /^SELECT \* FROM games ORDER BY/.test(q.games));
    let threw = false; try { records.queries('1; DROP TABLE games'); } catch (err) { threw = true; }
    check('a non-number never reaches the SQL', threw);
}

// The real wrangler.jsonc with env.production's database id put back to the placeholder (the
// top-level local id is left alone), so the refusal checks don't depend on the live id.
const PLACEHOLDER_CONFIG = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8')
    .replace(/("database_id":\s*")(?!local-only)[^"]+"/, '$1PUT-THE-DATABASE-ID-HERE"');

async function main() {
    // ---- playFromD1 with a fake wrangler ----
    {
        const calls = [];
        const answer = rows => JSON.stringify([{ results: rows, success: true, meta: {} }]);
        const play = await records.playFromD1(async args => {
            calls.push(args);
            const sql = args[args.length - 1];
            if (sql.includes('FROM games')) return answer([{ game_key: 'g', player_id: 'p', signed_in: 0, format: 1, started_unix_seconds: 5,
                seed: 1, size: 'small', version: 'v', rules_version: 1, user_agent: null, screen: null }]);
            return answer([]);
        }, 'local-d1', { path: 'wrangler.jsonc', text: PLACEHOLDER_CONFIG }, 0);
        check('seven reads, one per table', calls.length === 7 && ['games', 'events', 'milestones', 'crashes', 'goal_sets', 'goals_met', 'rungs'].every((t, i) => calls[i].at(-1).includes('FROM ' + t + ' ')));
        check('local-d1 asks wrangler for --local --json', calls.every(a => a.includes('--local') && a.includes('--json') && a[0] === 'd1' && a[1] === 'execute' && a[2] === 'ttdat-telemetry'));
        check('rows come back as records', play.games.length === 1 && play.games[0].gameKey === 'g');
        let called = false, refusal = null;
        try { await records.playFromD1(async () => { called = true; return '[]'; }, 'production', { path: 'wrangler.jsonc', text: PLACEHOLDER_CONFIG }, 0); }
        catch (err) { refusal = err; }
        check('production with the placeholder refused before wrangler runs', !called && refusal instanceof records.ReportRefusal && /PUT-THE-DATABASE-ID-HERE/.test(refusal.message));
        let bad = null;
        try { records.rowsFromWrangler('not json'); } catch (err) { bad = err; }
        check("wrangler's unreadable answer is a refusal", bad instanceof records.ReportRefusal);
    }

    // ---- the CLI ----
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ttdat-report-'));
    const marker = path.join(tmp, 'wrangler-ran');
    const callLog = path.join(tmp, 'calls.log');
    const dbFile = path.join(tmp, 'telemetry.sqlite');
    // A fake wrangler: answers `d1 execute … --json --command <sql>` from the sqlite file, logs each call.
    const fake = path.join(tmp, 'wrangler');
    fs.writeFileSync(fake, `#!/usr/bin/env node
const fs = require('fs');
fs.writeFileSync(${JSON.stringify(marker)}, 'ran');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(callLog)}, JSON.stringify(args) + '\\n');
if (args[1] === 'info') {
    // wrangler's d1 info asks Cloudflare's API: FAKE_INFO is its answer, else it fails as it does for the local database
    if (!process.env.FAKE_INFO) { process.stderr.write('ERROR: The database local-only-ttdat-telemetry could not be found [code: 7404]'); process.exit(1); }
    process.stdout.write(process.env.FAKE_INFO);
    process.exit(0);
}
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(${JSON.stringify(dbFile)}, { readOnly: true });
const results = db.prepare(args[args.indexOf('--command') + 1]).all().map(r => ({ ...r }));
process.stdout.write(JSON.stringify([{ results, success: true, meta: {} }]));
`);
    fs.chmodSync(fake, 0o755);
    const runWith = (extraEnv, configPath, ...args) => spawnSync(process.execPath, [TOOL, configPath, ...args],
        { encoding: 'utf8', env: { ...process.env, WRANGLER: fake, ...extraEnv } });
    const run = (configPath, ...args) => runWith({}, configPath, ...args);

    const config = path.join(tmp, 'wrangler.jsonc');
    fs.writeFileSync(config, PLACEHOLDER_CONFIG.replace('PUT-THE-DATABASE-ID-HERE', 'a-real-id'));
    const placeholderConfig = path.join(tmp, 'placeholder.jsonc');
    fs.writeFileSync(placeholderConfig, PLACEHOLDER_CONFIG);

    for (const args of [['bogus'], ['local'], ['local-d1', 'local-d1'], ['3', '4'], ['0'], ['-2'], ['production'], ['7', 'x']]) {
        const r = run(config, ...args);
        check('usage error: ' + JSON.stringify(args), r.status === 1 && r.stderr.startsWith('usage: just telemetry-report') && r.stdout === '');
    }
    const usage = spawnSync(process.execPath, [TOOL], { encoding: 'utf8', env: { ...process.env, WRANGLER: fake } });
    check('usage error: no config', usage.status === 1 && usage.stderr.startsWith('usage:'));
    for (const args of [[], ['7']]) {
        const r = run(placeholderConfig, ...args);
        check('production refused with the placeholder: ' + JSON.stringify(args), r.status === 1 && r.stderr.includes('does not exist yet') && r.stderr.includes('just d1-production'));
    }
    const { WRANGLER: _, ...noWranglerEnv } = process.env;
    const unset = spawnSync(process.execPath, [TOOL, config, 'local-d1'], { encoding: 'utf8', env: noWranglerEnv });
    check('WRANGLER unset: refused, exit 1', unset.status === 1 && unset.stderr.startsWith('WRANGLER is not set'));
    check('wrangler never ran for a usage error or the placeholder', !fs.existsSync(marker));

    // Batches through the real Worker into the sqlite file, as wrangler dev would hold them.
    const db = new DatabaseSync(dbFile);
    db.exec(fs.readFileSync(path.join(ROOT, 'worker', 'telemetry_schema.sql'), 'utf8'));
    const d1 = {
        prepare(sql) { return { bind(...args) { return { sql, args }; } }; },
        async batch(statements) { for (const s of statements) db.prepare(s.sql).run(...s.args.map(v => v === undefined ? null : v)); },
    };
    const worker = (await import(pathToFileURL(path.join(ROOT, 'worker', 'index.js')).href)).default;
    const now = Math.floor(Date.now() / 1000);
    const wireGame = (key, started) => ({ gameKey: key, startedUnixSeconds: started, seed: 7, size: 'small', version: 'abc1234',
        rulesVersion: 1, userAgent: CHROME_WIN, screen: '1280x720@1' });
    const wireSnap = { turn: 3, delivered: 1, lost: 0, exGremlins: 0, trapped: 0, things: 2, crates: 1, deliveredByColor: [1, 0, 0, 0] };
    const post = async batch => {
        const waits = [];
        const res = await worker.fetch(new Request('http://localhost:8787/t', { method: 'POST', body: JSON.stringify(batch) }), { TELEMETRY: d1 }, { waitUntil: p => waits.push(p) });
        await Promise.all(waits);
        return res.status;
    };
    const statuses = [
        await post({ format: 1, player: 'load-1', games: [wireGame('new', now - 100)],
            events: [{ gameKey: 'new', seq: 0, unixSeconds: now - 90, command: 'place', accepted: true, ...wireSnap, args: { kind: 'BELT', q: 1, r: 2, facing: 0, color: null } },
                { gameKey: 'new', seq: 1, unixSeconds: now - 80, command: 'discard', accepted: true, ...wireSnap, args: { kind: 'WALL', how: 'slot' } },
                { gameKey: 'new', seq: 2, unixSeconds: now - 70, command: 'bomb', accepted: true, ...wireSnap, args: { hexes: [{ q: 1, r: 1 }, { q: 2, r: 2 }, { q: 3, r: 3 }] } }],
            milestones: [{ gameKey: 'new', milestone: 10, unixSeconds: now - 60, ...wireSnap, turn: 44, delivered: 10, deliveredByColor: [6, 4, 0, 0] }] }),
        await post({ format: 1, player: 'load-0', games: [wireGame('old', now - 10 * DAY)],
            events: [{ gameKey: 'old', seq: 0, unixSeconds: now - 10 * DAY + 5, command: 'remove', accepted: false, ...wireSnap, args: { q: 1, r: 1, kind: null } }] }),
        await post({ format: 1, player: 'load-1', crashes: [{ unixSeconds: now - 50, message: 'TypeError at 12:7', gameKey: 'new' }] }),
    ];
    check('the Worker took the fixture batches', statuses.every(s => s === 204));
    {
        const evRows = db.prepare("SELECT * FROM events WHERE game_key = 'new' ORDER BY seq").all().map(r => ({ ...r }));
        const msRow = { ...db.prepare("SELECT * FROM milestones WHERE game_key = 'new'").get() };
        check('the Worker stored deliveredByColor in the delivered_<color> columns', evRows.every(r => r.delivered_red === 1 && r.delivered_green === 0
            && r.delivered_blue === 0 && r.delivered_yellow === 0) && msRow.delivered_red === 6 && msRow.delivered_green === 4);
        check('… and not in rest (an event\'s rest is its other args or NULL, a milestone\'s NULL)', evRows[0].rest === null
            && evRows[1].rest === '{"args":{"how":"slot"}}' && evRows[2].rest === '{"args":{"hexes":[{"q":1,"r":1},{"q":2,"r":2},{"q":3,"r":3}]}}' && msRow.rest === null);
        const back = records.playFromRows({ games: [], events: evRows, milestones: [msRow], crashes: [], goalSets: [], goalsMet: [], rungs: [] });
        check('read back as records: deliveredByColor in CRATE_COLORS order', JSON.stringify(back.events[1].deliveredByColor) === '[1,0,0,0]'
            && back.events[1].args.how === 'slot' && JSON.stringify(back.milestones[0].deliveredByColor) === '[6,4,0,0]');
    }

    const before = fs.statSync(dbFile).mtimeMs;
    const all = run(config, 'local-d1');
    check('local-d1 report exits 0', all.status === 0);
    const out = all.stdout;
    for (const title of ['Games started per day (UTC)', 'Games by board size', 'Games by version', 'Milestones per board size', 'Commands (wait',
        'Place, by card kind', 'Discard, by card kind', 'Discard, by how', 'Bomb: hexes per bomb', 'Sessions:', 'Game length', 'Clients:',
        'Window sizes', 'Device pixel ratios', 'Crashes: 1, per version', 'Crash messages', 'Players (signed in)'])
        check('local-d1 prints section: ' + title, out.includes('\n' + title));
    check('local-d1 heading', out.includes("source: wrangler dev's local D1 database (wrangler d1 execute --local,") && out.includes('  2 games, 4 events, 1 milestone, 1 crash'));
    check('local-d1 figures from the Worker rows', /\n  BELT +1 +0\n/.test(out) && /\n  3 +1 +100%\n/.test(out) && out.includes('TypeError at N:N')
        && out.includes('Chrome / Windows') && /\n  slot +1\n/.test(out));
    const calls = fs.readFileSync(callLog, 'utf8').trim().split('\n').map(JSON.parse);
    const executes = calls.filter(a => a[1] === 'execute'), infos = calls.filter(a => a[1] === 'info');
    check('the CLI asked wrangler seven read-only SELECTs, --local --json, with the config', executes.length === 7
        && executes.every(a => a.includes('--local') && a.includes('--json') && a[a.indexOf('--config') + 1] === config && /^SELECT /.test(a.at(-1))));
    check('and one d1 info --json for the size, no --env', calls.length === 8 && infos.length === 1 && infos[0][2] === 'ttdat-telemetry'
        && infos[0].includes('--json') && infos[0][infos[0].indexOf('--config') + 1] === config && !infos[0].includes('--env'));
    check('local-d1 prints the Volume section last', out.includes('\nVolume: rows written per day (UTC)') && out.indexOf('\nVolume:') > out.indexOf('\nPlayers (signed in)'));
    const oldDay = new Date((now - 10 * DAY) * 1000).toISOString().slice(0, 10);
    check('local-d1 Volume: the 10-day-old game and its event count on their own day', new RegExp('\\n  ' + oldDay + ' +1 +1 +0 +0 +0 +0 +0 +2 +0%\\n').test(out));
    check('local-d1 Volume: the busiest day line', /\n  busiest day \d{4}-\d\d-\d\d \d+ rows = 0% of the free plan's daily writes\n/.test(out));
    check('d1 info failing for the local database: size: unknown (local)', out.trimEnd().endsWith('  size: unknown (local)'));
    const sized = runWith({ FAKE_INFO: JSON.stringify({ uuid: 'x', name: 'ttdat-telemetry', num_tables: 4, database_size: 61440 }) }, config, 'local-d1');
    check('a size from d1 info is printed against the free plan', sized.status === 0 && sized.stdout.includes("  size: 61.4 KB = 0% of the free plan's 500.0 MB per database"));

    fs.writeFileSync(callLog, '');
    const week = run(config, '7', 'local-d1');
    check('days in either order: the old game and its event drop out', week.status === 0 && week.stdout.includes('period: games started in the last 7 days')
        && week.stdout.includes('  1 game, 3 events, 1 milestone, 1 crash'));
    check('the number reaches the SQL as the period start', fs.readFileSync(callLog, 'utf8').trim().split('\n').map(JSON.parse)
        .filter(a => a[1] === 'execute' && !/FROM games /.test(a.at(-1)))
        .every(a => { const m = /(>=) (\d+)/.exec(a.at(-1)); return m && Math.abs(Number(m[2]) - (now - 7 * DAY)) < 60; }));
    check('an old game is not counted as left out', !week.stdout.includes('left out'));
    // production (a real id in the config) asks d1 info with --env production; a big database warns
    fs.writeFileSync(callLog, '');
    const prod = runWith({ FAKE_INFO: JSON.stringify({ database_size: 260 * 1000 * 1000 }) }, config);
    const prodInfo = fs.readFileSync(callLog, 'utf8').trim().split('\n').map(JSON.parse).filter(a => a[1] === 'info');
    check('production: d1 info with --env production', prod.status === 0 && prodInfo.length === 1 && prodInfo[0].join(' ').includes('--env production'));
    check('production: a database at or over half the free size warns', prod.stdout.includes("  WARNING: size: 260.0 MB = 52% of the free plan's 500.0 MB per database"));
    const prodNoSize = runWith({ FAKE_INFO: '{}' }, config);
    check('production: no size from d1 info', prodNoSize.status === 0 && prodNoSize.stdout.includes('  size: unknown (wrangler d1 info gave no size)'));
    check('the database is unchanged by the reports', db.prepare('SELECT COUNT(*) AS n FROM events').get().n === 4 && fs.statSync(dbFile).mtimeMs === before);
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
}

main().then(done, err => { console.log('  FAIL threw: ' + (err && err.stack)); process.exit(1); });

// R-111 — the telemetry report's Achievements section (tools/telemetry_report/, D-80).
//
// Cases:
//   - fixture records → per counter: the distinct players who reached each rung (rising), the
//     players who reached any, the highest rung seen; most players first, ties by name; the rung
//     records and distinct players in all
//   - the rendered section: its title line and table, after Goals and before Volume; no rung
//     records: "0 rungs reached by 0 players" and (none); the period and rules versions take rung
//     records with their games
//   - rows → records: a rungs row back as {gameKey, playerId, signedIn, counter, rung, unixSeconds}
//   - end to end: batches the real Worker wrote into node:sqlite with the schema, read back by the
//     CLI (local-d1) through a fake wrangler running its SQL: seven read-only SELECTs, the rungs
//     table's among them, and the Achievements section
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
const { report } = require(path.join(ROOT, 'tools', 'telemetry_report', 'render.js'));

const T0 = Date.UTC(2026, 10, 20, 12) / 1000;
const SIZES = ['small', 'medium', 'large', 'huge'];
const HEADING = { source: 'fixture', period: 'all time', since: 0, size: { unknown: 'local' } };
const game = (key, o = {}) => ({ gameKey: key, playerId: 'h1', signedIn: true, format: 1, startedUnixSeconds: T0, seed: 1, size: 'small',
    version: 'v', rulesVersion: 1, userAgent: null, screen: null, ...o });
const rung = (key, player, counter, n, t = 10) => ({ gameKey: key, playerId: player, signedIn: true, counter, rung: n, unixSeconds: T0 + t });
const empty = () => ({ games: [], events: [], milestones: [], crashes: [], goalSets: [], goalsMet: [], rungs: [] });

/** h1 reached placed 10, 20, 50 and trapped 100; h2 placed 10, 20 and discards 10; h3 placed 10 and trapped 100, 200. */
function fixture() {
    return {
        ...empty(),
        games: [game('g1'), game('g2', { playerId: 'h2' }), game('g3', { playerId: 'h3', size: 'medium' })],
        rungs: [
            rung('g1', 'h1', 'placed', 10), rung('g1', 'h1', 'placed', 20), rung('g1', 'h1', 'placed', 50), rung('g1', 'h1', 'trapped', 100),
            rung('g2', 'h2', 'placed', 10), rung('g2', 'h2', 'placed', 20), rung('g2', 'h2', 'discards', 10),
            rung('g3', 'h3', 'placed', 10), rung('g3', 'h3', 'trapped', 100), rung('g3', 'h3', 'trapped', 200),
        ],
    };
}

// ---- figures ----
{
    const f = fig.achievementFigures(fixture());
    const row = c => f.perCounter.find(r => r.counter === c);
    check('rung records and distinct players in all', f.rungs === 10 && f.players === 3);
    check('placed: 3 players, highest 50, per rung 10: 3, 20: 2, 50: 1', row('placed').players === 3 && row('placed').highest === 50 &&
        JSON.stringify(row('placed').perRung) === '[{"rung":10,"players":3},{"rung":20,"players":2},{"rung":50,"players":1}]');
    check('trapped: 2 players, highest 200, per rung 100: 2, 200: 1', row('trapped').players === 2 && row('trapped').highest === 200 &&
        row('trapped').perRung.map(r => r.rung + ':' + r.players).join() === '100:2,200:1');
    check('discards (a negative counter): 1 player, highest 10', row('discards').players === 1 && row('discards').highest === 10);
    check('most players first, ties by name', f.perCounter.map(r => r.counter).join() === 'placed,trapped,discards');
    const twice = fixture();
    twice.rungs.push(rung('g1', 'h1', 'discards', 10));
    check('players are distinct per rung', fig.achievementFigures(twice).perCounter.find(r => r.counter === 'discards').perRung[0].players === 2);
    const none = fig.achievementFigures(empty());
    check('no rung records: no rows, 0 rungs, 0 players', none.perCounter.length === 0 && none.rungs === 0 && none.players === 0);
}

// ---- the rendered section ----
{
    const text = report(fixture(), HEADING, SIZES);
    check('the Achievements title: rungs and players', text.includes('\nAchievements: 10 rungs reached by 3 players\n'));
    check('its table header', /\n  counter +players +highest rung +players per rung\n/.test(text));
    check('a counter row', /\n  placed +3 +50 +10: 3, 20: 2, 50: 1\n/.test(text) && /\n  trapped +2 +200 +100: 2, 200: 1\n/.test(text));
    check('after Goals, before Volume', text.indexOf('\nAchievements:') > text.indexOf('\nGoals:') && text.indexOf('\nAchievements:') < text.indexOf('\nVolume:'));
    const bare = report({ ...empty(), games: [game('g')] }, HEADING, SIZES);
    check('no rung records: 0 rungs by 0 players, (none)', /\nAchievements: 0 rungs reached by 0 players\n  \(none\)/.test(bare));
    const play = fixture();
    play.games.push(game('old', { startedUnixSeconds: T0 - 10 * 86400 }));
    play.rungs.push(rung('old', 'h9', 'placed', 100, -10 * 86400));
    const kept = fig.inPeriod(play, T0 - 86400).play;
    check('the period drops an old game\'s rungs', kept.rungs.length === 10 && !kept.rungs.some(r => r.gameKey === 'old'));
    play.games[2].rulesVersion = 2;
    const split = fig.byRulesVersion(fig.inPeriod(play, T0 - 86400).play).versions;
    check('rules versions split rung records with their games', split[0].play.rungs.length === 7 && split[1].play.rungs.length === 3);
}

// ---- rows → records ----
{
    const r = records.rungFromRow({ player_id: 'h', signed_in: 1, game_key: 'g', counter: 'placed', rung: 20, unix_seconds: 9 });
    check('rungs row → record', JSON.stringify(r) === JSON.stringify({ gameKey: 'g', playerId: 'h', signedIn: true, counter: 'placed', rung: 20, unixSeconds: 9 }));
    check('the rungs query is a SELECT over the period', /^SELECT \* FROM rungs WHERE unix_seconds >= 100 ORDER BY/.test(records.queries(100).rungs));
}

// ---- end to end ----
async function main() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ttdat-rungs-'));
    const callLog = path.join(tmp, 'calls.log');
    const dbFile = path.join(tmp, 'telemetry.sqlite');
    const fake = path.join(tmp, 'wrangler');
    fs.writeFileSync(fake, `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(callLog)}, JSON.stringify(args) + '\\n');
if (args[1] === 'info') process.exit(1);
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(${JSON.stringify(dbFile)}, { readOnly: true });
const results = db.prepare(args[args.indexOf('--command') + 1]).all().map(r => ({ ...r }));
process.stdout.write(JSON.stringify([{ results, success: true, meta: {} }]));
`);
    fs.chmodSync(fake, 0o755);
    const config = path.join(tmp, 'wrangler.jsonc');
    fs.writeFileSync(config, fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8'));

    const db = new DatabaseSync(dbFile);
    db.exec(fs.readFileSync(path.join(ROOT, 'worker', 'telemetry_schema.sql'), 'utf8'));
    const d1 = {
        prepare(sql) { return { bind(...args) { return { sql, args }; } }; },
        async batch(statements) { for (const s of statements) db.prepare(s.sql).run(...s.args.map(v => v === undefined ? null : v)); },
    };
    const worker = (await import(pathToFileURL(path.join(ROOT, 'worker', 'index.js')).href)).default;
    const now = Math.floor(Date.now() / 1000);
    const post = async batch => {
        const waits = [];
        const res = await worker.fetch(new Request('http://localhost:8787/t', { method: 'POST', body: JSON.stringify(batch) }), { TELEMETRY: d1 }, { waitUntil: p => waits.push(p) });
        await Promise.all(waits);
        return res.status;
    };
    const g = (key, player) => ({ format: 1, player, games: [{ gameKey: key, startedUnixSeconds: now - 100, seed: 7, size: 'small', version: 'abc1234', rulesVersion: 1 }] });
    const w = (key, counter, n) => ({ gameKey: key, counter, rung: n, unixSeconds: now - 50 });
    const statuses = [
        await post({ ...g('e1', 'load-1'), rungs: [w('e1', 'placed', 10), w('e1', 'placed', 20), w('e1', 'rungsReached', 1)] }),
        await post({ ...g('e2', 'load-2'), rungs: [w('e2', 'placed', 10)] }),
        await post({ format: 1, player: 'load-1', rungs: [w('e1', 'placed', 10)] }),   // a resend: kept once
    ];
    check('the Worker took the rung batches', statuses.every(s => s === 204));
    const r = spawnSync(process.execPath, [TOOL, config, 'local-d1'], { encoding: 'utf8', env: { ...process.env, WRANGLER: fake } });
    check('local-d1 report exits 0', r.status === 0);
    const calls = fs.readFileSync(callLog, 'utf8').trim().split('\n').map(JSON.parse).filter(a => a[1] === 'execute');
    check('seven read-only SELECTs, the rungs table\'s among them', calls.length === 7 && calls.every(a => /^SELECT /.test(a.at(-1))) &&
        calls.some(a => a.at(-1).includes('FROM rungs ')));
    check('the Achievements section from the Worker\'s rows', r.stdout.includes('\nAchievements: 4 rungs reached by 2 players\n') &&
        /\n  placed +2 +20 +10: 2, 20: 1\n/.test(r.stdout) && /\n  rungsReached +1 +1 +1: 1\n/.test(r.stdout));
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
}

main().then(done, err => { console.log('  FAIL threw: ' + (err && err.stack)); process.exit(1); });

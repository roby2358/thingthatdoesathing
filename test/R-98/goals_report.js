// R-98 — the telemetry report's Goals section (tools/telemetry_report/, D-77).
//
// Cases:
//   - fixture records → per goal counter: times dealt, re-rolled away (unmet in a set that a
//     'reroll' set followed; not after 'next', not the last set), met, median turns from the set's
//     deal to the goal met (a goal met whose set record is missing counted as met, no turns);
//     sets dealt by how, sets done (every goal of a known set met); most dealt first
//   - the rendered section: its title line and its table, after Players and before Volume; no goal
//     records: "0 sets dealt, 0 done" and (none); the period and rules versions split them with their games
//   - rows → records: goal_sets' three counter/amount columns back as a list, goals_met's idx as index
//   - end to end: batches the real Worker wrote into node:sqlite with the schema, read back by the CLI
//     (local-d1) through a fake wrangler running its SQL: seven read-only SELECTs, the Goals section
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
const game = (key, o = {}) => ({ gameKey: key, playerId: 'p1', signedIn: false, format: 1, startedUnixSeconds: T0, seed: 1, size: 'small',
    version: 'v', rulesVersion: 1, userAgent: null, screen: null, ...o });
const set = (key, n, how, turn, counters) => ({ gameKey: key, set: n, playerId: 'p1', signedIn: false, how, turn, unixSeconds: T0 + turn,
    goals: counters.map(([counter, amount]) => ({ counter, amount })) });
const met = (key, n, index, counter, turn) => ({ gameKey: key, set: n, index, playerId: 'p1', signedIn: false, counter, amount: 5, turn, unixSeconds: T0 + turn });

/** g1: set 0 (start) half met, re-rolled at turn 30 into set 1; set 1 all met; set 2 (next) dealt.
 *  g2: set 0 none met, the game's last set. A goal met of a set never recorded (g2 set 5). */
function fixture() {
    return {
        games: [game('g1'), game('g2', { size: 'medium' })],
        events: [], milestones: [], crashes: [],
        goalSets: [
            set('g1', 0, 'start', 1, [['bombs', 5], ['trapped', 5], ['placed', 50]]),
            set('g1', 1, 'reroll', 30, [['bombs', 5], ['slides', 50], ['moved', 5]]),
            set('g1', 2, 'next', 90, [['trapped', 5], ['exGremlins', 5], ['placed', 50]]),
            set('g2', 0, 'start', 1, [['bombs', 5], ['trapped', 5], ['moved', 5]]),
        ],
        goalsMet: [
            met('g1', 0, 0, 'bombs', 21),                                                        // 20 turns after its deal
            met('g1', 1, 0, 'bombs', 40), met('g1', 1, 1, 'slides', 60), met('g1', 1, 2, 'moved', 80),   // 10, 30, 50
            met('g2', 5, 1, 'slides', 99),                                                       // no set record
        ],
        rungs: [],
    };
}

// ---- figures ----
{
    const f = fig.goalFigures(fixture());
    const row = c => f.perCounter.find(r => r.counter === c);
    check('sets dealt and by how', f.sets === 4 && f.byHow.map(r => r.how + r.sets).join() === 'start2,next1,reroll1');
    check('sets done: only g1 set 1 (every goal met)', f.done === 1);
    check('bombs: dealt 3, re-rolled away 0 (met before the re-roll), met 2, median turns 15', row('bombs').dealt === 3 && row('bombs').rerolled === 0 &&
        row('bombs').met === 2 && row('bombs').medianTurns === 15);
    check('trapped: dealt 3, re-rolled away 1 (g1 set 0; g1 set 2 and g2 set 0 had no re-roll after), met 0, no turns',
        row('trapped').dealt === 3 && row('trapped').rerolled === 1 && row('trapped').met === 0 && row('trapped').medianTurns === null);
    check('placed: re-rolled away once; not after a next set', row('placed').dealt === 2 && row('placed').rerolled === 1);
    check('slides: met twice (one with no set record), turns only from the known set', row('slides').dealt === 1 && row('slides').met === 2 && row('slides').medianTurns === 30);
    check('moved: met once at 50 turns from its deal', row('moved').met === 1 && row('moved').medianTurns === 50 && row('moved').rerolled === 0);
    check('most dealt first, ties by name', f.perCounter.map(r => r.counter).join() === 'bombs,trapped,moved,placed,exGremlins,slides');
    const none = fig.goalFigures({ games: [], events: [], milestones: [], crashes: [], goalSets: [], goalsMet: [], rungs: [] });
    check('no goal records: no rows, 0 sets', none.perCounter.length === 0 && none.sets === 0 && none.done === 0);
}

// ---- the rendered section ----
{
    const text = report(fixture(), HEADING, SIZES);
    check('the Goals section title: sets dealt by how, sets done', text.includes('\nGoals: 4 sets dealt (start 2, next 1, reroll 1), 1 done\n'));
    check('its table header', /\n  counter +dealt +re-rolled away +met +median turns to met\n/.test(text));
    check('a counter row', /\n  bombs +3 +0 +2 +15\n/.test(text) && /\n  trapped +3 +1 +0 +-\n/.test(text));
    check('after Players, before Volume', text.indexOf('\nGoals:') > text.indexOf('\nPlayers (signed in)') && text.indexOf('\nGoals:') < text.indexOf('\nVolume:'));
    const empty = report({ games: [game('g')], events: [], milestones: [], crashes: [], goalSets: [], goalsMet: [], rungs: [] }, HEADING, SIZES);
    check('no goal records: 0 sets, (none)', /\nGoals: 0 sets dealt, 0 done\n  \(none\)/.test(empty));
    const play = fixture();
    play.games.push(game('old', { startedUnixSeconds: T0 - 10 * 86400 }));
    play.goalSets.push(set('old', 0, 'start', 1, [['bombs', 5], ['trapped', 5], ['placed', 50]]));
    const kept = fig.inPeriod(play, T0 - 86400).play;
    check('the period drops an old game\'s goal sets', kept.goalSets.length === 4 && kept.goalsMet.length === 5);
    play.games[1].rulesVersion = 2;
    const split = fig.byRulesVersion(fig.inPeriod(play, T0 - 86400).play).versions;
    check('rules versions split goal records with their games', split[0].play.goalSets.length === 3 && split[1].play.goalSets.length === 1 &&
        split[1].play.goalsMet.length === 1);
}

// ---- rows → records ----
{
    const s = records.goalSetFromRow({ game_key: 'g', set_no: 2, player_id: 'p', signed_in: 1, how: 'next', turn: 50, unix_seconds: 9,
        counter1: 'bombs', amount1: 5, counter2: 'trapped', amount2: 10, counter3: 'placed', amount3: 100 });
    check('goal_sets row → record, its three goals as a list', s.gameKey === 'g' && s.set === 2 && s.signedIn === true && s.how === 'next' && s.turn === 50 &&
        JSON.stringify(s.goals) === '[{"counter":"bombs","amount":5},{"counter":"trapped","amount":10},{"counter":"placed","amount":100}]');
    const m = records.goalMetFromRow({ game_key: 'g', set_no: 2, idx: 1, player_id: 'p', signed_in: 0, counter: 'trapped', amount: 10, turn: 70, unix_seconds: 11 });
    check('goals_met row → record', m.set === 2 && m.index === 1 && m.counter === 'trapped' && m.amount === 10 && m.turn === 70 && m.signedIn === false);
    const q = records.queries(100);
    check('the goal queries are SELECTs over the period', /^SELECT \* FROM goal_sets WHERE unix_seconds >= 100 ORDER BY/.test(q.goalSets) &&
        /^SELECT \* FROM goals_met WHERE unix_seconds >= 100 ORDER BY/.test(q.goalsMet));
}

// ---- end to end ----
async function main() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ttdat-goals-'));
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
    const wire = (n, how, turn, counters) => ({ gameKey: 'e2e', set: n, how, turn, unixSeconds: now - 100 + turn, goals: counters.map(([counter, amount]) => ({ counter, amount })) });
    const statuses = [
        await post({ format: 1, player: 'load-1', games: [{ gameKey: 'e2e', startedUnixSeconds: now - 100, seed: 7, size: 'small', version: 'abc1234', rulesVersion: 1 }],
            goalSets: [wire(0, 'start', 1, [['bombs', 5], ['trapped', 5], ['placed', 50]])],
            goalsMet: [{ gameKey: 'e2e', set: 0, index: 1, counter: 'trapped', amount: 5, turn: 13, unixSeconds: now - 80, met: true }] }),
        await post({ format: 1, player: 'load-1', goalSets: [wire(1, 'reroll', 20, [['moved', 5], ['slides', 50], ['cannonLobs', 5]])] }),
    ];
    check('the Worker took the goal batches', statuses.every(s => s === 204));
    const r = spawnSync(process.execPath, [TOOL, config, 'local-d1'], { encoding: 'utf8', env: { ...process.env, WRANGLER: fake } });
    check('local-d1 report exits 0', r.status === 0);
    const calls = fs.readFileSync(callLog, 'utf8').trim().split('\n').map(JSON.parse).filter(a => a[1] === 'execute');
    check('seven read-only SELECTs, the goal tables\' among them', calls.length === 7 && calls.every(a => /^SELECT /.test(a.at(-1))) &&
        calls.some(a => a.at(-1).includes('FROM goal_sets ')) && calls.some(a => a.at(-1).includes('FROM goals_met ')));
    check('the Goals section from the Worker\'s rows', r.stdout.includes('\nGoals: 2 sets dealt (reroll 1, start 1), 0 done\n') &&
        /\n  trapped +1 +0 +1 +12\n/.test(r.stdout) && /\n  bombs +1 +1 +0 +-\n/.test(r.stdout) && /\n  moved +1 +0 +0 +-\n/.test(r.stdout));
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
}

main().then(done, err => { console.log('  FAIL threw: ' + (err && err.stack)); process.exit(1); });

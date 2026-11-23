// R-97 — the Worker's goal records (worker/telemetry.js, D-77): a batch's goalSets and goalsMet
// checked whole and written to goal_sets and goals_met.
//
// worker/index.js against a fake D1 that is a real SQLite database (node:sqlite) with
// worker/telemetry_schema.sql applied (as R-68). Cases:
//   - GOAL_COUNTERS is GameArtifacts.COUNTERS' goal keys, in order; GOALS_PER_SET is GOALS_PER_GAME
//   - a valid batch → 204, one goal_sets row per set (set_no, how, turn, unix_seconds, the three
//     counters and amounts in order) and one goals_met row per goal met, each with the batch identity
//   - a goal set or goal met sent again is kept once, the first (INSERT OR IGNORE on natural keys)
//   - a batch without the goal lists is taken as before
//   - MAX_RECORDS counts goal records; bad goal records → 400 and nothing written
//   - the schema makes both tables, safe to rerun, and adds them to a database that lacks them
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { DatabaseSync } = require('node:sqlite');
const { check, done } = require('../helpers/check');
require('../helpers/cloudflare');   // worker/index.js imports 'cloudflare:workers'
const { SCHEMA, sqliteD1 } = require('../helpers/telemetry');
const { load } = require('../helpers/load');

const ROOT = path.join(__dirname, '..', '..');
const logged = [];
for (const k of ['info', 'warn', 'error', 'debug']) console[k] = (...a) => logged.push(a.map(String).join(' '));

const GAME = { gameKey: 'g1', startedUnixSeconds: 1763700000, seed: 4242, size: 'small', version: 'abc1234', rulesVersion: 1 };
const SET = { gameKey: 'g1', set: 0, how: 'start', turn: 1, unixSeconds: 1763700001,
    goals: [{ counter: 'cratesDelivered', amount: 50 }, { counter: 'trapped', amount: 500 }, { counter: 'placed', amount: 50 }] };
const MET = { gameKey: 'g1', set: 0, index: 1, counter: 'trapped', amount: 500, turn: 40, unixSeconds: 1763700300, met: true };

let worker, mod;
async function post(d1, body, headers = {}) {
    const waits = [];
    const res = await worker.fetch(new Request('https://ttdat.yuwakisa.com/t', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
        headers: { 'Content-Type': 'text/plain', ...headers } }), { TELEMETRY: d1 }, { waitUntil: p => waits.push(p) });
    await Promise.all(waits);
    return res;
}

(async () => {
    worker = (await import(pathToFileURL(path.join(ROOT, 'worker', 'index.js')).href)).default;
    mod = await import(pathToFileURL(path.join(ROOT, 'worker', 'telemetry.js')).href);
    const { GameArtifacts } = load();
    check('GOAL_COUNTERS is GameArtifacts.COUNTERS\' goal keys, in order',
        JSON.stringify(mod.GOAL_COUNTERS) === JSON.stringify(GameArtifacts.COUNTERS.filter(c => c.goal).map(c => c.key)));
    check('GOALS_PER_SET is GameArtifacts.GOALS_PER_GAME', mod.GOALS_PER_SET === GameArtifacts.GOALS_PER_GAME);
    check('GOAL_HOWS: start, reroll, next', JSON.stringify(mod.GOAL_HOWS) === '["start","reroll","next"]');

    // A valid batch.
    {
        const d1 = sqliteD1();
        const res = await post(d1, { format: 1, player: 'p-one', games: [GAME],
            goalSets: [SET, { ...SET, set: 1, how: 'reroll', turn: 20, goals: [{ counter: 'cannonLobs', amount: 5 }, { counter: 'slides', amount: 100 }, { counter: 'pushesPulls', amount: 50 }] }],
            goalsMet: [MET, { ...MET, set: 1, index: 0, counter: 'cannonLobs', amount: 5, turn: 30 }] });
        check('a batch with goal records → 204', res.status === 204);
        const sets = d1.rows('goal_sets', 'set_no');
        check('one goal_sets row per set, its fields', sets.length === 2 && sets[0].game_key === 'g1' && sets[0].set_no === 0 && sets[0].how === 'start' &&
            sets[0].turn === 1 && sets[0].unix_seconds === 1763700001 && sets[1].how === 'reroll' && sets[1].turn === 20);
        check('… its three counters and amounts in the set\'s order', sets[0].counter1 === 'cratesDelivered' && sets[0].amount1 === 50 &&
            sets[0].counter2 === 'trapped' && sets[0].amount2 === 500 && sets[0].counter3 === 'placed' && sets[0].amount3 === 50 && sets[1].counter3 === 'pushesPulls');
        const met = d1.rows('goals_met', 'set_no, idx');
        check('one goals_met row per goal met, its fields', met.length === 2 && met[0].set_no === 0 && met[0].idx === 1 && met[0].counter === 'trapped' &&
            met[0].amount === 500 && met[0].turn === 40 && met[0].unix_seconds === 1763700300 && met[1].set_no === 1 && met[1].idx === 0 && met[1].counter === 'cannonLobs');
        check('every goal row carries the batch identity', [...sets, ...met].every(r => r.player_id === 'p-one' && r.signed_in === 0));
        await post(d1, { format: 1, player: 'p-two', goalSets: [{ ...SET, turn: 99 }], goalsMet: [{ ...MET, turn: 99 }] });
        const again = d1.rows('goal_sets', 'set_no'), metAgain = d1.rows('goals_met', 'set_no, idx');
        check('a goal set and a goal met sent again are kept once, the first', again.length === 2 && again[0].turn === 1 && again[0].player_id === 'p-one' &&
            metAgain.length === 2 && metAgain[0].turn === 40);
        const src = fs.readFileSync(path.join(ROOT, 'worker', 'telemetry.js'), 'utf8');
        check('both goal INSERTs are INSERT OR IGNORE', /INSERT OR IGNORE INTO goal_sets/.test(src) && /INSERT OR IGNORE INTO goals_met/.test(src));
    }

    // An old batch, no goal lists.
    {
        const d1 = sqliteD1();
        const res = await post(d1, { format: 1, player: 'p', games: [GAME] });
        check('a batch without goalSets or goalsMet → 204, its rows written', res.status === 204 && d1.count('games') === 1 && d1.total() === 1);
    }

    // Bad goal records: 400, nothing written.
    const goals2 = SET.goals.slice(0, 2), goals4 = [...SET.goals, { counter: 'moved', amount: 1 }];
    const bad = [
        ['too many records, goal records counted', { goalsMet: Array.from({ length: mod.MAX_RECORDS }, (_, i) => ({ ...MET, set: i })) }, 'too many records'],
        ['goalSets not a list', { goalSets: {} }, 'goalSets'],
        ['goalsMet not a list', { goalsMet: 'x' }, 'goalsMet'],
        ['a goal set that isn\'t an object', { goalSets: [3] }, 'goalSets[0]'],
        ['an unknown how', { goalSets: [{ ...SET, how: 'shuffle' }] }, 'goalSets[0].how'],
        ['a negative set', { goalSets: [{ ...SET, set: -1 }] }, 'goalSets[0].set'],
        ['a fractional set', { goalSets: [{ ...SET, set: 0.5 }] }, 'goalSets[0].set'],
        ['a set as text', { goalSets: [{ ...SET, set: '0' }] }, 'goalSets[0].set'],
        ['turn 0', { goalSets: [{ ...SET, turn: 0 }] }, 'goalSets[0].turn'],
        ['a missing gameKey', { goalSets: [{ ...SET, gameKey: undefined }] }, 'goalSets[0].gameKey'],
        ['goals missing', { goalSets: [{ ...SET, goals: undefined }] }, 'goalSets[0].goals'],
        ['2 goals', { goalSets: [{ ...SET, goals: goals2 }] }, 'goalSets[0].goals'],
        ['4 goals', { goalSets: [{ ...SET, goals: goals4 }] }, 'goalSets[0].goals'],
        ['an unknown counter', { goalSets: [{ ...SET, goals: [SET.goals[0], { counter: 'teleports', amount: 5 }, SET.goals[2]] }] }, 'goalSets[0].goals[1].counter'],
        ['a counter that is never a goal', { goalSets: [{ ...SET, goals: [SET.goals[0], SET.goals[1], { counter: 'discards', amount: 10 }] }] }, 'goalSets[0].goals[2].counter'],
        ['an amount 0', { goalSets: [{ ...SET, goals: [{ counter: 'cannonLobs', amount: 0 }, SET.goals[1], SET.goals[2]] }] }, 'goalSets[0].goals[0].amount'],
        ['a fractional amount', { goalSets: [{ ...SET, goals: [{ counter: 'cannonLobs', amount: 2.5 }, SET.goals[1], SET.goals[2]] }] }, 'goalSets[0].goals[0].amount'],
        ['a goal that isn\'t an object', { goalSets: [{ ...SET, goals: [null, SET.goals[1], SET.goals[2]] }] }, 'goalSets[0].goals[0]'],
        ['a goal met: index 3', { goalsMet: [{ ...MET, index: 3 }] }, 'goalsMet[0].index'],
        ['a goal met: index -1', { goalsMet: [{ ...MET, index: -1 }] }, 'goalsMet[0].index'],
        ['a goal met: met false', { goalsMet: [{ ...MET, met: false }] }, 'goalsMet[0].met'],
        ['a goal met: met missing', { goalsMet: [{ ...MET, met: undefined }] }, 'goalsMet[0].met'],
        ['a goal met: an unknown counter', { goalsMet: [{ ...MET, counter: 'rungsReached' }] }, 'goalsMet[0].counter'],
        ['a goal met: amount negative', { goalsMet: [{ ...MET, amount: -5 }] }, 'goalsMet[0].amount'],
        ['a goal met: a negative set', { goalsMet: [{ ...MET, set: -2 }] }, 'goalsMet[0].set'],
        ['a goal met: turn missing', { goalsMet: [{ ...MET, turn: undefined }] }, 'goalsMet[0].turn'],
        ['a goal met: unixSeconds as text', { goalsMet: [{ ...MET, unixSeconds: 'now' }] }, 'goalsMet[0].unixSeconds'],
    ];
    for (const [label, lists, why] of bad) {
        const d1 = sqliteD1();
        logged.length = 0;
        const res = await post(d1, { format: 1, player: 'p', games: [GAME], ...lists });
        check(`${label} → 400, nothing written, refused for it`, res.status === 400 && d1.total() === 0 && d1.binds === 0 &&
            logged.length === 1 && logged[0] === 'telemetry batch refused: ' + why);
    }

    // The schema.
    {
        const db = new DatabaseSync(':memory:');
        const before = SCHEMA.slice(0, SCHEMA.indexOf('CREATE TABLE IF NOT EXISTS goal_sets'));
        db.exec(before);
        const tables = () => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'goal%' ORDER BY name").all().map(r => r.name).join();
        check('a database made before the goal tables has none', tables() === '');
        db.exec(SCHEMA);
        db.exec(SCHEMA);
        check('rerunning the schema adds goal_sets and goals_met, and is safe to rerun', tables() === 'goal_sets,goals_met');
        const pk = t => db.prepare(`PRAGMA table_info(${t})`).all().filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => c.name).join();
        check('their keys: (game_key, set_no) and (game_key, set_no, idx)', pk('goal_sets') === 'game_key,set_no' && pk('goals_met') === 'game_key,set_no,idx');
    }
    done();
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack)); process.exit(1); });

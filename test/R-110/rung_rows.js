// R-110 — the Worker's rung records (worker/telemetry.js, D-80): a batch's rungs checked whole and
// written to the rungs table, one row per player per counter per rung.
//
// worker/index.js against a fake D1 that is a real SQLite database (node:sqlite) with
// worker/telemetry_schema.sql applied (as R-97). Cases:
//   - a valid batch → 204, one rungs row per record (player_id, signed_in, game_key, counter, rung,
//     unix_seconds), any ACHIEVEMENT_COUNTERS key (a negative counter, rungsReached too)
//   - the same player's rung sent again (a resend, another game) is kept once, the first; another
//     player's is its own row (INSERT OR IGNORE on (player_id, counter, rung))
//   - a batch without rungs is taken as before; TELEMETRY_FORMAT stays 1
//   - MAX_RECORDS counts rung records; bad rung records → 400 and nothing written
//   - the schema makes the table keyed (player_id, counter, rung), safe to rerun, and adds it to a
//     database that lacks it
'use strict';

const path = require('path');
const { pathToFileURL } = require('url');
const { DatabaseSync } = require('node:sqlite');
const { check, done } = require('../helpers/check');
require('../helpers/cloudflare');   // worker/index.js imports 'cloudflare:workers'
const { SCHEMA, sqliteD1 } = require('../helpers/telemetry');

const ROOT = path.join(__dirname, '..', '..');
const logged = [];
for (const k of ['info', 'warn', 'error', 'debug']) console[k] = (...a) => logged.push(a.map(String).join(' '));

const GAME = { gameKey: 'g1', startedUnixSeconds: 1763700000, seed: 4242, size: 'small', version: 'abc1234', rulesVersion: 1 };
const RUNG = { gameKey: 'g1', counter: 'placed', rung: 10, unixSeconds: 1763700100 };

let worker, mod;
async function post(d1, body) {
    const waits = [];
    const res = await worker.fetch(new Request('https://ttdat.yuwakisa.com/t', { method: 'POST', body: JSON.stringify(body),
        headers: { 'Content-Type': 'text/plain' } }), { TELEMETRY: d1 }, { waitUntil: p => waits.push(p) });
    await Promise.all(waits);
    return res;
}

(async () => {
    worker = (await import(pathToFileURL(path.join(ROOT, 'worker', 'index.js')).href)).default;
    mod = await import(pathToFileURL(path.join(ROOT, 'worker', 'telemetry.js')).href);
    check('TELEMETRY_FORMAT stays 1', mod.TELEMETRY_FORMAT === 1);

    // A valid batch.
    {
        const d1 = sqliteD1();
        const res = await post(d1, { format: 1, player: 'p-one', games: [GAME], rungs: [RUNG, { ...RUNG, rung: 20, unixSeconds: 1763700200 },
            { ...RUNG, counter: 'rungsReached', rung: 1 }, { ...RUNG, counter: 'discards', rung: 10 }] });
        check('a batch with rung records → 204', res.status === 204);
        const rows = d1.rows('rungs', 'counter, rung');
        check('one rungs row per record, any achievement counter (a negative one, rungsReached)', rows.length === 4 &&
            rows.map(r => r.counter + ':' + r.rung).join() === 'discards:10,placed:10,placed:20,rungsReached:1');
        const placed = rows.find(r => r.counter === 'placed' && r.rung === 10);
        check('… its fields: player_id, signed_in, game_key, counter, rung, unix_seconds', placed.player_id === 'p-one' && placed.signed_in === 0 &&
            placed.game_key === 'g1' && placed.unix_seconds === 1763700100 &&
            JSON.stringify(Object.keys(placed).sort()) === JSON.stringify(['counter', 'game_key', 'player_id', 'rung', 'signed_in', 'unix_seconds']));
        await post(d1, { format: 1, player: 'p-one', rungs: [{ ...RUNG, gameKey: 'g2', unixSeconds: 1763799999 }] });
        const again = d1.rows('rungs', 'counter, rung');
        check('the same player\'s rung again (another game) is kept once, the first', again.length === 4 &&
            again.find(r => r.counter === 'placed' && r.rung === 10).game_key === 'g1');
        await post(d1, { format: 1, player: 'p-two', rungs: [RUNG] });
        check('another player\'s rung is its own row', d1.count('rungs') === 5 &&
            d1.rows('rungs', 'player_id').filter(r => r.counter === 'placed' && r.rung === 10).map(r => r.player_id).join() === 'p-one,p-two');
    }

    // An old batch, no rungs list.
    {
        const d1 = sqliteD1();
        const res = await post(d1, { format: 1, player: 'p', games: [GAME] });
        check('a batch without rungs → 204, its rows written', res.status === 204 && d1.count('games') === 1 && d1.total() === 1);
    }

    // Bad rung records: 400, nothing written.
    const bad = [
        ['too many records, rung records counted', { rungs: Array.from({ length: mod.MAX_RECORDS }, (_, i) => ({ ...RUNG, rung: i + 1 })) }, 'too many records'],
        ['rungs not a list', { rungs: {} }, 'rungs'],
        ['a rung that isn\'t an object', { rungs: [7] }, 'rungs[0]'],
        ['an unknown counter', { rungs: [{ ...RUNG, counter: 'teleports' }] }, 'rungs[0].counter'],
        ['rung 0', { rungs: [{ ...RUNG, rung: 0 }] }, 'rungs[0].rung'],
        ['a negative rung', { rungs: [{ ...RUNG, rung: -10 }] }, 'rungs[0].rung'],
        ['a fractional rung', { rungs: [{ ...RUNG, rung: 2.5 }] }, 'rungs[0].rung'],
        ['a rung as text', { rungs: [{ ...RUNG, rung: '10' }] }, 'rungs[0].rung'],
        ['a missing rung', { rungs: [{ ...RUNG, rung: undefined }] }, 'rungs[0].rung'],
        ['a missing gameKey', { rungs: [{ ...RUNG, gameKey: undefined }] }, 'rungs[0].gameKey'],
        ['an empty counter', { rungs: [{ ...RUNG, counter: '' }] }, 'rungs[0].counter'],
        ['unixSeconds missing', { rungs: [{ ...RUNG, unixSeconds: undefined }] }, 'rungs[0].unixSeconds'],
        ['a good rung after a bad one', { rungs: [RUNG, { ...RUNG, counter: 'nope' }] }, 'rungs[1].counter'],
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
        db.exec(SCHEMA.slice(0, SCHEMA.indexOf('CREATE TABLE IF NOT EXISTS rungs')));
        const has = () => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rungs'").all().length === 1;
        check('a database made before the rungs table has none', !has());
        db.exec(SCHEMA);
        db.exec(SCHEMA);
        check('rerunning the schema adds rungs, and is safe to rerun', has());
        const pk = db.prepare('PRAGMA table_info(rungs)').all().filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => c.name).join();
        check('its key: (player_id, counter, rung)', pk === 'player_id,counter,rung');
    }
    done();
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack)); process.exit(1); });

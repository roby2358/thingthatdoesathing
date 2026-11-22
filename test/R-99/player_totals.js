// R-99 — PlayerTotals, the Durable Object holding one player's lifetime totals (worker/player_totals.js,
// D-78), run against a fake ctx.storage.kv (synchronous get/put/list over a Map, as a SQLite-backed
// object's is). Cases:
//   - a new object has no totals: totals() → {totals: {}}
//   - add({a: 2, b: 150}) → {totals: {a: 2, b: 150}}; add({a: 3}) → a 5, b kept; totals() the same
//   - a key per counter in the key-value storage, its value the total
//   - an increment of 0 makes no key
//   - add and totals are synchronous (no await inside, so nothing interleaves an add)
//   - 25 adds made at once (Promise.all), and two concurrent adds to the same key, are all kept
//   - objects with their own storage keep their own totals
'use strict';

const path = require('path');
const { pathToFileURL } = require('url');
const { check, done } = require('../helpers/check');
const { fakeKv } = require('../helpers/cloudflare');

const ROOT = path.join(__dirname, '..', '..');

(async () => {
    const { PlayerTotals } = await import(pathToFileURL(path.join(ROOT, 'worker', 'player_totals.js')).href);
    const make = () => { const kv = fakeKv(); return { kv, obj: new PlayerTotals({ storage: { kv } }, {}) }; };

    {
        const { kv, obj } = make();
        check('a new object has no totals', JSON.stringify(obj.totals()) === '{"totals":{}}');
        const first = obj.add({ cratesDelivered: 2, cratesSunk: 150 });
        check('add → the totals after', JSON.stringify(first) === JSON.stringify({ totals: { cratesDelivered: 2, cratesSunk: 150 } }));
        const second = obj.add({ cratesDelivered: 3 });
        check('adds accumulate, other keys kept', second.totals.cratesDelivered === 5 && second.totals.cratesSunk === 150);
        check('totals() reads the same', JSON.stringify(obj.totals()) === JSON.stringify(second));
        check('a key per counter in the kv storage, its value the total',
            JSON.stringify([...kv.map]) === JSON.stringify([['cratesDelivered', 5], ['cratesSunk', 150]]));
        obj.add({ bombs: 0 });
        check('an increment of 0 makes no key', !kv.map.has('bombs') && !('bombs' in obj.totals().totals));
        check('add and totals are synchronous (no promise)', !(obj.add({}) instanceof Promise) && !(obj.totals() instanceof Promise));
    }
    {
        const { obj } = make();
        await Promise.all(Array.from({ length: 25 }, () => Promise.resolve().then(() => obj.add({ placed: 1 }))));
        check('25 adds at once are all kept', obj.totals().totals.placed === 25);
        const [a, b] = await Promise.all([Promise.resolve().then(() => obj.add({ placed: 4 })), Promise.resolve().then(() => obj.add({ placed: 6 }))]);
        check('two concurrent adds to one key are both kept', obj.totals().totals.placed === 35 && a.totals.placed + b.totals.placed === 29 + 35);
    }
    {
        const p = make(), q = make();
        p.obj.add({ trapped: 2 });
        q.obj.add({ trapped: 7 });
        check('each object keeps its own totals', p.obj.totals().totals.trapped === 2 && q.obj.totals().totals.trapped === 7);
    }
    done();
})().catch(e => { process.stdout.write('FAIL threw: ' + (e && e.stack) + '\n'); process.exit(1); });

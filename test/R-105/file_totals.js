// R-105: a file:// copy keeps its lifetime totals in localStorage[ACHIEVEMENTS_KEY] (D-79,
// 'thingfactory.totals', {counterKey: n}): written after each change, read at the next page load,
// so totals and rungs carry on; never sent anywhere. A stored value that isn't such an object
// (not JSON, an unknown key, a negative or fractional number) starts from nothing; storage that
// throws still plays, the totals kept for the page load only.
'use strict';
const { check, done } = require('../helpers/check');
const { achGame, counts, memoryStorage } = require('../helpers/achievements');

const storage = memoryStorage();
const p = achGame({ storage });
check('ACHIEVEMENTS_KEY is thingfactory.totals', p.run('GameDisplayArtifacts.ACHIEVEMENTS_KEY') === 'thingfactory.totals');
check('nothing written before anything counted', !storage.map.has('thingfactory.totals'));
p.run(`GameAchievements.counted(${JSON.stringify(counts(p, {}))}, ${JSON.stringify(counts(p, { placed: 7, trapped: 100 }))})`);
const kept = JSON.parse(storage.map.get('thingfactory.totals'));
check('after a change: the totals written, rungsReached too', kept.placed === 7 && kept.trapped === 100 && kept.rungsReached === 3);
check('no /achievements fetch from file://', p.fetcher.calls.length === 0);

const again = achGame({ storage });
check('the next page load reads them', JSON.stringify(again.ach('totals()')) === JSON.stringify(kept));
const heard = [];
again.run('GameAchievements.listen')(list => heard.push(...list));
again.run(`GameAchievements.counted(${JSON.stringify(counts(again, {}))}, ${JSON.stringify(counts(again, { placed: 3 }))})`);
check('and goes on from them: placed 7 + 3 crosses 10, written back', heard[0].counter === 'placed' && heard[0].amount === 10 &&
    JSON.parse(storage.map.get('thingfactory.totals')).placed === 10);

for (const [what, text] of [['not JSON', '{nope'], ['an unknown key', '{"placed":3,"bogus":1}'], ['a negative', '{"placed":-1}'],
    ['a fraction', '{"placed":1.5}'], ['an array', '[1,2]']]) {
    const bad = achGame({ storage: memoryStorage({ 'thingfactory.totals': text }) });
    check(`stored ${what}: starts from nothing`, bad.ach('status()') === 'on' && JSON.stringify(bad.ach('totals()')) === '{}');
}

const locked = achGame({ storage: 'throws' });
locked.run(`GameAchievements.counted(${JSON.stringify(counts(locked, {}))}, ${JSON.stringify(counts(locked, { placed: 2 }))})`);
check('storage that throws: still counted for this page load', locked.ach('totals()').placed === 2);
locked.ui.discardSlot(0);
locked.settle();
check('and play goes on', locked.ach('totals()').discards === 1);
done();

// R-96 — the recorder's goal records (telemetry.js, GameTelemetry.goalSet and command(), D-77).
//
// The recorder runs in a vm with stubbed document, location, navigator, fetch, crypto, window and
// timers (as R-69); the game is a real engine game (flatGame). Then the real page (test/helpers/
// goals.js) shows GameUI handing them over. Cases:
//   - goalSet(how, state) queues {gameKey, set, how, turn, unixSeconds, goals: [{counter, amount}]×3}
//     from state.goals and state.turn; the batch carries goalSets and goalsMet beside events
//   - a tick's goal events, handed over by command() (a wait too), each queue a goal-met record
//     {gameKey, set, index, counter, amount, turn (after the tick), unixSeconds, met: true}; no event record
//   - goal records count toward TELEMETRY_FLUSH_RECORDS and go with the timer's flush, emptied after
//   - nothing before startGame; nothing without data-version, from file:, or with GPC; nothing while
//     backing off after a 429
//   - the page: startGame queues set 0 'start'; New goals with goals unmet 'reroll'; a set all met
//     queues three goal-met records, then the done panel's New goals 'next'
//   - the Worker takes every batch the recorder sent with goal records (204, every row written)
'use strict';

const path = require('path');
const { pathToFileURL } = require('url');
const { check, done } = require('../helpers/check');
const { flatGame } = require('../helpers/load');
const { recorderPage } = require('../helpers/telemetry');
const { liveGame, setCount, waitTick } = require('../helpers/goals');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const g = flatGame();
const { state, engine } = g;
const goalsOf = s => s.goals.list.map(x => ({ counter: x.counter, amount: x.amount }));

// ---- goal sets ----
const p = recorderPage({});
p.T.goalSet('start', state);
check('before startGame: no goal record', p.T.pending() === null);
p.T.startGame({ seed: state.seed, size: 'small' });
const key = p.T.gameKey();
p.T.goalSet('start', state);
let b = p.T.pending();
const s0 = b.goalSets[0];
check('the batch carries goalSets and goalsMet lists', Array.isArray(b.goalSets) && Array.isArray(b.goalsMet) && b.goalsMet.length === 0);
check('goalSet queues the set: game key, set 0, how, turn, unixSeconds, its three goals',
    b.goalSets.length === 1 && s0.gameKey === key && s0.set === 0 && s0.how === 'start' && s0.turn === state.turn &&
    Number.isSafeInteger(s0.unixSeconds) && Math.abs(s0.unixSeconds - Date.now() / 1000) < 5 &&
    s0.goals.length === 3 && same(s0.goals, goalsOf(state)) && same(Object.keys(s0).sort(), ['gameKey', 'goals', 'how', 'set', 'turn', 'unixSeconds']));
engine.wait();
engine.newGoals();
p.T.goalSet('reroll', state);
const s1 = p.T.pending().goalSets[1];
check('a later set: its number, how and turn', s1.set === 1 && s1.how === 'reroll' && s1.turn === state.turn && s1.turn > s0.turn && same(s1.goals, goalsOf(state)));
check('goal sets are not events', p.T.pending().events.length === 0);

// ---- goals met, from a tick's goal events ----
const now = engine.counters();
const first = state.goals.list[0];
state.goals.base[first.counter] = now[first.counter] - first.amount;   // goal 0 reached: met on the next tick
const res = engine.wait();
p.T.command('wait', undefined, res, state);
b = p.T.pending();
const m = b.goalsMet[0];
check('the tick met goal 0 (engine)', res.events.some(e => e.type === 'goal' && e.index === 0));
check('a goal met by a wait: one goal-met record, no event record', b.goalsMet.length === 1 && b.events.length === 0);
check('… with game key, set, index, counter, amount, the turn after the tick, unixSeconds, met true',
    m.gameKey === key && m.set === 1 && m.index === 0 && m.counter === first.counter && m.amount === first.amount && m.turn === state.turn &&
    Number.isSafeInteger(m.unixSeconds) && m.met === true);
p.T.command('wait', undefined, { ok: false, events: [{ type: 'goal', index: 1, counter: 'x', amount: 1 }] }, state);
check('a refused command records no goal', p.T.pending().goalsMet.length === 1);

// ---- sending ----
const queued = p.T.pending();
check('the timer sends them with the batch, then the queue is empty', p.fire() === 1 && p.sent.length === 1 &&
    same(p.sent[0].goalSets, queued.goalSets) && same(p.sent[0].goalsMet, queued.goalsMet) && p.T.pending() === null);
const N = p.GameDisplayArtifacts.TELEMETRY_FLUSH_RECORDS;
for (let i = 0; i < N - 1; i++) p.T.goalSet('reroll', state);
check('goal records count toward TELEMETRY_FLUSH_RECORDS: not yet at N − 1', p.sent.length === 1);
p.T.command('wait', undefined, { ok: true, events: [{ type: 'goal', index: 2, counter: first.counter, amount: 3 }] }, state);
check('… sent at once at N', p.sent.length === 2 && p.sent[1].goalSets.length === N - 1 && p.sent[1].goalsMet.length === 1 && p.T.pending() === null);

// ---- the gates ----
for (const [label, opts] of [['without data-version', { version: null }], ['from file:', { protocol: 'file:' }], ['with Global Privacy Control', { gpc: true }]]) {
    const q = recorderPage(opts);
    q.T.startGame({ seed: 1, size: 'small' });
    q.T.goalSet('start', state);
    q.T.command('wait', undefined, res, state);
    q.fire();
    check('nothing recorded or sent ' + label, q.T.pending() === null && q.sent.length === 0);
}

(async () => {
    // ---- backing off ----
    {
        const q = recorderPage({ status: 429 });
        q.T.startGame({ seed: 1, size: 'small' });
        q.fire();
        await new Promise(r => setTimeout(r, 10));
        q.T.goalSet('start', state);
        q.T.command('wait', undefined, res, state);
        check('backing off after a 429: goal records dropped', q.sent.length === 1 && q.T.pending() === null);
    }

    // ---- through the page: GameUI hands them over ----
    const live = liveGame('small');
    const pend = () => live.run('GameTelemetry.pending()');
    const start = pend().goalSets;
    check('the page: startGame queues set 0, how start, the engine\'s goals', start.length === 1 && start[0].set === 0 && start[0].how === 'start' &&
        start[0].turn === 1 && same(start[0].goals, goalsOf(live.state)));
    live.els['goals-side-new'].fire('click');
    check('New goals with goals unmet: set 1, how reroll', pend().goalSets.at(-1).set === 1 && pend().goalSets.at(-1).how === 'reroll');
    live.state.goals.list.forEach((x, i) => setCount(live, i, x.amount));
    waitTick(live);
    const met = pend().goalsMet;
    check('a tick that meets the whole set: three goal-met records, in order', live.ui.overlay === 'goalsDone' && met.length === 3 &&
        met.map(x => x.index).join() === '0,1,2' && met.every((x, i) => x.set === 1 && x.counter === live.state.goals.list[i].counter && x.turn === live.state.turn));
    live.els['done-new-goals'].fire('click');
    check('the done panel\'s New goals after a set all met: set 2, how next', pend().goalSets.at(-1).set === 2 && pend().goalSets.at(-1).how === 'next');
    const pageBatch = pend();

    // ---- the Worker takes them ----
    const { telemetry } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'worker', 'telemetry.js')).href);
    const batches = [...p.sent, pageBatch];
    let rows = 0;
    const statuses = [];
    for (const batch of batches) {
        const writes = [];
        const env = { TELEMETRY: { prepare: sql => ({ bind: (...a) => ({ sql, a }) }), batch: async s => { rows += s.length; } } };
        const r = await telemetry(new Request('https://ttdat.yuwakisa.com/t', { method: 'POST', body: JSON.stringify(batch) }), env, { waitUntil: w => writes.push(w) });
        await Promise.all(writes);
        statuses.push(r.status);
    }
    const expected = batches.reduce((n, x) => n + x.games.length + x.events.length + x.milestones.length + x.goalSets.length + x.goalsMet.length, 0);
    check(`the Worker takes every batch with goal records (${batches.length}): 204 and every row written`, statuses.every(s => s === 204) && rows === expected);
    done();
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack)); process.exit(1); });

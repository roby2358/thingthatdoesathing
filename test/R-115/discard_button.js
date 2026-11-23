// R-115: the Discard all button (D-83), stub DOM (test/helpers/page.js), and its telemetry.
//   - no card picked: a click discards all three (one tick, discards + 3, three new cards)
//   - a card picked (build mode): it goes back, then all three are discarded in one tick
//   - a Mover carrying a Thing (carry mode): the click still scraps it (the Thing gone, one tick,
//     no discards, the other cards kept); a Bomb gone off (bomb mode): the click ends the bomb
//   - under an overlay: ignored; mid-animation: queued, and runs once when the tick ends
//   - X still discards only the picked card; a card's red × and Shift+2 only that slot
//   - one discardAll queues three ordinary 'discard' events, how 'all', one per old card's kind,
//     each accepted with its own seq and the snapshot after the one tick, a goal the tick met
//     recorded once; the Worker takes the batch (204) and writes the three event rows
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const { check, done } = require('../helpers/check');
require('../helpers/cloudflare');   // worker/index.js imports 'cloudflare:workers'
const { liveGame } = require('../helpers/goals');
const { sqliteD1 } = require('../helpers/telemetry');
const { ROOT } = require('../helpers/load');

const fs = require('fs');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const button = /<button id="discard"[^>]*title="([^"]*)"/.exec(html);
check('the button\'s title says it discards all three cards', button && /all three cards/.test(button[1]));
check('Help\'s Keys page tells the button from X', /<dt><kbd>X<\/kbd><\/dt><dd>discard the picked card/.test(html) && /<dt>Discard all<\/dt><dd>[^<]*all three cards/.test(html));

(async () => {
    const p = liveGame('small');
    const s = p.state;
    const click = () => p.els.discard.fire('click');
    const hand = () => JSON.stringify(s.hand);
    const events = () => ((p.run('GameTelemetry.pending()') || {}).events || []);

    // No card picked.
    {
        const turn = s.turn, discards = s.counts.discards, seq = p.run('GameTelemetry.eventSeq()');
        const old = s.hand.map(c => c.kind);
        // A goal the discards will meet this tick: its record must come once, not once per card.
        const goal = s.goals.list[0];
        goal.counter = 'discards'; goal.met = false;
        goal.amount = p.ui.engine.goalStates()[0].count + 3;
        const goalsMet = () => ((p.run('GameTelemetry.pending()') || {}).goalsMet || []).length;
        const queued = events().length, met = goalsMet();
        click();
        check('no card picked: one tick, discards + 3', s.turn === turn + 1 && s.counts.discards === discards + 3);
        const mine = events().slice(queued);
        check('three discard events, how \'all\', one per old card', mine.length === 3 && mine.every(e => e.command === 'discard' && e.accepted && e.args.how === 'all')
            && JSON.stringify(mine.map(e => e.args.kind)) === JSON.stringify(old));
        check('their own seqs, the same snapshot after the one tick', mine.map(e => e.seq).join() === [seq, seq + 1, seq + 2].join()
            && mine.every(e => e.turn === s.turn && JSON.stringify(e.deliveredByColor) === JSON.stringify(mine[0].deliveredByColor)));
        check('the goal the tick met is recorded once (only the first record carries the tick\'s events)', goal.met && goalsMet() === met + 1);
        p.settle();

        // The Worker takes the batch and writes the three rows.
        {
            const worker = (await import(pathToFileURL(path.join(ROOT, 'worker', 'index.js')).href)).default;
            const d1 = sqliteD1(), waits = [];
            // goalsMet dropped: the rigged goal above counts discards, which no real goal does.
            const batch = { ...p.run('GameTelemetry.pending()'), goalsMet: [] };
            const res = await worker.fetch(new Request('https://ttdat.yuwakisa.com/t', { method: 'POST', body: JSON.stringify(batch),
                headers: { 'Content-Type': 'text/plain' } }), { TELEMETRY: d1 }, { waitUntil: q => waits.push(q) });
            await Promise.all(waits);
            const rows = d1.rows('events', 'seq').filter(r => r.command === 'discard' && r.rest && JSON.parse(r.rest).args.how === 'all');
            check('the Worker answers 204 and writes the three discard rows (how \'all\' in rest)', res.status === 204 && rows.length === 3
                && rows.map(r => r.kind).join() === old.join());
        }
    }

    {
        // A card picked (build mode): back first, then all three.
        {
            s.hand[0] = { kind: 'BELT' };
            p.key('1');
            check('setup: the Belt picked, build mode', p.ui.picked && p.ui.picked.mode === 'build');
            const turn = s.turn, discards = s.counts.discards;
            click();
            check('a picked card goes back, all three discarded, one tick', !p.ui.picked && s.turn === turn + 1 && s.counts.discards === discards + 3);
            p.settle();
        }

        // Carry mode: still scraps.
        const ports = [...s.sources, ...s.targets];
        const free = [...s.hexes.values()].filter(h => h.terrain === p.run('GameArtifacts.TERRAIN.PLAINS')
            && !ports.some(o => o.q === h.q && o.r === h.r) && !s.pieces.some(o => o.q === h.q && o.r === h.r)
            && !s.things.some(o => o.q === h.q && o.r === h.r));
        const clickHex = h => { const { x, y } = p.ui.hexToScreen(h.q, h.r); p.ui.handleClick({ clientX: x, clientY: y }); };
        {
            const spot = free[0];
            s.things.push({ kind: 'WALL', color: p.run('GameArtifacts.WHITE'), q: spot.q, r: spot.r, facing: 0 });
            s.hand[0] = { kind: 'MOVER' };
            p.ui.render();
            p.key('1');
            clickHex(spot);
            check('setup: the Mover carries the Wall', p.ui.picked && p.ui.picked.mode === 'carry');
            const turn = s.turn, discards = s.counts.discards, kept = JSON.stringify([s.hand[1], s.hand[2]]);
            click();
            check('carry mode: the button scraps the Thing (one tick, no discards, other cards kept)', !p.ui.picked && s.turn === turn + 1
                && !s.things.some(t => t.q === spot.q && t.r === spot.r) && s.counts.discards === discards && JSON.stringify([s.hand[1], s.hand[2]]) === kept);
            p.settle();
        }
        // Bomb mode: ends the bomb.
        {
            const spot = free[1];
            s.things.push({ kind: 'WALL', color: p.run('GameArtifacts.WHITE'), q: spot.q, r: spot.r, facing: 0 });
            s.hand[0] = { kind: 'BOMB' };
            p.ui.render();
            p.key('1');
            clickHex(spot);
            check('setup: the Bomb has gone off', p.ui.picked && p.ui.picked.mode === 'bomb');
            const turn = s.turn, discards = s.counts.discards;
            click();
            check('bomb mode: the button ends the bomb (one tick, no discards)', !p.ui.picked && s.turn === turn + 1
                && !s.things.some(t => t.q === spot.q && t.r === spot.r) && s.counts.discards === discards);
            p.settle();
        }

        // Under an overlay: ignored.
        {
            p.ui.openHelp();
            check('setup: Help open', p.ui.overlay === 'help');
            const turn = s.turn, before = hand();
            click();
            check('under an overlay the button does nothing', s.turn === turn && hand() === before && p.ui.overlay === 'help');
            p.ui.dismissOverlay();
        }

        // Mid-animation: queued, once.
        {
            const turn = s.turn, discards = s.counts.discards;
            p.ui.primaryAction();
            check('setup: a Wait animating', p.ui.anim && s.turn === turn + 1);
            click(); click();
            check('mid-animation: held, nothing yet', s.turn === turn + 1 && s.counts.discards === discards);
            p.settle();
            check('it runs once when the tick ends: one more tick, discards + 3', s.turn === turn + 2 && s.counts.discards === discards + 3);
            p.settle();
        }

        // X, the red × and Shift+2 still discard one.
        {
            let turn = s.turn, discards = s.counts.discards;
            p.key('1'); p.key('x');
            check('X discards just the picked card', !p.ui.picked && s.turn === turn + 1 && s.counts.discards === discards + 1);
            p.settle();
            turn = s.turn; discards = s.counts.discards;
            let kept = JSON.stringify([s.hand[0], s.hand[1]]);
            p.els.cards.children[2].querySelector('.x').fire('click');
            check('a card\'s red × discards just that card', s.turn === turn + 1 && s.counts.discards === discards + 1 && JSON.stringify([s.hand[0], s.hand[1]]) === kept);
            p.settle();
            turn = s.turn; discards = s.counts.discards;
            kept = JSON.stringify([s.hand[0], s.hand[2]]);
            p.key('@', { shiftKey: true, code: 'Digit2' });
            check('Shift+2 discards just slot 2', s.turn === turn + 1 && s.counts.discards === discards + 1 && JSON.stringify([s.hand[0], s.hand[2]]) === kept);
            p.settle();
        }
        done();
    }
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack)); process.exit(1); });

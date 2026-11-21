// R-73: GameUI.saveForRedirect() (D-67). With a game in play it writes one save under SAVE_KEY:
// { version: SAVE_VERSION, savedAt: unix seconds, state: the engine's save (the Rando position
// included), ui: { zoom, scale, panX, panY, telemetryGameKey, telemetrySeq, running } }, and nothing about a
// picked card, a selection or an overlay. With no game in play (the intro, About over the intro,
// the New Game panel) it saves nothing. Storage that throws saves nothing and throws nothing.
'use strict';
const { check, done } = require('../helpers/check');
const { bootPage, memoryStorage } = require('../helpers/page');

const p = bootPage();
const KEY = p.run('GameDisplayArtifacts.SAVE_KEY'), VERSION = p.run('GameDisplayArtifacts.SAVE_VERSION');

check('the intro: nothing saved', p.ui.saveForRedirect() === false && p.storage.log.length === 0);
p.ui.showAbout();
check('About over the intro: nothing saved', p.ui.overlay === 'about' && p.ui.saveForRedirect() === false && p.storage.log.length === 0);
p.ui.closeAbout();

p.ui.startGame('small');
p.ui.dismissOverlay();
for (let i = 0; i < 6; i++) p.engine.wait();
p.ui.pick(0);   // a card in hand
p.ui.select(p.state.sources[0].q, p.state.sources[0].r);
const before = Math.floor(Date.now() / 1000);
check('a game in play saves', p.ui.saveForRedirect() === true);
const after = Math.floor(Date.now() / 1000);
const writes = p.storage.log.filter(([op]) => op === 'set');
check('one write, under SAVE_KEY only', writes.length === 1 && writes[0][1] === KEY && p.storage.map.size === 1);
const save = JSON.parse(p.storage.map.get(KEY));
check('the save has its version and the time in unix seconds', save.version === VERSION && save.savedAt >= before && save.savedAt <= after);
check('its state is the engine\'s save, the Rando position included',
    JSON.stringify(save.state) === JSON.stringify(p.engine.save()) && Number.isInteger(save.state.rng));
check('its view context is the zoom, the pan, the telemetry game key and event count, and Go',
    JSON.stringify(Object.keys(save.ui).sort()) === JSON.stringify(['panX', 'panY', 'running', 'scale', 'telemetryGameKey', 'telemetrySeq', 'zoom']) &&
    save.ui.telemetrySeq === p.run('GameTelemetry.eventSeq()') && Number.isSafeInteger(save.ui.telemetrySeq) &&
    save.ui.zoom === p.ui.zoom && save.ui.scale === p.ui.scale && save.ui.panX === p.ui.panX && save.ui.panY === p.ui.panY &&
    save.ui.telemetryGameKey === p.run('GameTelemetry.gameKey()') && save.ui.running === false);
check('no picked card, selection or overlay in it', !/picked|selected|overlay|booms|choosing/.test(JSON.stringify(save.ui)) &&
    Object.keys(save).sort().join() === 'savedAt,state,ui,version');

// The New Game panel over a game: nothing.
p.ui.unpick();
p.ui.newGame();
const n = p.storage.log.length;
check('the New Game panel: nothing saved', p.ui.overlay === 'size' && p.ui.saveForRedirect() === false && p.storage.log.length === n);

// Help or a news panel over a game still has a game in play.
p.ui.dismissOverlay();
p.ui.openHelp();
check('Help over a game: it saves', p.ui.saveForRedirect() === true);

// Storage that throws: false, and nothing thrown.
const q = bootPage({ storage: 'throws' });
q.ui.startGame('small');
let thrown = null, saved = null;
try { saved = q.ui.saveForRedirect(); } catch (e) { thrown = e; }
check('storage that throws: nothing saved, nothing thrown', !thrown && saved === false);
const full = { ...memoryStorage(), setItem: () => { throw new Error('QuotaExceededError'); } };
const r = bootPage({ storage: full });
r.ui.startGame('small');
thrown = null;
try { saved = r.ui.saveForRedirect(); } catch (e) { thrown = e; }
check('a full storage: nothing saved, nothing thrown', !thrown && saved === false);
done();

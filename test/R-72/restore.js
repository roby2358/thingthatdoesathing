// R-72: the boot rule for a save under SAVE_KEY (D-67). A return from the sign-in redirect
// (an OAuth state starting with SIGNIN_STATE_PREFIX in the URL, D-68) with a good save restores that game: no intro, no Help, the
// same board, Go off, the telemetry game key kept, the save removed. A bad, old or wrong-version
// save is removed with no message and the page boots to the intro as usual; so is any save on a
// boot that isn't a sign-in return. Storage that throws boots as usual.
'use strict';
const { check, done } = require('../helpers/check');
const { bootPage, memoryStorage } = require('../helpers/page');

// A real save, made by a page that played a little.
const first = bootPage();
const D = first.run('GameDisplayArtifacts');
const KEY = D.SAVE_KEY, RETURN = '?code=c0de&state=' + D.SIGNIN_STATE_PREFIX + 'r4nd0m';
first.ui.startGame('medium');
first.ui.dismissOverlay();   // the first-time Help
for (let i = 0; i < 12; i++) first.engine.wait();
first.ui.setZoom('2');
first.ui.setRunning(true);
check('a page with a game in play saves for the redirect', first.ui.saveForRedirect() === true && first.storage.map.has(KEY));
const goodText = first.storage.map.get(KEY);
const good = JSON.parse(goodText);
const gameKey = first.run('GameTelemetry.gameKey()');
const savedGame = JSON.stringify(first.engine.save());

// A boot that dropped its save and showed the intro, as a page with no save would.
function bootsFresh(label, text, search = RETURN) {
    const storage = memoryStorage({ [KEY]: text });
    const p = bootPage({ storage, search });
    check(label + ': the intro shows, no board', p.ui.overlay === 'intro' && !p.state.hexes && !p.els['intro-panel'].classList.set.has('hidden'));
    check(label + ': the save is removed', !storage.map.has(KEY) && storage.log.some(([op, k]) => op === 'remove' && k === KEY));
    check(label + ': no message', !p.ui.notice && (!p.els.milestone || p.els.milestone.classList.set.has('hidden') || !p.els.milestone.textContent));
    return p;
}

// The good save on a sign-in return.
{
    const storage = memoryStorage({ [KEY]: goodText });
    const p = bootPage({ storage, search: RETURN });
    check('a sign-in return with a good save: no intro, no first-time Help, no overlay', p.ui.overlay === null &&
        p.els['intro-panel'].classList.set.has('hidden') && (!p.els['help-panel'] || p.els['help-panel'].classList.set.has('hidden')));
    check('the restored game is the saved one, Rando position included', JSON.stringify(p.engine.save()) === savedGame);
    check('the save is removed', !storage.map.has(KEY));
    check('Go was running and comes back off', good.ui.running === true && p.ui.running === false);
    check('the zoom comes back', p.ui.zoom === '2' && p.ui.scale === 0.5);
    check('the telemetry game key is kept', typeof gameKey === 'string' && p.run('GameTelemetry.gameKey()') === gameKey);
    const a = first.engine.wait(), b = p.engine.wait();
    check('the restored game ticks on as the original does', JSON.stringify(a) === JSON.stringify(b) &&
        JSON.stringify(first.engine.save()) === JSON.stringify(p.engine.save()));
}

// Good save, but not a sign-in return: dropped (save-resume will keep it).
bootsFresh('a good save on an ordinary boot', goodText, '');
bootsFresh('a good save, another query string', goodText, '?signing=1');
bootsFresh('a good save, a state without the prefix', goodText, '?code=c0de&state=r4nd0m');
// Bad, old or wrong-version saves on a sign-in return.
const now = Math.floor(Date.now() / 1000);
bootsFresh('bad JSON', '{"version": 1, "sav');
bootsFresh('not an object', '42');
bootsFresh('JSON null', 'null');
bootsFresh('a wrong version', JSON.stringify({ ...good, version: D.SAVE_VERSION + 1 }));
bootsFresh('no version', JSON.stringify({ ...good, version: undefined }));
bootsFresh('older than SAVE_REDIRECT_MAX_AGE_S', JSON.stringify({ ...good, savedAt: now - D.SAVE_REDIRECT_MAX_AGE_S - 5 }));
bootsFresh('exactly SAVE_REDIRECT_MAX_AGE_S old', JSON.stringify({ ...good, savedAt: now - D.SAVE_REDIRECT_MAX_AGE_S }));
bootsFresh('saved in the future', JSON.stringify({ ...good, savedAt: now + 3600 }));
bootsFresh('no savedAt', JSON.stringify({ ...good, savedAt: 'yesterday' }));
bootsFresh('a state the engine refuses', JSON.stringify({ ...good, state: { ...good.state, size: 'galactic' } }));
bootsFresh('no state', JSON.stringify({ ...good, state: undefined }));
{
    const p = bootsFresh('a dropped save', JSON.stringify({ ...good, version: 99 }));
    p.ui.startGame('small');
    check('a dropped save: a size pick still starts a game', !!p.state.hexes && p.state.size === 'small' && p.state.turn === 1);
}

// Young enough: a save 25 minutes old still restores.
{
    const storage = memoryStorage({ [KEY]: JSON.stringify({ ...good, savedAt: now - 1500 }) });
    const p = bootPage({ storage, search: RETURN });
    check('a save under SAVE_REDIRECT_MAX_AGE_S old restores', p.ui.overlay === null && !!p.state.hexes && !storage.map.has(KEY));
}
// Bad view context: the game still restores, centered at 1x.
{
    const storage = memoryStorage({ [KEY]: JSON.stringify({ ...good, ui: { zoom: '7', scale: 'big', panX: null } }) });
    const p = bootPage({ storage, search: RETURN });
    check('a save with a bad view context still restores the game, at 1x and centered', p.ui.overlay === null && !!p.state.hexes && p.ui.zoom === '1' && p.ui.scale === 1);
}
// No save, and storage that throws: the intro, nothing written or removed.
{
    const storage = memoryStorage();
    const p = bootPage({ storage, search: RETURN });
    check('a sign-in return with no save shows the intro and touches no storage', p.ui.overlay === 'intro' && storage.log.length === 0);
    let thrown = null, q = null;
    try { q = bootPage({ storage: 'throws', search: RETURN }); } catch (e) { thrown = e; }
    check('storage that throws boots to the intro', !thrown && q.ui.overlay === 'intro');
}
done();

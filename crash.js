// crash.js — the crash screen (D-63)
//
// Loaded before every other script, so an error thrown while any later one loads or runs is
// caught too. An uncaught error or an unhandled rejection shows #crash-panel (one line that the
// game hit a bug, the error and the version/seed to copy into a bug report, Reload and Start
// fresh) instead of a frozen canvas. Shown once: later errors leave the first one on screen.
// It uses only the DOM. The game's globals (index.js's `state` and `ui`, GameDisplayArtifacts)
// are read only at crash time, inside try/catch, because the crash may come before they exist.
(function () {
    // GameDisplayArtifacts.SAVE_KEY, for a crash before displayartifacts.js has loaded.
    const SAVE_KEY_BEFORE_LOAD = 'thingfactory.run';
    let crashed = false;

    function crashText(err) {
        return err && err.message ? (err.name ? err.name + ': ' : '') + err.message : String(err);
    }
    function saveKey() {
        try { return GameDisplayArtifacts.SAVE_KEY; } catch (e) { return SAVE_KEY_BEFORE_LOAD; }
    }
    // The seed of the board on screen, or null before a board (as About) or before index.js ran.
    function boardSeed() {
        try { return state && state.hexes ? state.seed : null; } catch (e) { return null; }
    }
    function stopGo() {
        try { if (ui) ui.running = false; } catch (e) { /* index.js hasn't run */ }
    }

    function showCrash(message) {
        if (crashed) return;
        crashed = true;
        stopGo();
        const version = document.documentElement.dataset.version || 'dev';
        const seed = boardSeed();
        document.getElementById('crash-message').textContent = message;
        document.getElementById('crash-build').textContent =
            'Version ' + version + (seed === null ? '' : ' · Seed ' + seed);
        // Keys stop reaching the game behind it (capture runs before GameUI's window listeners).
        window.addEventListener('keydown', e => e.stopImmediatePropagation(), true);
        document.getElementById('crash-reload').addEventListener('click', () => window.location.reload());
        // Start fresh removes only this game's saved run, in case the save is what breaks it.
        document.getElementById('crash-fresh').addEventListener('click', () => {
            try { window.localStorage.removeItem(saveKey()); } catch (e) { /* no storage */ }
            window.location.reload();
        });
        document.getElementById('crash-panel').classList.remove('hidden');
    }

    // An opaque cross-origin error has no error object, only the event's message ("Script error.").
    window.addEventListener('error', e => showCrash(e.error ? crashText(e.error) : e.message));
    window.addEventListener('unhandledrejection', e => showCrash(crashText(e.reason)));
})();

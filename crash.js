// crash.js — the crash screen (D-63) and its crash report (D-71)
//
// Loaded before every other script, so an error thrown while any later one loads or runs is
// caught too. An uncaught error or an unhandled rejection shows #crash-panel (one line that the
// game hit a bug, the error and the version/seed to copy into a bug report, Reload and Start
// fresh) instead of a frozen canvas. Shown once: later errors leave the first one on screen.
// It uses only the DOM. The game's globals (index.js's `state` and `ui`, GameDisplayArtifacts,
// GameTelemetry) are read only at crash time, inside try/catch, because the crash may come
// before they exist.
//
// The same first error also sends one crash record to the telemetry endpoint (D-71), under the
// recorder's rules (a ship build over http(s), no Global Privacy Control), checked here so a
// crash before telemetry.js loads is still reported. If the recorder loaded, its queue goes
// first by sendBeacon, and the crash goes under its identity; else under a fresh random ID.
// A failed send is ignored, and nothing about it shows on the card.
(function () {
    // GameDisplayArtifacts.SAVE_KEY, TELEMETRY_FORMAT and TELEMETRY_ENDPOINT, for a crash before
    // displayartifacts.js has loaded.
    const SAVE_KEY_BEFORE_LOAD = 'thingfactory.run';
    const FORMAT_BEFORE_LOAD = 1;
    const ENDPOINT_BEFORE_LOAD = 'https://ttdat.yuwakisa.com/t';
    // The Worker's CRASH_MESSAGE_CHARS / CRASH_STACK_CHARS (it cuts too; cutting here keeps the beacon small).
    const MESSAGE_CHARS = 500, STACK_CHARS = 2000;
    let crashed = false;

    function crashText(err) {
        return err && err.message ? (err.name ? err.name + ': ' : '') + err.message : String(err);
    }
    function saveKey() {
        try { return GameDisplayArtifacts.SAVE_KEY; } catch (e) { return SAVE_KEY_BEFORE_LOAD; }
    }
    // The board on screen, or null before a board (as About) or before index.js ran.
    function board() {
        try { return state && state.hexes ? state : null; } catch (e) { return null; }
    }
    function boardSeed() {
        const s = board();
        return s ? s.seed : null;
    }
    function stopGo() {
        try { if (ui) ui.running = false; } catch (e) { /* index.js hasn't run */ }
    }

    // The recorder's rules (telemetry.js allowed()): a ship build over http(s), no GPC.
    function reportAllowed() {
        return !!document.documentElement.dataset.version && /^https?:$/.test(location.protocol) &&
            navigator.globalPrivacyControl !== true;
    }
    // Where the recorder posts (telemetry.js endpoint()).
    function endpoint() {
        const host = location.hostname;
        if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return location.origin + '/t';
        try { return GameDisplayArtifacts.TELEMETRY_ENDPOINT; } catch (e) { return ENDPOINT_BEFORE_LOAD; }
    }
    // telemetry.js randomId(), for a crash before it loaded or before its first game.
    function randomId() {
        if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        const b = crypto.getRandomValues(new Uint8Array(16));
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    }
    // The stack's first lines, whole lines up to STACK_CHARS (one longer line is cut), or null.
    function stackLines(err) {
        const stack = err && typeof err.stack === 'string' ? err.stack : '';
        if (!stack) return null;
        let out = '';
        for (const line of stack.split('\n')) {
            const next = out ? out + '\n' + line : line;
            if (next.length > STACK_CHARS) return out || next.slice(0, STACK_CHARS);
            out = next;
        }
        return out;
    }
    const intOrNull = v => (Number.isInteger(v) ? v : null);

    // One crash record and one beacon (D-71); every step guarded, a failure ignored.
    function reportCrash(err, message) {
        try {
            if (!reportAllowed()) return;
            let ids = null;
            try { ids = GameTelemetry.beforeCrash(); } catch (e) { /* telemetry.js didn't load */ }
            if (ids && ids.quiet) return;             // the recorder is backing off (D-70)
            let format = FORMAT_BEFORE_LOAD;
            try { format = GameDisplayArtifacts.TELEMETRY_FORMAT; } catch (e) { /* not loaded */ }
            const s = board();
            const crash = {
                format, unixSeconds: Math.floor(Date.now() / 1000),
                version: document.documentElement.dataset.version,
                gameKey: (ids && ids.gameKey) || null,
                seed: s ? intOrNull(s.seed) : null, size: s && typeof s.size === 'string' ? s.size : null,
                turn: s ? intOrNull(s.turn) : null,
                message: String(message).slice(0, MESSAGE_CHARS), stack: stackLines(err),
                userAgent: String(navigator.userAgent || '').slice(0, 512),
            };
            const batch = { format, player: (ids && ids.player) || randomId(), crashes: [crash] };
            if (ids && ids.token) batch.token = ids.token;
            navigator.sendBeacon(endpoint(), JSON.stringify(batch));
        } catch (e) { /* the report is best effort */ }
    }

    function showCrash(err, message) {
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
        reportCrash(err, message);
    }

    // An opaque cross-origin error has no error object, only the event's message ("Script error.").
    window.addEventListener('error', e => showCrash(e.error, e.error ? crashText(e.error) : e.message));
    window.addEventListener('unhandledrejection', e => showCrash(e.reason, crashText(e.reason)));
})();

// telemetry.js — GameTelemetry, the browser half of telemetry (D-65; the batch format and the
// Worker that takes it are D-64, worker/telemetry.js).
//
// GameUI hands the recorder each new game (startGame) and each command with its result
// (command); the engine knows nothing of it. Records queue here and go to the ttdat Worker's
// POST /t as one batch: every TELEMETRY_FLUSH_MS or at TELEMETRY_FLUSH_RECORDS records, by
// fetch(keepalive), and on pagehide / a hidden tab by navigator.sendBeacon. Every batch carries
// its game's record again (the Worker keeps the first), so a lost first batch loses nothing else.
//
// Nothing happens before the first startGame (the intro's size pick): no record, timer or
// listener, so a page left on the intro sends nothing. A game is recorded only from a ship build
// (<html data-version> set) served over http: or https:, and never when the browser's Global
// Privacy Control is on. A send that fails is dropped: never retried, never shown, never thrown
// into the game (try/catch around everything).
//
// Identity is per batch: `player` is a random ID for this page load, made with its first game
// (so a page with no game makes nothing) and kept only in memory; while signed in (D-68) each
// batch also carries the access token as `token`, and the Worker stamps its rows with a hash of
// the account instead. switchIdentity() sends what is queued under the old one first, so a batch
// never mixes two.
const GameTelemetry = (function () {
    const { TELEMETRY_FORMAT, TELEMETRY_ENDPOINT, TELEMETRY_FLUSH_MS, TELEMETRY_FLUSH_RECORDS } = GameDisplayArtifacts;
    const { RULES_VERSION } = GameArtifacts;
    // The commands worth a record. wait (Go is a stream of them) and rotate (free, no tick) are
    // left out; a milestone a wait reaches still gets its own record.
    const RECORDED = new Set(['place', 'remove', 'discard', 'move', 'scrap', 'bomb', 'blast']);

    let player = null;         // this page load's identity, never stored: made with its first game
    let token = null;          // the sign-in's access token while signed in (D-68), else null
    let game = null;           // the current game's record, or null: not recording
    let gameUnsent = false;    // no batch has carried this game's record yet
    let events = [];
    let milestones = [];
    let timer = null;
    let listening = false;

    // A random UUID: crypto.randomUUID where the page is a secure context, else a v4 UUID built
    // from crypto.getRandomValues (a plain http page, where randomUUID is missing).
    function randomId() {
        if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        const b = crypto.getRandomValues(new Uint8Array(16));
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    }

    const unixSeconds = () => Math.floor(Date.now() / 1000);

    // A ship build over http(s), with no Global Privacy Control; dev, file:// and GPC record nothing.
    function allowed() {
        return !!document.documentElement.dataset.version && /^https?:$/.test(location.protocol) &&
            navigator.globalPrivacyControl !== true;
    }

    // The live site's absolute URL, so the portal builds post there too; a page on localhost
    // (wrangler dev, just preview) posts to its own origin's Worker.
    function endpoint() {
        const host = location.hostname;
        return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' ? location.origin + '/t' : TELEMETRY_ENDPOINT;
    }

    // The board after a command's tick.
    function snapshot(state) {
        return {
            turn: state.turn, delivered: state.delivered, lost: state.lost, exGremlins: state.exGremlins,
            trapped: state.trapped, things: state.things.length,
            crates: state.pieces.filter(p => p.kind !== 'gremlin').length,
            deliveredByColor: Object.fromEntries(state.targets.map(t => [t.color, t.delivered])),
        };
    }

    // The batch the queue makes now, or null if there's nothing to send.
    function batch() {
        if (!game || (!gameUnsent && events.length === 0 && milestones.length === 0)) return null;
        const b = { format: TELEMETRY_FORMAT, player, games: [game], events, milestones };
        if (token) b.token = token;
        return b;
    }

    // Send the queue as one batch ('fetch', or 'beacon' as the page goes away) and empty it.
    function flush(via) {
        clearTimeout(timer);
        timer = null;
        const b = batch();
        if (!b) return;
        events = [];
        milestones = [];
        gameUnsent = false;
        try {
            const body = JSON.stringify(b);
            if (via === 'beacon') navigator.sendBeacon(endpoint(), body);
            else fetch(endpoint(), { method: 'POST', body, keepalive: true, credentials: 'omit' }).catch(() => {});
        } catch (e) { /* dropped */ }
    }

    function schedule() {
        if (timer === null && batch()) timer = setTimeout(() => guarded(() => flush('fetch')), TELEMETRY_FLUSH_MS);
    }

    function guarded(fn) {
        try { fn(); } catch (e) { /* telemetry never breaks play */ }
    }

    // The page going away (or its tab hidden) sends the rest; installed with the first game.
    function listen() {
        if (listening) return;
        listening = true;
        const hide = () => guarded(() => flush('beacon'));
        window.addEventListener('pagehide', hide);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') hide(); });
    }

    return {
        // A new game (the intro's size pick, or New Game): the last game's records go first,
        // under their own game record.
        startGame({ seed, size }) {
            guarded(() => {
                flush('fetch');
                game = null;
                if (!allowed()) return;
                game = {
                    gameKey: randomId(), startedUnixSeconds: unixSeconds(), seed, size,
                    version: document.documentElement.dataset.version, rulesVersion: RULES_VERSION,
                    userAgent: navigator.userAgent.slice(0, 512),   // the Worker's cap
                    screen: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
                };
                if (player === null) player = randomId();
                gameUnsent = true;
                listen();
                schedule();
            });
        },

        // One command GameUI committed: `args` as GameUI read them before the command, `res` the
        // engine's answer, `state` the board after it. Recorded commands get an event record
        // (accepted or not); every milestone in the tick's events gets a milestone record.
        command(command, args, res, state) {
            guarded(() => {
                if (!game) return;
                const now = unixSeconds(), snap = snapshot(state), gameKey = game.gameKey;
                if (RECORDED.has(command)) events.push({ gameKey, unixSeconds: now, command, accepted: res.ok, ...snap, args });
                if (res.ok) for (const e of res.events)
                    if (e.type === 'milestone') milestones.push({ gameKey, milestone: e.count, unixSeconds: now, ...snap });
                if (events.length + milestones.length >= TELEMETRY_FLUSH_RECORDS) flush('fetch');
                else schedule();
            });
        },

        // The current game's key, or null when nothing is being recorded: a save for the sign-in
        // redirect keeps it (D-67).
        gameKey() {
            return game ? game.gameKey : null;
        },

        // A game restored after the sign-in redirect (D-67): recorded as startGame would, but
        // under the key it had before the reload, so its records stay one game. The record goes
        // again with the next batch; the Worker keeps the first it got for that key. A save
        // with no key (nothing was recorded then) gets a fresh one, as a new game would.
        resumeGame({ seed, size, gameKey }) {
            guarded(() => {
                this.startGame({ seed, size });
                if (game && typeof gameKey === 'string' && gameKey) game.gameKey = gameKey;
            });
        },

        // Send what's queued under the current identity, then take a fresh random one (none
        // before the first game: it makes its own), and the
        // sign-in's access token (D-68), or none for a signed-out identity. The game and its
        // key carry on.
        switchIdentity(signInToken) {
            guarded(() => {
                flush('fetch');
                if (player !== null) player = randomId();   // before any game, the first game makes one
                token = typeof signInToken === 'string' && signInToken ? signInToken : null;
            });
        },

        // The batch the queue would send now (a copy), or null: for tests.
        pending() {
            const b = batch();
            return b && JSON.parse(JSON.stringify(b));
        },
    };
})();

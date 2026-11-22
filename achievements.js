// achievements.js — GameAchievements, the browser half of achievements (D-79; the server half is
// D-78, worker/achievements.js and the PlayerTotals Durable Object).
//
// An achievement is a counter's lifetime total (GameArtifacts.COUNTERS, D-74) passing a rung of
// its ladder. GameUI hands over each command's engine.counters() before and after (counted); the
// increments are the positive differences, so a new game (counters back at 0) and a restored
// save (counters carried) never count anything twice. They go into a running copy of the totals,
// and each rung a total crosses is announced to the listener GameUI gave (listen): one line per
// rung, in COUNTERS order and rising within a counter, worded from MESSAGES.rungReached (or
// MESSAGES.rungNotoriety for a negative counter) with Math.random, never Rando. Every rung
// announced adds 1 to rungsReached, which can cross a rung of its own: that loops until a pass
// crosses none.
//
// Where the totals live (configure, called by GameUI at boot, on a sign-in and on sign-out):
//   file://                   → localStorage[ACHIEVEMENTS_KEY] ({key: n}), written after each change
//   http(s), signed in        → the server: POST /achievements ({token, add?}), same base as
//                               TELEMETRY_ENDPOINT (a localhost page: its own origin)
//   anything else (signed out, portals, the dev page) → no achievements: nothing is counted
// The server copy: configure fetches the totals ({token}); increments made before they come are
// queued and announced against them when they do. Increments to send are summed and go by fetch
// (keepalive, text/plain like /t) every TELEMETRY_FLUSH_MS and on pagehide; signing out sends
// them, then stops. Syncing is the player's own service, so Global Privacy Control doesn't stop
// it, but a 429 or 403 does as telemetry's (D-70): the queue is dropped and, for
// TELEMETRY_BACKOFF_MS, nothing is counted. A 401 (the token no longer good) stops it until the
// next configure. Every failure is swallowed; nothing here throws into the game.
const GameAchievements = (function () {
    const { ACHIEVEMENTS_KEY, TELEMETRY_FLUSH_MS, TELEMETRY_BACKOFF_MS, MESSAGES } = GameDisplayArtifacts;
    const { COUNTERS, rungsCrossed, standing } = GameArtifacts;
    const KEYS = new Set(COUNTERS.map(c => c.key));

    let mode = null;          // 'local' | 'server' | null: where the totals live (null: no achievements)
    let token = null;         // the sign-in's access token in 'server' mode
    let totals = null;        // the running copy {key: n}, or null: not known (yet)
    let early = {};           // 'server': increments made before the totals came, summed
    let unsent = {};          // 'server': increments not yet sent, summed
    let fetching = false;     // a totals fetch is out
    let generation = 0;       // bumped by configure, so an answer for an older one is ignored
    let timer = null;
    let listening = false;
    let quietUntil = 0;       // Date.now() before which nothing is counted or sent (D-70)
    let listener = null;      // GameUI's: called with each change's announcements (maybe none)

    const quiet = () => Date.now() < quietUntil;
    const isEmpty = o => Object.keys(o).length === 0;
    const guarded = fn => { try { return fn(); } catch (e) { return undefined; } };

    function protocol() {
        try { return window.location.protocol || ''; } catch (e) { return ''; }
    }

    // A totals object as stored or answered: whole numbers ≥ 0 under known keys; anything else → null.
    function readTotals(o) {
        if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
        const out = {};
        for (const [k, n] of Object.entries(o)) {
            if (!KEYS.has(k) || !Number.isSafeInteger(n) || n < 0) return null;
            if (n > 0) out[k] = n;
        }
        return out;
    }

    function loadLocal() {
        try {
            const text = window.localStorage.getItem(ACHIEVEMENTS_KEY);
            return (text && readTotals(JSON.parse(text))) || {};
        } catch (e) { return {}; }
    }

    function saveLocal() {
        try { window.localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(totals)); } catch (e) { /* not kept */ }
    }

    function addTo(into, inc) {
        for (const [k, n] of Object.entries(inc)) into[k] = (into[k] || 0) + n;
    }

    // One rung's line: one of the counter's wordings at Math.random's pick, {amount} {label} filled.
    function announce(c, amount) {
        const list = c.negative ? MESSAGES.rungNotoriety : MESSAGES.rungReached;
        const line = list[Math.floor(Math.random() * list.length)]
            .replace(/\{amount\}/g, () => String(amount)).replace(/\{label\}/g, () => c.label);
        return { counter: c.key, label: c.label, amount, negative: c.negative, line };
    }

    // Add increments to the running totals: the rungs crossed, in COUNTERS order, then
    // rungsReached's own, until a pass crosses none. Returns {announced, added}: the lines and
    // every increment made, rungsReached's included.
    function apply(inc) {
        const announced = [], added = {};
        let pass = inc;
        while (!isEmpty(pass)) {
            let rungs = 0;
            for (const c of COUNTERS) {
                const n = pass[c.key];
                if (!n) continue;
                const before = totals[c.key] || 0;
                totals[c.key] = before + n;
                added[c.key] = (added[c.key] || 0) + n;
                for (const r of rungsCrossed(c.scale, before, before + n)) { announced.push(announce(c, r)); rungs++; }
            }
            pass = rungs ? { rungsReached: rungs } : {};
        }
        return { announced, added };
    }

    function tell(announced) {
        if (listener) guarded(() => listener(announced));
    }

    // The increments just made in 'local' or a known 'server' copy: applied, kept, announced.
    function record(inc) {
        const { announced, added } = apply(inc);
        if (mode === 'local') saveLocal();
        else { addTo(unsent, added); schedule(); }
        tell(announced);
    }

    // Nothing queued, nothing timed.
    function dropQueue() {
        early = {};
        unsent = {};
        clearTimeout(timer);
        timer = null;
    }

    function backOff() {
        quietUntil = Date.now() + TELEMETRY_BACKOFF_MS;
        dropQueue();
    }

    // A 401: the token is no good; no achievements until the next configure.
    function stop() {
        dropQueue();
        mode = null;
        token = null;
        totals = null;
    }

    // A 429 or 403 backs off, a 401 stops; true when the answer was one of those.
    function refused(status) {
        if (status === 429 || status === 403) { backOff(); return true; }
        if (status === 401) { stop(); return true; }
        return false;
    }

    // POST /achievements beside /t (portal builds have no sign-in, so never post).
    function post(body) {
        return fetch(GameTelemetry.workerUrl('/achievements'), { method: 'POST', body: JSON.stringify(body), keepalive: true, credentials: 'omit' });
    }

    // Ask for the totals; when they come, what was queued meanwhile is announced against them.
    // A failed fetch is asked again at the next flush.
    function fetchTotals() {
        if (fetching || quiet()) return;
        const gen = generation;
        const current = () => gen === generation;
        let sent;
        try { sent = post({ token }); } catch (e) { return; }
        fetching = true;
        sent.then(res => (!current() || refused(res.status) || res.status !== 200 ? null : res.json()))
            .then(data => { if (current()) received(data); })
            .catch(() => { if (current()) { fetching = false; schedule(); } });
    }

    // The totals fetch answered (data null when it failed).
    function received(data) {
        fetching = false;
        if (mode !== 'server') return;
        const got = data && readTotals(data.totals);
        if (!got) { schedule(); return; }
        totals = got;
        const queued = early;
        early = {};
        if (quiet() || isEmpty(queued)) tell([]);
        else record(queued);
    }

    // Send what's unsent ({token, add}), or, with the totals not known yet, ask for them again.
    function flush() {
        clearTimeout(timer);
        timer = null;
        if (mode !== 'server' || quiet()) return;
        if (totals === null) { fetchTotals(); return; }
        if (isEmpty(unsent)) return;
        const add = unsent;
        unsent = {};
        const gen = generation;
        guarded(() => post({ token, add }).then(res => { if (gen === generation) refused(res.status); }).catch(() => {}));
    }

    function schedule() {
        if (timer !== null || mode !== 'server' || quiet()) return;
        if (totals !== null && isEmpty(unsent)) return;
        timer = setTimeout(() => guarded(flush), TELEMETRY_FLUSH_MS);
    }

    function listen() {
        if (listening) return;
        listening = true;
        guarded(() => window.addEventListener('pagehide', () => guarded(flush)));
    }

    return {
        // GameUI's listener: called with the announcements ({counter, label, amount, negative,
        // line}) of each change to the totals, an empty list when they changed with no rung (the
        // server's totals arriving with nothing queued).
        listen(fn) {
            listener = fn;
        },

        // Where the totals live now: at boot with the stored sign-in's token (or null), on a
        // sign-in with its token, on sign-out with null. A server copy being left sends what it
        // has unsent first; play before a sign-in isn't added to the account.
        configure(signInToken) {
            guarded(() => {
                if (mode === 'server' && totals !== null) flush();
                generation++;
                dropQueue();
                fetching = false;
                totals = null;
                token = null;
                mode = null;
                const where = protocol();
                if (where === 'file:') {
                    mode = 'local';
                    totals = loadLocal();
                } else if (/^https?:$/.test(where) && typeof signInToken === 'string' && signInToken) {
                    mode = 'server';
                    token = signInToken;
                    listen();
                    fetchTotals();
                }
            });
        },

        // One command's counters before and after (engine.counters()): its increments are the
        // counters that rose, by how much. Nothing counted without achievements or while backing off.
        counted(before, after) {
            guarded(() => {
                if (mode === null || quiet()) return;
                const inc = {};
                for (const c of COUNTERS) {
                    const d = after[c.key] - before[c.key];
                    if (d > 0) inc[c.key] = d;
                }
                if (isEmpty(inc)) return;
                if (totals === null) { addTo(early, inc); schedule(); return; }
                record(inc);
            });
        },

        // 'on' (totals known), 'loading' (the server's not in yet) or 'off' (no achievements here).
        status() {
            return mode === null ? 'off' : totals === null ? 'loading' : 'on';
        },

        // The active achievements, counters with a total above 0, nearest its next rung first:
        // by (total − reached) / (next − reached), reached 0 below the first rung, ties in
        // COUNTERS order. Each {key, label, total, reached (null below the first), next}.
        active() {
            if (totals === null) return [];
            const rows = COUNTERS.filter(c => (totals[c.key] || 0) > 0).map(c => {
                const total = totals[c.key];
                return { key: c.key, label: c.label, total, ...standing(c.scale, total) };
            });
            const toward = a => (a.total - (a.reached || 0)) / (a.next - (a.reached || 0));
            return rows.sort((x, y) => toward(y) - toward(x));   // a stable sort: ties stay in COUNTERS order
        },

        // A copy of the running totals, or null; and what's queued to send: for tests.
        totals() {
            return totals && { ...totals };
        },
        pending() {
            return { early: { ...early }, unsent: { ...unsent } };
        },
    };
})();

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Thing Factory** ("a thing that does a thing") is a place-then-tick contraption game on a
small hex board, forked from the author's Hex & Counters base. Each command
places, removes or discards a Thing from a random hand, or waits, and then the world ticks
once (turning a placed mover is free and doesn't tick): every Thing does its one thing (most act on the piece standing on them; the Pusher
shoves the hex in front, the Puller reaches two hexes ahead). Crates come out of a source; deliver
them to the target, through endless milestones (10, 20, 50, 100, 200, 500, 1000, …). On
bigger boards each milestone opens a new crate color with its own target (`MAP_SIZES.colors`),
and every milestone unlocks the next step of cards (`UNLOCKS`; a new game deals only the first). There's
no end, time limit or defeat; the score is the turn each milestone was reached.

Design docs follow the ontology-spec format: **`ONTOLOGY.md`** is the implementation
reference (purpose/goals `G-n`, entities, invariants, rules as pseudocode, numbers,
commands/events); **`CRITERIA.md`** turns each rule into a row `R-n` that owns `test/R-n/`;
**`RATIONALE.md`** holds the why (`D-n`) and open questions (`Q-n`);
**`ARCHITECTURE_LOG.md`** is the dated history. `DYNAMICS.md` is why it's fun; `README.md`
is intent + UI. Cite stable IDs (`R-12`, `D-6`), never section numbers, and reconcile
ONTOLOGY + CRITERIA + RATIONALE + log in the same change as the code. This doc set has its
own ID namespace; the base's R-/D-numbers don't apply.

## Running / Developing

No build or install step. Scripts load as plain globals, so you can **double-click
`index.html` to run from `file://`**. Serving over HTTP also works if you prefer:
```bash
npx serve .
# or
python -m http.server 8000
```

`just ship` (`tools/ship.js`, plain Node) is the release build: it copies `index.html` and
every local script/stylesheet it names into `dist/web/`, stamps those URLs `?v=<short hash>`
(`-dirty` with uncommitted changes) and puts the same version on `<html data-version>` (unset
in dev), and zips `web/` as `dist/ttdat-<version>.zip` (index.html at the zip root) for the
portals. `dist/` is git-ignored; `test/integration/ship.js` checks the zip. `just deploy` ships
and runs `wrangler deploy --env production` (`wrangler.jsonc`: the `ttdat` Worker, its assets
`dist/web` at ttdat.yuwakisa.com and its script `worker/` answering `POST /t`, D-64, and
`POST /auth/token`, D-68; its one npm dependency, cbor-x, comes from `just worker-deps`), with
yuwakisacloud's wrangler; it refuses while `env.production`'s D1 id is the placeholder
(`--dry-run` passes). `just d1-local` gives `wrangler dev`'s local D1 its tables, `just dev-worker`
serves the ship build with the Worker on :8787, `just d1-production` creates production's
database (designer's go-ahead only); README "Deploy" has the steps, and the auth/ client rows for
the sign-in (seed SQL run in yuwakisacloud by hand, never from here).

`just telemetry-report [days]` and `just telemetry-local [days]` (`tools/telemetry_report.js` + `tools/telemetry_report/`:
`records.js` four read-only SELECTs through `$WRANGLER d1 execute --json`, rows → camelCase records;
`figures.js` pure sums over records; `render.js` the tables; `volume.js` the Volume section's figures, its d1
info call and the D1 free-plan numbers, D-72; plain Node, D-66) prints the telemetry
report: production's D1 by default (refused before wrangler runs while `wrangler.jsonc` holds
`PUT-THE-DATABASE-ID-HERE`; it refuses a `local-d1` argument and points at telemetry-local), `just telemetry-local` for wrangler dev's (it passes the tool's `local-d1`); a number limits it to games started in
that many days. Sections Games, Milestones, Commands, Bomb, Sessions (`LONG_PAUSE_SECONDS` 300),
Clients, Crashes, Players, once per rules version when there are several, then Volume once (rows
written per UTC day against `D1_FREE_ROWS_WRITTEN_PER_DAY`, the size from `wrangler d1 info --json`
against `D1_FREE_DB_BYTES`, WARNING at `WARN_SHARE`; "unknown (local)" for wrangler dev's). R-70 tests it on fixtures
and end to end with a fake wrangler over node:sqlite.

## Architecture

### What actually runs

`index.html` + game modules + shared libs + `index.css`, as **plain `<script>` globals**
(no ES modules) so it runs from `file://` on a double-click. The State/Engine half runs
headless; `GameUI`, the crash screen (`crash.js`), the telemetry recorder (`telemetry.js`) and the sign-in (`signin.js`) are the only browser-coupled code.

| Module | Global | Role |
|---|---|---|
| `artifacts.js` | `GameArtifacts` | Rules data: `MAP_SIZES`, `TERRAIN`, `THINGS` (the Thing templates: `push`, `pull`, `shove`, `splat`, `flies`, `overMountains`, `clears`, `blocks`, `traps`, `colored`, `slides`, `on`, `weight`), `TOOLS` (cards that aren't Things: the Mover and the Bomb, `picks`, `wipes`, `colored`, `weight`; D-47, D-48), `CARDS` (every card kind) and `cardOf(kind)`, `WHITE`, `UNLOCKS` (the card-unlock order, one step per milestone; the Mover's step right after the Spring's, then the Cannon's, the Rocket's, and the Bomb's last), `PIECES` (the piece templates `crate`, `bigcrate`, `gremlin`: `label`, `cargo`, `value`, `wanders`, `splats`, `wrecks`, `reemerges`, `splatsOnSlideBump`), `aims(kind)`, `COUNTERS` (the counter table, D-74: one row per counter `{key, label, scale, goal, negative, perGame}`; `COUNTER_READS` for the ones read from tally fields or derived, `STORED_COUNTERS` the rest) and the ladder `rung(scale, i)` / `rungsCrossed(scale, before, after)` / `standing(scale, total)` (1-2-5 × scale, for goals and achievements), `MOVEMENT_COST`, `RULES_VERSION` (1, on each telemetry game record: it stays 1 through development and changes only for a drastic, breaking rules change, at the designer's call, D-65), `GOALS_PER_GAME` (3) and each `MAP_SIZES` row's `goalLevels`/`goalExcludes` (D-75), and every tunable number. |
| `displayartifacts.js` | `GameDisplayArtifacts` | Client-only: `HEX_SIZE`, `COUNTER_SIZE`, `HOP_MS`, `ZOOM_DIVISORS`, `MIN_TEXT_PX`, terrain colors/names, `THING_LOOK` (name, verb line, colors, inset), `PIECE_LOOK` (hover name), `BIG_CRATE_SCALE`, `CRATE_SHADES`, `COLOR_PICKER_PX`, `HELP_CARD_PX`, `HELP_LADDER_SHOWN` and `WORLD_LOOK` (Help's Things and World pages), `MAP_SIZE_NOTES` (size-picker notes), `CAPTURE_SIZES` (D-58: `{name, w, h}` per screencap), `ABOUT` (D-59: the About panel's author, `credits` ([role, name] rows), `homeUrl`, `homeLabel`, empty `feedbackUrl`), `TOUCH_ONLY_QUERY` and `SORRY_PICTURE_PX` (the phone sorry page, D-41), `SAVE_KEY` (`'thingfactory.run'`, the saved run's localStorage key, written only by `saveForRedirect` and removed at the next boot, D-67; the crash screen's Start fresh removes it, D-63), `SAVE_VERSION` (1), `SAVE_REDIRECT_MAX_AGE_S` (1800) (D-67), `SIGNIN_STATE_PREFIX` (`'signin.'`, how every OAuth state begins: the sign-in return marker), `SIGNIN_SITES` (origin → `{issuer, clientId}`), `SIGNIN_SCOPE`, `SIGNIN_TOKEN_PATH`, `AUTH_KEY` (`'thingfactory.auth'`), `SIGNIN_FLOW_KEY` (D-68), `TELEMETRY_FORMAT` (1: the telemetry batch format, `worker/telemetry.js`'s twin, D-64), `TELEMETRY_ENDPOINT`, `TELEMETRY_FLUSH_MS` (30000) and `TELEMETRY_FLUSH_RECORDS` (50) (the recorder's, D-65), `TELEMETRY_BACKOFF_MS` (300000: after a 429 or 403 the recorder records and sends nothing this long, D-70), the source/target look (`PORT_*` and each `CRATE_SHADES` entry's derived `light`, D-42). |
| `crash.js` | (none) | The crash screen (D-63), loaded first: an IIFE that installs the window `error` / `unhandledrejection` handlers; no global. The same first error sends one crash report (D-71): under the recorder's rules (data-version set, http(s), no GPC; checked here, so a crash before telemetry.js loads is reported too) and not while the recorder backs off, it calls `GameTelemetry.beforeCrash()` if it loaded (the queue goes by sendBeacon; back come `player`, `token`, `gameKey`, `quiet`), then sendBeacons `{format, player, token?, crashes: [crash]}` to the recorder's endpoint: `format` (`TELEMETRY_FORMAT`, literal 1 before displayartifacts.js), `unixSeconds`, `version`, `gameKey`, `seed`/`size`/`turn` from index.js's `state` (else null), `message` (the card's text, cut to 500), `stack` (whole first lines, at most 2000 chars), `userAgent` (512); no recorder or no game yet: a fresh random `player`. Once only, failures ignored, nothing shown. |
| `telemetry.js` | `GameTelemetry` | The browser telemetry recorder (D-65), loaded after displayartifacts.js: `startGame({seed, size})` (from `GameUI.startGame`, never page load: a page left on the intro sends nothing) makes the game record (a fresh game key, seed, size, version, `RULES_VERSION`, user agent, screen); `command(command, args, res, state)` (from `GameUI.commit`) queues an event for place/remove/discard/move/scrap/bomb/blast (not wait or rotate) with `accepted`, the snapshot after the tick (its `deliveredByColor` 4 counts in `CRATE_COLORS` order, which the Worker stores in four `delivered_<color>` columns) and its `seq` (0, 1, 2, … per game, refused ones too; it carries on across `switchIdentity` and restarts with each game; the Worker binds it as sent, no counting in SQL, D-64), and a milestone record per `milestone` event; batches `{format, player, games: [game], events, milestones}` go by fetch(keepalive) every `TELEMETRY_FLUSH_MS` or at `TELEMETRY_FLUSH_RECORDS`, by sendBeacon on pagehide / a hidden tab, to `TELEMETRY_ENDPOINT` (a localhost page: its own origin); `switchIdentity(token?)` flushes, then takes a fresh random `player` (per page load, memory only; none before the first game) and the sign-in's token, which every later batch carries as `token` (D-68); `gameKey()`, `eventSeq()` and `resumeGame({seed, size, gameKey, eventSeq})` keep a game's key and event count across the sign-in redirect (D-67); `beforeCrash()` sends the queue by sendBeacon and returns `{player, token, gameKey, quiet}` for crash.js's report (D-71); a fetch answered 429 or 403 drops the queue and turns recording off for `TELEMETRY_BACKOFF_MS` (D-70); `pending()` for tests. Records nothing unless `<html data-version>` is set, the protocol is http(s) and Global Privacy Control is off; every failure is swallowed. |
| `piece.js` | `Piece` | A positioned token. Crates and gremlins are `Piece`s with engine-set `id` and `kind`. |
| `board.js` | `Board` | Query layer over the hex `Map` (passable = land). |
| `gamestate.js` | `GameState` | Serializable data: `sources` (`{q, r, colors}`), `targets` (`{q, r, color, delivered}`), `pieces`, `things` (`{kind, color, q, r, facing}`), `hand` (`{kind}` cards; a kind is a `THINGS` or `TOOLS` key), `unlocks` (how many `UNLOCKS` steps are open), `turn`, `delivered`, `lost`, `exGremlins`, `trapped`, `idleTicks`, `spawnCycle` (the four colors, shuffled once), `spawnSlot`, `nextId`, `phase`, `size`, `counts` (the stored per-game counters, `STORED_COUNTERS`, 0 in a new game, `GameState.zeroCounts()`; D-74), `goals` (`{set, base, list}`: the set's number, `counters()` when it was dealt, `GOALS_PER_GAME` `{counter, amount, met}`; D-75). `toJSON()` (the whole state as JSON data plus `rng`, `Rando.state()`) and `GameState.fromJSON(data)` (checks, builds or throws; never touches `Rando`), D-67. |
| `gameengine.js` | `GameEngine` | Generation + rules. `newGame(seed, size)` takes the seed from the caller (the UI rolls it) and a `MAP_SIZES` key (the player picks it). Commands `place`/`remove`/`blast`/`discard`/`wait`/`move`/`scrap`/`bomb` each run one `tick()` (`place` takes the Thing's `color`, one of `colorChoices(kind)`; `move(slot, fq, fr, q, r, facing)` and `scrap(slot, fq, fr)` spend a Mover card on the Thing at (fq, fr), D-47; `bomb(slot, hexes)` spends a Bomb on 1–5 filled hexes at once, clearing each (`clear{kind, q, r, hop}` then `splat`, hop 0), D-48; `legalPicks(kind)` is where a tool's clicks may land) and return `{ ok, events }`; `rotate` doesn't tick (`events: []`, D-19); `counters()` gives this game's count on every `perGame` `COUNTERS` row, each counted at its one rule site (`count(key, n)`; a cargo loss by cause in `loseValue`, a Thing's motion once its piece moved, never from event text or `Rando`; D-74); goals (D-75): `newGame` deals set 0 last from `Rando.stream` (a side stream keyed by seed and set, never the shared one), `goalStates()` gives `[{counter, label, count, amount, met}]` counted from the set's base, the last step of every tick meets goals (`goal{index, counter, amount}`, `goalsDone{set}` after the set's last, `goalsMet` +1), and `newGoals()` deals the next set with no tick (`{ok: true, events: [goals{set}]}`); `save()` returns `state.toJSON()` and `restore(data)` puts a saved game back (same GameState object, board rebuilt, `Rando` at its `rng`; no tick, `{ok:false}` and nothing changed on bad data, D-67); a tick that reaches a milestone emits `milestone{count}`, then `open{color, source, target}` if it opened a color (followed by `clear{kind, q, r, hop}` / `splat` for whatever stood on a new source or target, D-44, or `deliver` for a crate on its own color's new target, D-46), then `unlock{kinds}` if it unlocked cards (one each per milestone crossed, `reachMilestones`). Movement is a lockstep hop simulation (D-38): every Thing and wanderer claims its piece as the tick starts and gets a motion in a phase (`over`, `air`, `ground`, `skid`, `line`, `follow`, `drop`; `PHASES`/`ARRIVED`/`STOPPED`); `runHops()` advances every moving piece one hex per hop, together, resolving each hop's proposals at once (chains, 3+-cycles rotate, swaps fail, same-hex ties by rank, two flights meeting crash, bumps start lines mid-tick). Events: `move{id, path, hop, over}` (one hex per hop from `hop`), ends (`sink`/`deliver`/`splat`) carry `hop`; a Rocket's flight emits `splat` for gremlins it destroys. |
| `gameui.js` | `GameUI` | Canvas, HUD (top left), tally (top right: delivered, ex-gremlins, trapped, lost), the hand, input, and the tick animation, which is driven only by the events the engine returns and plays hop by hop as the engine ran it. |
| `signin.js` | `GameSignIn` | The optional "Sign in with Bluesky" (D-68), loaded after telemetry.js: a public OAuth client of yuwakisacloud's auth/ (code + PKCE). `offered()` only on `SIGNIN_SITES` origins (the live site, localhost:8787; never portals or `file://`); `current()` reads `localStorage[AUTH_KEY]` (`{token, handle, expiresAt}`; expired or unreadable → removed, signed out; no refresh token); `begin()` keeps `{state, verifier}` in sessionStorage `SIGNIN_FLOW_KEY` and `location.assign`s auth/'s `/authorize` (`SIGNIN_SCOPE`, state = `SIGNIN_STATE_PREFIX` + random, S256); `isReturn()` (the URL's state has the prefix); `finish()` takes the flow, strips the OAuth params (`history.replaceState`) and trades the code at the Worker's `SIGNIN_TOKEN_PATH`, storing the sign-in; `signOut()` removes `AUTH_KEY` (local only, no revoke at auth/, D-69). All storage in try/catch, every failure silent. |
| `worker/` | (ES module) | Server side, not shipped in `dist/web` (D-64): `index.js` is the Worker's entry (only a default export: the runtime treats named exports as entrypoints), routing `POST /t` to `telemetry.js` (with the vendored auth-client's `verifyAccessToken`, imported lazily), `POST /auth/token` to `auth.js` and 404 to the rest; `auth.js` (D-68): `exchangeCode` passes the browser's code and PKCE verifier to auth/'s `/token` through the `AUTH_SERVICE` binding with `TTDAT_CLIENT_ID` (auth/'s `/token` has no CORS) and answers `{access_token, expires_in, handle}`; `identityFor` turns a batch's `token` into `{playerId: SHA-256 hex of PLAYER_SALT + sub, signedIn: 1}` (audience `TTDAT_CLIENT_ID`, scope `PLAY_SCOPE`) or null; `vendor/auth-client/` is yuwakisacloud's auth-client, verbatim TypeScript (SOURCE.md), bundled by wrangler with cbor-x from `worker/package.json`; `telemetry.js` first refuses a request whose Origin is set and not in `TELEMETRY_ORIGINS` (the live site, https://html-classic.itch.zone, https://uploads.ungrounded.net, plus wrangler dev's `TELEMETRY_DEV_ORIGINS` var) with 403, then asks the `TELEMETRY_LIMIT` rate-limit binding (wrangler.jsonc `ratelimits`, both environments, 1000 per 10 s = `TELEMETRY_RATE_LIMIT`) keyed by `CF-Connecting-IP` and answers 429 over it, both before the body is read and writing nothing (no binding or a throwing limiter lets it through, D-70); it then checks a telemetry batch whole (`TELEMETRY_FORMAT`/`KNOWN_FORMATS`/`READERS`, `MAX_BODY_BYTES`, `MAX_RECORDS`, `KNOWN_COMMANDS`; 400 on a bad batch, 204 and dropped on an unknown format), answers 204 and writes it to D1 `TELEMETRY` in one `db.batch()` under `ctx.waitUntil`, every row stamped with the batch's identity (the sub hash and `signed_in` 1 for a valid token, else its random `player` and 0; a batch is never refused over its token); `telemetry_schema.sql` holds the four tables (`games`, `events`, `milestones`, `crashes`). The IP is read only as the limiter's key: never written to D1, logged or echoed (D-70). Bump `TELEMETRY_FORMAT` here and in `GameDisplayArtifacts` when a batch field is renamed, removed or retyped. |

Libs: `hex.js` (axial math, `NEIGHBOR_DIRS` = facing order E, NE, NW, W, SW, SE;
`Hex.clockwise` is `(f+5)%6`, plus `Hex.counterClockwise`, `Hex.opposite`, `Hex.same`), `rando.js` (seeded RNG; `Rando.state()` / `setState(a)` read and put back the stream's position, D-67; `Rando.stream(n)` an independent generator that never moves the shared stream, D-75), `colortheory.js` (gremlin colors), `sound.js`
(client-only cues; `Math.random`, never `Rando`).

### Input architecture (see `UI_CONTROLS.md`)

`UI_CONTROLS.md` is the layered controls spec for the hex-game family; `gameui.js` cites
its layers (`L1.2`, `L2.1`, `L5`). Dispatch order: `overlay` → `anim` (commands wait for the
tick animation: X / Discard, a board click with a card picked, `D` and `B` go into the
one-slot `queue` (a `TickQueue`: `defer`, `clear`, `flush`; `whileSameCard` drops a held card command if the card changed), latest wins, and fire when `finishAnim()` flushes it, re-checking their guards;
`pick`/`unpick`/`startGame` clear it, D-49) → `picked` card → bare map click.

- **L1.2 pick-then-act:** picking a card (click or `1`–`3`) computes its legal set once
  (`engine.legalPlacements(kind)`, or `legalPicks` for a tool card); clicking a hex is a lookup
  into that set. What a click, Esc/right-click and Discard do comes from `PICK_MODES[picked.mode]`
  (D-47): `build` (Thing cards), `pickup` (a tool's first click: its ghost follows the mouse over any hex, a bare hex does nothing, Esc
  returns the card), `carry` (the Mover holding the Thing it lifted, its ghost under the cursor at once with the Thing's facing, view-only until sent: a
  legal click sends `move`, Esc/right-click/Discard send `scrap`, the hand, Wait/Space and `B` are locked),
  `bomb` (the Bomb after its first boom, D-48: its bomb ghost still follows the mouse; each legal click bursts its hex at once (`bursts`, splat sound) and
  `picked.booms` draw as cleared, view-only until sent; the boom reaching `wipes`, or Esc/right-click/Discard, sends
  `bomb(slot, booms)`, whose already-shown `clear`s/`splat`s the animation skips; locked like `carry`).
  `AFTER_PICK[card]` says what a tool's pick leads to (`pick`) and its hover `hint`. `R`/wheel
  turn the ghost's facing. With no card picked, a click selects a hex (`selected`: outline, white facing arrow over a mover, holds Go); a click on the selected hex calls `rotate`, which doesn't tick, so the UI just re-renders; a click elsewhere or Esc deselects. Selecting and turning work mid-animation.
  `D` calls `remove` on the selected hex's Thing (never the hovered one; no selection does nothing; a remove clears the selection, D-39); `B` calls `blast` on the hovered crate. With a card picked, the Discard spot or `X` calls `discard`. A card's red × (`.x`) or Shift+1/2/3 (slot from `e.code`) calls `discardSlot(slot)`: `discard` on that slot without picking it, a different picked card going back first; ignored under an overlay or a locked hand, queued mid-animation like X (D-50).
- **L2.1 primary action:** Wait button → `engine.wait()`. Enter toggles Go (`toggleRun()`), like the Go button. Space is `oneTick()`: a Wait when Go is off; when Go runs it turns Go off, and the tick in flight finishes.
- **Screencap (D-58):** `P` calls `capture()`, unlisted on purpose (not in Help or README): the canvas at its size plus each `CAPTURE_SIZES`, each a fresh `paint(true)` (no ghost, legal hexes, hover or selection) offscreen with the screen's center and zoom, downloaded as `ttdat-<seed>-<turn>-<name>-<w>x<h>.png` (window, og, capsule, shot). `render()` = `paint(false)` + `updateHUD()`.
- **Mute (D-53):** the Sound button and `M` call `toggleMute()` (`GameSound.setMuted`, remembered in `localStorage` `thingfactory.muted`, try/catch); `phrase()` returns early when muted, so no AudioContext is made. Works mid-animation and with a card picked; overlays eat the key first.
- **L2.2:** Esc and right-click put the card back.
- **Boot (D-41):** `index.js` checks `matchMedia(TOUCH_ONLY_QUERY)` (coarse pointer, no
  hover) before anything else; on a phone or tablet (no fine pointer attached) it builds no state, engine or UI and calls
  `GameUI.showSorry(boot)` (a static: unhides `#sorry-panel`, body class `touch-only` hides the
  rest; "Try it anyway" runs `boot()`, which builds them then; "Copy link" shares or copies the URL). No `matchMedia` counts as a desktop, so stub DOMs boot the game.
- **Save around the sign-in redirect (D-67):** `GameUI.saveForRedirect()` (`signInFromGame()` calls it just before redirecting, D-68) writes `{version: SAVE_VERSION, savedAt, state: engine.save(), ui: {zoom, scale, panX, panY, telemetryGameKey, telemetrySeq, running}}` to `localStorage[SAVE_KEY]` (try/catch), never a picked card, selection or overlay (the caller backs them out first), and nothing from the intro, About over it, or the New Game panel. `start()` calls `restoreSaved()` after `attach()`: a save is read once and removed; only a sign-in return (the URL's OAuth `state` starting with `SIGNIN_STATE_PREFIX`, `signInReturn()` = `GameSignIn.isReturn()`) with the right version, under `SAVE_REDIRECT_MAX_AGE_S` old, a whole-number `ui.telemetrySeq` ≥ 0 and an `engine.restore` that takes it, restores (`GameTelemetry.resumeGame` with the key and count, zoom and pan back, Go off, no intro or first-time Help); anything else boots to the intro with no message.
- **Sign-in (D-68):** a "Sign in" button (title "Sign in with Bluesky (optional)") in the top-left bar (`#signin`) and on the intro (`#intro-signin`) and New Game (`#size-signin`) panels, each with a label (`#…-signin-label`) that stands in for it while signed in: "@handle", or "Signed in"; About's credits page has one line (`#about-signin`); all hidden where `GameSignIn.offered()` is false. `showSignIn()` draws them. `signInFromGame()` (the bar; ignored under an overlay or while signed in) puts a picked card back and drops the selection in the view only, `saveForRedirect()`s (refused: `REASONS.signInSave`, nothing else), turns Go off and calls `GameSignIn.begin()`; `signInFromPanel()` (intro or New Game) saves nothing. `start()` runs `restoreSaved()` and then `startSignIn()`: a stored sign-in gives telemetry its token (`switchIdentity`), and a return calls `GameSignIn.finish()` and, on success, `GameTelemetry.switchIdentity(token)` and `showSignIn`. **Sign out (D-69):** while signed in (`this.signedIn`, set by `showSignIn`) the bar shows `#signout` after the handle label; `signOut()` (ignored under an overlay or signed out; no tick, works mid-animation) calls `GameTelemetry.switchIdentity(null)` (the queue goes with the token, then a fresh random player and no token), `GameSignIn.signOut()` and `showSignIn(null)`: no confirm, no reload, the game and Go carry on.
- **Crash screen (D-63):** `crash.js`, the first script index.html loads, installs window `error` and `unhandledrejection` handlers (plain DOM, no other script needed, so a throw while a later script loads is caught too; index.js's `state`/`ui` and `SAVE_KEY` are read at crash time in try/catch, with a literal fallback key before displayartifacts.js loads): the first shows `#crash-panel` ("Thing Factory hit a bug and stopped.", the error and version/seed, selectable; Reload; Start fresh removes only `localStorage[SAVE_KEY]`, try/catch, and reloads), turns Go off and adds a capture `keydown` listener that stops keys reaching GameUI. A `crashed` flag keeps it once-only; it shows over the sorry page too. It isn't a GameUI `overlay`. The first error also sends one crash record by sendBeacon (D-71, the `crash.js` row), nothing about it on the card.
- **L5:** the intro and New Game overlays are both board-size pickers (click or `1`–`4`); they
  consume all other input, and Esc closes New Game only. A milestone that opens a color shows
  the `news` overlay, which closes on a click or any key (`OVERLAY_KEYS` dispatches keys per
  overlay). The `color` overlay is the Pusher/Puller color picker (D-32): a click on a legal hex whose card has more than one `colorChoices` opens swatches beside it; a swatch or `1`–`4` places, Esc / right-click / a click off backs out with the card still picked. The `help` overlay (D-60) is a pager, always opening on Keys (the legend's first half), then More keys (`B` onward), then Special cards (the Pusher/Puller color, Mover and Bomb lines, moved off Keys; the Bomb count is `TOOLS.BOMB.wipes`), then Things (`buildHelp`: one row per `CARDS` entry, locked or not, its tile from `cardPicture`/`drawThing` as the hand draws it, `thingName` and `thingDoes` in plain, the card's own hover text), then World (D-61: one row per `WORLD_LOOK` entry in displayartifacts.js, its `says(n)` filled from `worldNumbers()`, which reads every number from `GameArtifacts`, and its `picture` spots drawn by `worldPicture` with the board's `drawTerrain`/`drawThing`/`PIECE_DRAW` on a `HELP_CARD_PX` canvas; Milestones has none, just a blank slot): shown once after the intro's size pick, and by
  the Help button; it holds Go while open. Help and About share one `Pager` (`helpPager`, `aboutPager`; `HELP_PAGES`, `ABOUT_PAGES`): `<` `>` or ←/→ turn pages, clamped, "n / N" counter; a click on a link, button or `.selectable` (`PAGER_STAYS`) keeps it open, any other click or key closes it. The `about` overlay (D-59; the About button, or the intro's About link, which it goes back to) has two pages, credits (author, yuwakisa.com, AI disclosure, tools, version from `<html data-version>` or "dev", and the seed, both selectable) then privacy (what `telemetry.js` sends, the per-load random ID, Global Privacy Control turns it off; plain index.html text, keep it true to D-65), on its `Pager`; it holds Go. External links go through `externalLink()` (`target="_blank" rel="noopener"`). The milestone
  banner (which also names the cards that milestone unlocked) is not an overlay; it never blocks input.
- **Map scale (D-40):** the `1` `2` `∞` buttons (`#zoom`, built from `ZOOM_DIVISORS`) set `scale`; `render()` draws in world px under one `setTransform(scale, …, panX, panY)`, `hexToScreen`/`screenToHex` apply the same scale, and on-map text below `MIN_TEXT_PX` is skipped (`readable`). `1`/`2` keep the canvas center fixed; `∞` fits the board once (capped at 1x) between the window top and the hand's top, or across, whichever is tighter, and centers it there; `clampPan()` keeps the canvas center on the board. No keys or wheel; resizes don't change the scale; `startGame` resets to 1x.
- **Go/Pause** (`running`): after each animation, `wait()` again `RUN_GAP_MS` later; holds
  while a card is picked or a hex is selected (both work mid-animation).
- Every command goes through `commit(fn, cue, {command, args})`, which snapshots piece positions, calls the engine, hands the command and its result to `GameTelemetry.command` (D-65),
  and animates from `res.events` by hop (`move` paths from their start `hop`, then `sink`/`deliver`/`splat` fades and `clear` bursts from their `hop`; `spawn` appears
  at the end).

### Coordinate system

Axial `(q, r)`, pointy-top hexes, stored in a `Map<string, hex>` keyed by `"q,r"` via
`hexKey()`. The grid is laid out as a rectangle of `cols × rows` (a `MAP_SIZES` row) with a per-row
`qOffset = -floor(row/2)`, so each hex also carries its `col`/`row`. Player/target placement
sorts by `col` for true left/right ends. Pan is a screen-space `(panX, panY)` offset applied
in `hexToScreen` / `screenToHex`.

### Hex object shape (as built in `gameengine.js`)

```javascript
{ q, r, col, row, elevation, isEdge, terrain }
```
`elevation` is generation-only. Forks add their own per-hex fields when a rule needs them.

## Game Model (see ONTOLOGY.md / DYNAMICS.md)

- **Map:** 16×10, 20×20, 30×30 or 60×60 (`MAP_SIZES`, picked at New Game), edges water; terrain water / plains / mountain by elevation, ice carved
  from plains. Sources on the left slice, targets on the right, land path guaranteed
  (fallback: the size's `knownGoodSeed`).
- **Things:** Belt pushes the piece on its own hex; the Spring and Rocket throw it 3 and 8 hexes (airborne: over inland water; a Spring also clears up to 2 mountains (`overMountains`) and can't land on one; a Wall stops every flight, D-73; every landing skids on if it comes down on ice, short ones too, except a Rocket's that splatted a gremlin, D-37), the Rocket splatting gremlins; the Cannon lobs it over the next 4 hexes, whatever is on them (`clears`), into the 5th as a ground step (blocked: down on the 4th if it can land there, else no fire); a Trap kills a gremlin that comes onto it; the Pusher pushes the piece on the hex in front on; the Puller pulls the piece
  two hexes ahead back into the hex between (both are drawn plain and get a crate color the player picks at placement, `place(slot, q, r, facing, color)` checked against `colorChoices(kind)`; they move only that color's crates, and gremlins; they're rare draws, D-32); a gremlin coming onto a target dies; Wall blocks; Bridge is a Belt built on water (it carries the piece on it 1 hex); Slide is buildable ice, on plains or water, never bare ice (`slides`). The Mover (a `TOOLS` card, rare like the Pusher/Puller, D-47) picks up a placed Thing and puts it down elsewhere, same kind and color, or scraps it; one tick either way. The Bomb (a `TOOLS` card, rare, last in `UNLOCKS`, D-48) clears up to 5 hexes holding a Thing or a piece (a crate is lost, a gremlin an ex-gremlin; sources and targets stay), one tick for the lot. One Thing per hex (placing on one replaces it), none on a target; movers may be built
  under a piece.
- **Tick:** claims as the tick starts, Pushers and Pullers first, then the other Things, each in placement order (each piece gets one motion; that order is also the rank for same-hex ties), unclaimed gremlins
  wander (direction picked at hop 1); then every motion runs in lockstep, one hex per hop (D-38); a blocked piece stops for the tick; every tick takes the next slot of `spawnCycle` (all four colors, shuffled once per game, D-43): if that color is open, the board holds fewer crates than `crateCap(size)` (`MAP_SIZES.crates`: small 2, medium 3, large 4, huge 5) plus one per milestone reached (D-31), and its source is clear, a crate spawns there; otherwise the slot is skipped, a big crate worth 10 with `bigCrateChance(milestones)` (1% at the start, 5% at the fifth milestone, then easing toward 1; D-34, D-45); each milestone may open a color (`openColor`) and unlocks the next card step (`unlock`); last, the goal check meets any goal whose count since its set was dealt reached its amount (`goal`, `goalsDone`; D-75).
- **Step:** blocked by off-map / mountain (a Spring's flight passes over) / Wall / a piece that stays this hop (a piece with no motion standing on slick ground is bumped instead, by any mover or flight: from that hop the line
  from it advances 2, the bumper follows from the next to right behind it, each piece once per tick, D-33; a sliding gremlin that bumps splats there instead of following, and a gremlin it bumps splats with it, `splatsOnSlideBump`, D-54); two airborne pieces entering one hex (or swapping) both crash; a gremlin on a Trap dies; open water sinks; slick ground (bare ice or a Slide, `isSlick`) slides
  free, up to `MAX_SLIDE` (3) slick-to-slick moves per motion, a landing's skid included, then stops: at most 4 slick hexes in a row (D-52); a crate on its color's target is delivered (other colors' targets block it on the ground).
- **Goals (D-75):** `GOALS_PER_GAME` (3) goals at a time, each a rung of a `COUNTERS` goal counter at a level from the size's `goalLevels`, none of its `goalExcludes`, dealt from `Rando.stream` (seed and set mixed), never the shared stream; `newGoals()` deals the next set, counted from then, with no tick. The UI doesn't show them yet.
- **Tuning harness:** `just cc-sim 200 small`, which runs `node test/sim.js 200 small 1` (greedy builder bot; lays belts and
  springs, throws every other card away with `discard`; before the first milestone only Belts,
  Bridges, Walls and Traps are dealt, D-30); `just cc-sim-to 100 small 5` plays on to the fifth
  milestone and reports turns per milestone and big crates spawned (D-34, D-45).

## Conventions

- The game is pure client-side — plain `<script>` globals (no ES modules), no Node/npm, no build step,
  no bundler. `worker/` is the only server code: plain-JS ES modules, bundled by wrangler with the
  vendored TypeScript auth-client and `worker/package.json`'s one exact-pinned dependency (cbor-x,
  `npm ci --ignore-scripts`); the Node tests import the plain-JS modules and stub the verifier. Most modules wrap their definition in an IIFE assigning one global to keep
  top-level names from colliding across scripts; the single-class value libs (`Hex`,
  `Piece`) declare the class at top level instead.
- Tests: `just cc-test`, which runs `node test/run.js` (`-v` for every check). The recipes are
  described in the project-local `thingfactory-tools` skill. DOM-free: `test/helpers/load.js` boots
  the engine/state/board/piece stack in a vm (no canvas, no display artifacts); `test/helpers/page.js` (`bootPage({storage, search})`) boots the whole page on a bare stub DOM for boot and storage rows (R-72, R-73). Each
  `CRITERIA.md` R-row owns `test/R-n/` (one rule per test); `flatGame()` in the helpers gives
  a controlled all-plains board for rule tests; `test/integration/smoke.js` plays random legal
  commands checking invariants; `test/integration/uiboot.js` boots the real UI on a stub DOM
  and plays to the first milestone by simulated clicks, then drives Go/Pause; `test/coverage.js` fails if CRITERIA and the `R-n` dirs disagree.
- Every engine command returns `{ ok, ... }`; `ok:false` means illegal and nothing changed
  (`Rando` included). `ok:true` carries the tick's `events`.
- `GameArtifacts.RULES_VERSION` names the rules a telemetry game ran under (D-65): it stays 1 through development, rule changes included (the commit hash in `version` tells builds apart); it changes only for a drastic, breaking rules change, and only when the designer says so.
- Color values are 0–1 floats except when converting to `#rrggbb` strings for canvas.
- Terrain types come from `GameArtifacts.TERRAIN`; movement from `GameArtifacts.MOVEMENT_COST`.
  Colors/labels/geometry come from `GameDisplayArtifacts` (client-only — the engine never reads it).

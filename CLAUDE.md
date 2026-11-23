# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
It orients; the detail lives in the docs and the code it points to.

## Project Overview

**Thing Factory** ("a thing that does a thing") is a place-then-tick contraption game on a small hex
board, forked from the author's Hex & Counters base. Each command places, removes or discards a Thing
from a random hand, or waits, and then the world ticks once (turning a placed mover is free). Every Thing
does its one thing to a piece; crates come out of sources and are delivered to targets through endless
milestones (10, 20, 50, 100, …), each opening a crate color on bigger boards and unlocking the next step
of cards. No end, time limit or defeat; the score is the turn each milestone was reached. Goals and
lifetime achievements ride on per-game counters.

## Design docs

Ontology-spec format, with its own ID namespace (the base's R-/D-numbers don't apply):

- **`ONTOLOGY.md`**: the implementation reference: purpose/goals `G-n`, entities, invariants, rules
  as pseudocode, Numbers, commands/queries/events, the GameUI view state, telemetry, sign-in, achievements.
- **`CRITERIA.md`**: each rule as a row `R-n` that owns `test/R-n/`.
- **`RATIONALE.md`**: the why (`D-n`) and open questions (`Q-n`).
- **`ARCHITECTURE_LOG.md`**: the dated history.
- `DYNAMICS.md` is why it's fun; `README.md` is intent, UI and deploy steps; `UI_CONTROLS.md` is the
  layered controls spec for the hex-game family (`gameui.js` cites its layers, `L1.2`, `L2.1`, `L5`).

Cite stable IDs (`R-12`, `D-6`), never section numbers, and reconcile ONTOLOGY + CRITERIA + RATIONALE
+ log in the same change as the code.

## Running / Developing

No build or install step: `just play` (or double-click `index.html`) runs it from `file://`; `npx serve .` or
`python -m http.server 8000` serve it. Recipes (`justfile`; wrangler is yuwakisacloud's pinned install, so that repo sits
next to this one):

- `just cc-test [-v]`: the whole suite (`node test/run.js`). See the `thingfactory-tools` skill.
- `just cc-sim N SIZE` / `just cc-sim-to N SIZE M`: the greedy builder-bot tuning harness
  (`test/sim.js`), to the first or the Mth milestone (D-30, D-34, D-45).
- `just ship`: release build (`tools/ship.js`): `dist/web/` with URLs stamped `?v=<hash>`
  (`-dirty` if uncommitted) and `<html data-version>` set, plus `dist/ttdat-<version>.zip` for the
  portals; `dist/` is git-ignored, `test/integration/ship.js` checks the zip.
- `just preview` (:8794) / `just dev-worker` (:8787): the ship build under `wrangler dev`, the latter
  with the Worker and local D1 (run `just d1-local` first; `just local-d1-clear` empties it).
- `just worker-deps`: `npm ci --ignore-scripts` in `worker/` (cbor-x, exact-pinned).
- `just telemetry-report [days]` / `just telemetry-local [days]`: the read-only telemetry report from
  production's or wrangler dev's D1 (`tools/telemetry_report.js` + `tools/telemetry_report/`, D-66,
  D-72, D-77, D-80; ONTOLOGY's Telemetry report; R-70).
- `just d1-production`: creates production's database and its tables (**designer's go-ahead only**).
- `just deploy`: ships, then `wrangler deploy --env production` (`wrangler.jsonc`: the `ttdat` Worker,
  assets `dist/web` at ttdat.yuwakisa.com, `worker/` answering `POST /t`, `/auth/token`,
  `/achievements`, the `PLAYER_TOTALS` Durable Object). Refused while `env.production`'s D1 id is the
  placeholder (`--dry-run` passes).

Deploy order and steps are in README "Deploy". The designer's go comes first for `just d1-production`,
for new D1 tables in production (rerun the schema before deploying a Worker that writes them) and for the
first deploy carrying a Durable Object migration (D-78); the auth/ client seed SQL is run in
yuwakisacloud by hand, never from here.

## Architecture

`index.html` + game modules + shared libs + `index.css`, as **plain `<script>` globals** (no ES
modules) so it runs from `file://`. `crash.js` loads first. The State/Engine half runs headless; only
GameUI, crash.js, telemetry.js, signin.js and achievements.js touch the browser. Field lists, constants and
behaviour are in ONTOLOGY (Entities, Rules, Numbers; Commands, queries, and events; Telemetry; Sign-in;
Achievements server and client) and the code.

| Module | Global | Role |
|---|---|---|
| `artifacts.js` | `GameArtifacts` | Rules data: `MAP_SIZES`, `TERRAIN`, `THINGS`, `TOOLS`, `CARDS`, `UNLOCKS`, `PIECES`, `COUNTERS` and the 1-2-5 rung ladder, `RULES_VERSION`, every tunable number (D-47, D-48, D-65, D-74, D-75). |
| `displayartifacts.js` | `GameDisplayArtifacts` | Client-only look, text and client numbers: sizes, colors, `THING_LOOK`, crate shades and shapes, `MESSAGES`, Help/About content, storage keys, sign-in and telemetry constants (D-42, D-58, D-59, D-61, D-67, D-68, D-76, D-79, D-82, D-84). |
| `index.js` | (none) | Bootstrap: wires the modules and starts the game, or the phone sorry page (D-9, D-41). |
| `crash.js` | (none) | Crash screen and one crash report by sendBeacon on the first error (D-63, D-71). |
| `telemetry.js` | `GameTelemetry` | Browser telemetry recorder: game, event, milestone, goal and rung records batched to `POST /t`; only with `data-version` set, http(s), no Global Privacy Control (D-64, D-65, D-67, D-70, D-71, D-77, D-80). |
| `piece.js` | `Piece` | A positioned token; crates and gremlins, with engine-set `id`/`kind`. |
| `board.js` | `Board` | Query layer over the hex `Map` (passable = land). |
| `gamestate.js` | `GameState` | Serializable world data; `toJSON()` / `fromJSON()` (D-67, D-74, D-75). |
| `gameengine.js` | `GameEngine` | Generation and rules: commands each run one `tick()` (`rotate` doesn't), lockstep hop motion, counters, goals, save/restore; returns `{ok, events}` (D-19, D-38, D-47, D-48, D-67, D-74, D-75, D-81, D-83). |
| `gameui.js` | `GameUI` | Canvas, HUD, tally, hand, goals panel, banners, overlays, input, and the tick animation driven only by engine events (D-40, D-41, D-47, D-49, D-53, D-60, D-76, D-79, D-82, D-84). |
| `signin.js` | `GameSignIn` | Optional "Sign in with Bluesky", a public OAuth (PKCE) client of yuwakisacloud's auth/ (D-68, D-69). |
| `achievements.js` | `GameAchievements` | Lifetime counter totals in localStorage (`file:`) or on the server (signed in), rung announcements (D-78, D-79). |
| `worker/` | (ES modules) | Server side, not shipped in `dist/web`: `index.js` routes `POST /t` → `telemetry.js` (D1, D-64, D-70, D-77, D-80), `POST /auth/token` → `auth.js` (D-68), `POST /achievements` → `achievements.js` + `player_totals.js` (Durable Object, D-78); `vendor/auth-client/` verbatim from yuwakisacloud; `telemetry_schema.sql`. Bump `TELEMETRY_FORMAT` here and in `GameDisplayArtifacts` when a batch field is renamed, removed or retyped. |

Libs: `hex.js` (axial math; `NEIGHBOR_DIRS` = facing order E, NE, NW, W, SW, SE; `Hex.clockwise` is
`(f+5)%6`), `rando.js` (seeded RNG; `state()`/`setState()` D-67, `stream(n)` and `mix(seed, salt)`
side streams that never move the shared one, D-75, D-84), `colortheory.js` (gremlin colors), `sound.js`
(client-only cues; `Math.random`, never `Rando`).

### Input

Dispatch order: `overlay` → `anim` (commands arriving mid-animation go into the one-slot `queue`, a
`TickQueue`, latest wins, flushed by `finishAnim()`, D-49) → `picked` card → bare map click (select a
hex; a click on the selected hex rotates). Picking a card computes its legal set once; its behaviour comes
from `PICK_MODES` (`build`, `pickup`, `carry`, `bomb`; D-47, D-48). Every command goes through
`commit(fn, cue, {command, args})`, which calls the engine, tells telemetry and achievements, and animates
from `res.events`. Keys, overlays, pagers, Go/Pause, zoom, mute, screencap, sign-in and boot: ONTOLOGY's
GameUI view state, Client contract, Goals on screen and Save around the sign-in redirect, README "UI",
`UI_CONTROLS.md`, and RATIONALE (D-40, D-41, D-50, D-53, D-58, D-63, D-67, D-68, D-69, D-82, D-83).

### Coordinate system

Axial `(q, r)`, pointy-top hexes, in a `Map<string, hex>` keyed `"q,r"` by `hexKey()`. The grid is a
`cols × rows` rectangle (a `MAP_SIZES` row) with per-row `qOffset = -floor(row/2)`, so each hex also
carries `col`/`row`; placement sorts by `col` for true left/right ends. Pan is a screen-space
`(panX, panY)` offset, with `scale`, applied in `hexToScreen` / `screenToHex`.

Hex object (built in `gameengine.js`): `{ q, r, col, row, elevation, isEdge, terrain }`; `elevation`
is generation-only. Forks add their own per-hex fields when a rule needs them.

## Game Model

See ONTOLOGY (Entities, Rules, Agents, Numbers) and DYNAMICS.md.

- **Board:** four sizes, 16×10 to 60×60, edges water; plains, mountain, ice, water; sources left,
  targets right, a land path guaranteed; a new color's source/target clears what stood there (D-44, D-46).
- **Things and tools:** Belt, Bridge, Spring, Rocket, Cannon, Pusher, Puller (player-picked color, D-32),
  Wall (stops every flight, D-73), Trap, Slide; the Mover and Bomb cards (D-47, D-48). One Thing per hex,
  none on a target; `D` removes the selected hex's Thing (D-39).
- **Tick:** gremlin lunges (D-81), then claims, then every motion in lockstep, one hex per hop (D-38;
  landings skid on ice D-37, slick bumps D-33, D-54, slide cap D-52); spawn from the shuffled color cycle
  under the crate cap (D-43, D-31), milestones (open a color, unlock cards), and last the goal check.
- **Goals and achievements:** three goals at a time, each a rung of a counter (D-74, D-75, D-76);
  lifetime totals and their rungs are achievements (D-78, D-79).

## Conventions

- The game is pure client-side: plain `<script>` globals, no ES modules, no Node/npm, no build step, no
  bundler. Most modules wrap themselves in an IIFE assigning one global; the single-class libs (`Hex`,
  `Piece`) declare the class at top level.
- `worker/` is the only server code: plain-JS ES modules bundled by wrangler with the vendored TypeScript
  auth-client and `worker/package.json`'s one dependency.
- The designer's standing rule: don't update wrangler (it is yuwakisacloud's pinned install); npm only
  with exact pins and `--ignore-scripts` (`just worker-deps`).
- Tests: `just cc-test`. Each `CRITERIA.md` row `R-n` owns `test/R-n/` (one rule per test);
  `test/coverage.js` fails if CRITERIA and the dirs disagree. DOM-free helpers in `test/helpers/`:
  `load.js` (engine stack in a vm), `flatGame()` (an all-plains board), `page.js` `bootPage()` (the
  whole page on a stub DOM, fake clock), `goals.js`, `telemetry.js` (`recorderPage`, `sqliteD1`),
  `cloudflare.js` (stubs `cloudflare:workers`; required before importing `worker/index.js`; `fakeKv()`).
  `test/integration/` holds smoke (random legal play), uiboot (the real UI by simulated clicks) and ship.
- Every engine command returns `{ ok, ... }`: `ok:false` means illegal and nothing changed (`Rando`
  included); `ok:true` carries the tick's `events`.
- `GameArtifacts.RULES_VERSION` stays 1 through development, rule changes included; it changes only for a
  drastic, breaking rules change, and only when the designer says so (D-65).
- Color values are 0–1 floats except when converted to `#rrggbb` strings for canvas.
- Terrain from `GameArtifacts.TERRAIN`, movement from `MOVEMENT_COST`. Colors, labels and geometry come
  from `GameDisplayArtifacts`, which is client-only: the engine never reads it.

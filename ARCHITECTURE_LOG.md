# Thing Factory — Architecture Log

Dated entries, newest first. This is the only doc that records what something used to be.

### 2026-11-23 — CLAUDE.md slimmed to an orientation page
The designer's call (pjpd slimclaude-thps): CLAUDE.md (45.6 KB, loaded into every session and agent) had grown a module table and input section that paraphrased the code. It now keeps the overview, the doc-set rules, one line per `just` recipe, one short line per module with its governing D-IDs, a short input paragraph (dispatch order and pick modes), a few Game Model lines and the Conventions, and points to ONTOLOGY, README, UI_CONTROLS and RATIONALE for the detail. Every removed fact was checked to live in those docs or the code; the one that lived only there moved to ONTOLOGY (the `queue` row's `whileSameCard` drop), and ONTOLOGY's `'help'` overlay row now lists Help's six pages as the pager row and `HELP_PAGES` do. Conventions states the designer's standing rule (don't update wrangler; npm only with exact pins and `--ignore-scripts`). No code change.

### 2026-11-23 — The bag crate's outline is heavier (D-84)
New `GameDisplayArtifacts.BAG_OUTLINE_WIDTH` (2), the designer's call (pjpd bagoutline-gy9p: the bag was "a little hard to see"): `drawBag` strokes the sack's outer silhouette at the plain outline width (1, set in `drawCrate`) × `BAG_OUTLINE_WIDTH` × the crate's draw scale, which `drawCrate` now passes in its geometry (`g.scale`), so a big crate's is `BIG_CRATE_SCALE` times thicker. Before, the bag's outline was 1px like every shape's. The cord, folds and tuft keep their widths; the cube, cylinder and strapped cube are unchanged. Display only: `RULES_VERSION` stays 1. R-116 checks the bag's outline stroke against the cube's for a crate and a big crate; RATIONALE D-84 and CLAUDE.md follow.

### 2026-11-23 — A new color usually gets its own source (D-21)
`ENHANCE_CHANCE` 0.5 → 0.16, the designer's call (pjpd enhance16-c9py): a newly opened crate color comes out of an existing source 16% of the time, otherwise out of a new source of its own. Before, it was half and half. `openColor` is unchanged (the same draw, the same fallbacks); `RULES_VERSION` stays 1. Seeded play shifts after the first opened color; the sims reach the fifth milestone more often (D-21's figures). R-38 adds the value and a 400-seed check that about 16% (11–21%) of opened colors share a source (it replaces the old 40-seed both-outcomes check, which that range covers); RATIONALE D-21 (status line, Why, a dated note with the call and the sim figures) and D-61's Milestones call ("usually its own source") follow; ONTOLOGY's Numbers row, CRITERIA R-38, README, DYNAMICS and Help's World line for Milestones ("sometimes its own source" → "usually its own source") follow.

### 2026-11-23 — Crate shapes shuffled per game (D-84 amended)
`GameDisplayArtifacts.CRATE_SHAPES` is now the list of the four shape keys (`'cube'`, `'cylinder'`, `'strapped'`, `'bag'`); the old fixed map is `CRATE_SHAPES_DEFAULT`, used only with no game; new `CRATE_SHAPE_SALT`. New `GameUI.crateShapesFor(seed)` (static, wrapping a module function) shuffles the shapes over `CRATE_COLORS` with `Rando.stream` from `Rando.mix(seed, CRATE_SHAPE_SALT)` (the shared stream untouched; new `Rando.mix`, the murmur3 finalizer the engine's `goalSeed` had inline, now shared by both, goal deals unchanged), and the view field `GameUI.crateShapes`, set by `startGame` and `restoreSaved` through the new `dealCrateShapes`, which also redraws Help's World page (its fill split out of `buildHelp` as `buildWorld`; before, the World pictures were drawn once at attach and would have kept the default pairing all game); `drawCrate` dispatches on `this.crateShapes[color]` instead of `CRATE_SHAPES[color]`. Before, red was always the cube, green the cylinder, blue strapped, yellow the bag; now that holds only with no game. Display only: no engine, state, save or telemetry change; `RULES_VERSION` stays 1. R-116 reads the game's pairing and checks the default; new R-117 (the pairing); U-46 reworded; ONTOLOGY (Piece look, `color` row, GameUI `crateShapes`), README, CLAUDE.md follow.

### 2026-11-23 — Each crate color has its own shape (D-84)
New: `GameDisplayArtifacts.CRATE_SHAPES` (red `'cube'`, green `'cylinder'`, blue `'strapped'`, yellow `'bag'`) and `CRATE_TRIM` (outline, strap, buckle, cord and line colors); in gameui.js the `CRATE_DRAW` table and the drawers `drawCube`, `drawCylinder`, `drawStrapped`, `drawBag` (with helpers `crateFace`, `cubeCorners`). `drawCrate` now takes the crate's color, not its shades, and dispatches on its shape; `PIECE_DRAW` passes `p.color`. Before, every crate was the shaded isometric cube in its color (now red's shape only). Big crates draw their color's shape at `BIG_CRATE_SCALE`, no other marking, as before. Sources, targets and the color swatches are unchanged. Client only: no engine, state, save or telemetry change; `RULES_VERSION` stays 1. New R-116 (recording canvas) and the manual U-46; U-26's wording names the shape; ONTOLOGY (Piece: `color` and `label` rows, a Look paragraph), README (UI), CLAUDE.md follow.

### 2026-11-23 — The Discard button discards the whole hand (D-83)
New: `GameEngine.discardAll()` (every hand slot redrawn in slot order, discards + 3, one tick) and `GameUI.discardButton()` / `discardAll()`; `commit` takes an array of telemetry records (each handed the result, only the first the tick's events). The `#discard` button now calls `discardButton`: with no card in play or one in `build`/`pickup`, the card goes back and the whole hand is discarded in one tick; in `carry`/`bomb` it still scraps / ends the bomb. Before, it discarded only the picked card (as X does), did nothing with no card picked, and was lit (`armed`) only with a card picked; now it reads "Discard all" (no X key cap), is always lit (the `armed` class is gone from gameui.js and index.css), and its title and Help's Keys page tell it from X. X, a card's × and Shift+1/2/3 are unchanged. Telemetry: three ordinary `discard` events, `how: 'all'`; no new command, `KNOWN_COMMANDS` and `TELEMETRY_FORMAT` unchanged; the report's Discard-by-how caption names `all`. `RULES_VERSION` stays 1; the sim bot still uses `discard(slot)`. New R-114, R-115 and the manual U-45; U-15 (the single-card Discard spot, lit only with a card picked) retired for U-45; D-16 now names X alone, the whole hand being D-83's; uiboot's Discard run now expects the whole hand to go; ONTOLOGY (Commands, rules, `idleTicks`, the `discards` counter, GameUI's `picked` and `queue`, telemetry args, report), DYNAMICS, README, UI_CONTROLS and CLAUDE.md follow.

### 2026-11-23 — Five counter scales from the first telemetry (D-74)
`COUNTERS`' scales, the designer's call from the first production report: `springThrows`, `slides` and `mountainsFlown` 10 → 100; `cannonLobs` and `rocketFlights` 1 → 10 (one player reached 500 Spring throws and hexes slid and 200 mountains flown over within a few sessions; Cannon lobs 50, Rocket flights 20). Before, their goals dealt 50 or 100 (scale 10) and 5 or 10 (scale 1); now 500 (small), 500 or 1000 (medium, large), 1000 (huge), and 50, 50 or 100, 100. Labels and goal flags unchanged; `RULES_VERSION` stays 1. Tests: R-79 checks the five scales and their first rungs, R-85 their goal amounts by size; R-70, R-74, R-97, R-98 and R-108 moved those counters' goal amounts and rungs to the new ladders. ONTOLOGY's Counters table, provenance tag and Numbers row, CRITERIA R-79 and R-85, D-74 follow.

### 2026-11-23 — The selection hint (D-82)
New: `#select-hint` (last in index.html's `#banners`, a steady `panel`, styled in index.css like `#goal-banner` but in `--text`), `GameDisplayArtifacts.SELECT_HINTS` (`turns`, `fixed`, `empty`) and `GameUI.drawSelectHint()`, called from `updateHUD` (every `render`, each animation frame included, so `D`'s remove hides it on the tick's first frame). Before, a selected hex showed only its outline, and the Go hold it causes was invisible (the designer couldn't tell why Go stopped). Selection, `rotate`, `D` and Go are unchanged; `RULES_VERSION` stays 1. New R-113 (stub DOM) and the manual U-44; ONTOLOGY (GameUI view state's `selected` row), README, UI_CONTROLS and CLAUDE.md follow.

### 2026-11-23 — Gremlins lunge (D-81)
New: `GREMLIN_LUNGE_CHANCE` (0.16) and the Tick rule's Lunge step, `GameEngine.lunges(run)` / `lunge(run, g, crate)`, run before any claim: a gremlin with a crate beside it draws one `Rando.random()` and under the chance jumps onto one (`Rando.choice`) at hop 1, smashing it as a wreck does (`cratesSmashed`, a splat by the gremlin, a one-hex move); the gremlin is claimed (no Thing carries it, no wander, no bump), doesn't slide, and dies on a Trap. Before, a gremlin smashed a crate only by its own wandering step, so one riding a Belt never did. Gremlins with no crate beside them draw nothing, but seeded play changes (the shared stream): the sims are slower and lose more (D-81's figures). Help's World line for the gremlin names the chance (`worldNumbers().lungePct`) and its hover name (`PIECE_LOOK`) adds "pounces on crates"; README, DYNAMICS, ONTOLOGY (Tick, the `wrecks` row, Agents, Numbers), CLAUDE.md follow. New R-112; uiboot's World-page check expects the chance in the Gremlin row. `RULES_VERSION` stays 1; the save format is unchanged.

### 2026-11-23 — "Hexes slid" counts every slick hex a crate slides off (D-74)
`slides` now counts 1 for each slick hex a crate (`cargo`) leaves by sliding, whatever it moves into, the designer's call: a free slide, a landing's skid, a bumped line's advance and its bumper's follow (D-33); a powered step off a slick hex counts nothing, nor a hex a crate is blocked or capped on, nor anything a gremlin does. Before, it was D-52's slick-to-slick count in `slidInto` (any piece, gremlins included, and a powered step from ice onto ice counted), so a crate skidding off ice onto plains or sliding into water counted nothing. The count moved to `countSlideOff` in `applyHop` (a `bumpLine` column on `PHASES`, and `isSliding` shared with `splatsOnBump`); `slidInto` keeps only D-52's `slid` cap, so play is unchanged and `RULES_VERSION` stays 1. R-81's slide cases rewritten (sliding off onto plains, skids, into water, blocked, the cap, a bump line, a Pusher's shove, gremlins); ONTOLOGY's Counters row, CRITERIA R-81 and D-74 call (2) follow.

### 2026-11-23 — Gremlins trapped on a scale of 100 (D-74)
`COUNTERS`' `trapped` row: scale 1 → 100, the designer's call (trapped gremlins pile up at the same pace as ex-gremlins, so the two share a scale). Before, its ladder ran 1, 2, 5, 10, …; now 100, 200, 500, 1000, …, so a trapped goal deals 500 (small, level 3), 500 or 1000 (medium, large), 1000 (huge) instead of 5 or 10. `RULES_VERSION` stays 1. Tests: R-79 checks the scale, R-85 the trapped goal amounts by size beside exGremlins'; R-70, R-74, R-86, R-97, R-98, R-103, R-105, R-107, R-108, R-109 and R-111 moved their trapped amounts and rungs to the new ladder.

### 2026-11-23 — A Cannon's lob counts its mountains (D-74)
`mountainsFlown` now also counts each mountain hex a Cannon's lob passes over, the designer's call: `passedOver` (the `over` phase's arrival in the hop simulation) counts it as the piece goes over, so a shot that doesn't fire counts nothing. Before, only a Spring's flight counted (`flewInto`), and D-74 call (3) said a lob over a mountain didn't. Play unchanged; `RULES_VERSION` stays 1. R-81's Cannon case now lobs over two mountains (adds 2), plus one coming down early on its 4th hex (2) and a no-fire case with mountains in its stretch (0). ONTOLOGY's Counters row, CRITERIA R-81 and D-74 follow.

### 2026-11-23 — No Bomb goals (D-75)
`COUNTERS`' `bombs` row: `goal` true → false, the designer's call (the Bomb is a rare card and the last in `UNLOCKS`, so a Bomb goal was out of reach for most of a session). Before, every size's goal pool held "Bombs set off"; now none does (`goalExcludes` unchanged), so the pool has 14 counters (was 15) and a seed may deal different sets than before. `bombs` is still counted per game and keeps its scale, label and achievement ladder. worker/telemetry.js's `GOAL_COUNTERS` drops `bombs` (a goal record naming it is now refused with 400). `RULES_VERSION` stays 1. Tests: R-85 checks `bombs` is never dealt on any size and still counts and has rungs; R-79 lists it among the non-goals; R-70, R-74, R-86, R-87, R-97 and R-98's fixtures use other goal counters where they had `bombs` as a goal. ONTOLOGY's Counters table and `GOAL_COUNTERS` row, CRITERIA R-79 and R-85, D-74 and D-75 follow.

### 2026-11-23 — Ex-gremlins on a scale of 100 (D-74)
`COUNTERS`' `exGremlins` row: scale 1 → 100, the designer's call (gremlins are ex'd en masse by Bombs, Rocket flights and slide-bump splats, so the count outruns a scale of 1; 10 was weighed). Before, its ladder ran 1, 2, 5, 10, …; now 100, 200, 500, 1000, …, so an exGremlins goal deals 500 (small, level 3), 500 or 1000 (medium, large), 1000 (huge) instead of 5 or 10. `RULES_VERSION` stays 1. Tests: R-79 checks the scale, R-85 the exGremlins goal amounts by size; R-103, R-106, R-108 and R-98's fixtures moved their exGremlins amounts to the new ladder.

### 2026-11-22 — Telemetry on achievements (D-80)
New: `GameTelemetry.rungs(announced)` and rung records `{gameKey, counter, rung, unixSeconds}`; batches carry one more list, `rungs` (additive, `TELEMETRY_FORMAT` stays 1). GameUI's `achievementsChanged` hands each `GameAchievements` announcement to it; before, rungs reached telemetry not at all (D-79 call 13). `ACHIEVEMENT_COUNTERS` moves from worker/achievements.js to a new worker/counters.js, which achievements.js and worker/telemetry.js both import (no module cycle; R-100 and R-101 import it from there); worker/telemetry.js checks rung records (`MAX_RECORDS` now counts seven lists) and inserts them; `worker/telemetry_schema.sql` gains `rungs`, keyed (player_id, counter, rung) (a new table: rerunning `just d1-local` adds it; production's needs `just d1-production` at the designer's go, before a deploy of this Worker). The report reads seven tables (was six), prints an Achievements section after Goals, and its Volume section counts the rungs table's rows (one more column). About's privacy line says "moves, goals and achievements reached". New R-109, R-110, R-111 and test/helpers/telemetry.js (`recorderPage`, `sqliteD1`, factored out of R-96 and R-97, which use it); R-70 (seven SELECTs, Volume's rungs column), R-74 (a signed-in batch's rung row under the sub hash too), R-98 (seven SELECTs) and U-33 follow; ONTOLOGY's Telemetry and Achievements client sections, README and CLAUDE.md too. `RULES_VERSION` stays 1.

### 2026-11-22 — Achievements in the browser (D-79)
New: achievements.js (`GameAchievements`: `configure`, `counted`, `listen`, `status`, `active`; loaded after signin.js, so the ship build copies it), `GameDisplayArtifacts.ACHIEVEMENTS_KEY` (`'thingfactory.totals'`), `RUNG_BANNER_LINES` (3) and `MESSAGES.rungReached` / `rungNotoriety`; the achievement banner `#rung-banner` (third in `#banners`, under the goal banner); the Goals view's second page, Achievements (`#goals-page-1`; `GOALS_PAGES` 1 → 2, so the view reads "1 / 2"). GameUI's `commit` hands `engine.counters()` before and after each accepted command to `GameAchievements.counted`; `startSignIn` and `signOut` call `configure`; `Pager` takes an `onShow` (null for Help and About); `GameTelemetry.workerUrl(path)` gives /t's and /achievements' URL from one place. Fixed: index.css's `--met` was `var(--met)` (invalid, so the met green never showed); it is `#4ce08a`, SOURCE_COLOR's green, and R-92 checks it. Before, the server's POST /achievements (D-78) had no client and `rungsReached` was never counted. About's privacy page gains a paragraph on the totals. New `test/helpers/achievements.js`, R-102…R-108 and the manual U-43; R-94 follows ("1 / 2", → to Achievements). ONTOLOGY (GameUI view state, Goals on screen, the Sign-in and Achievements server sections' notes, a new Achievements client section), README, CLAUDE.md follow. `RULES_VERSION` stays 1.

### 2026-11-22 — Achievements on the server (D-78)
New: the `PlayerTotals` Durable Object (worker/player_totals.js: one per signed-in player, named by the player hash, a kv key per counter; `add`, `totals`), `POST /achievements` (worker/achievements.js: /t's Origin check and rate limit, `ACHIEVEMENT_COUNTERS`, `MAX_ADD_KEYS` 64, `MAX_ADD_VALUE` 100000; 400 / 401 / 200 `{totals}` / 503), and wrangler.jsonc's `PLAYER_TOTALS` binding with migration v1 (`new_sqlite_classes` [`PlayerTotals`]) at top level and in env.production. Before, worker/index.js had only a default export; now it also exports `PlayerTotals` by name (the class the binding names). worker/telemetry.js exports `originAllowed` and `underLimit` (were module-private) and `readJsonObject`, the body read both routes share (factored out of `telemetry()`). auth.js `identityFor`'s log lines say "sign-in token not accepted / not checked" (were "telemetry token …", wrong on /achievements). New test/helpers/cloudflare.js stubs `cloudflare:workers` for Node and gives `fakeKv()`, R-99's and R-100's storage stand-in; R-68, R-70, R-74, R-75, R-77, R-97 and R-98 require it. New R-99, R-100, R-101 and the manual U-42 (/achievements under wrangler dev); ONTOLOGY's Achievements server section (and a line in the Endpoint and Sign-in sections), README (Deploy: the migration on the first deploy; an Achievements paragraph), CLAUDE.md follow. Not deployed: production needs the migration, at the designer's go. `RULES_VERSION` stays 1.

### 2026-11-22 — Telemetry on goals (D-77)
New: `GameTelemetry.goalSet(how, state)` and goal-met records from `command()`'s `goal` events; batches carry two more lists, `goalSets` and `goalsMet` (additive, `TELEMETRY_FORMAT` stays 1). GameUI calls `goalSet('start')` after `startGame` and `goalSet('reroll' | 'next')` in `dealNewGoals`; before, New goals reached telemetry not at all (D-76 call 12). worker/telemetry.js gains `GOAL_COUNTERS`, `GOALS_PER_SET`, `GOAL_HOWS`, the goal records' checks (`MAX_RECORDS` now counts six lists) and two inserts; `worker/telemetry_schema.sql` gains `goal_sets` and `goals_met` (new tables: rerunning `just d1-local` adds them; production's need `just d1-production` at the designer's go, before a deploy of this Worker). The report reads six tables (was four), prints a Goals section after Players, and its Volume section counts the goal tables' rows (two more columns). About's privacy line says "moves and goals". New R-96, R-97, R-98; R-91 (New goals now queues a goal-set record), R-70 (six SELECTs, Volume's goal columns), R-74 (goal rows signed in too) and U-33 follow; ONTOLOGY's Telemetry section, README and CLAUDE.md too. `RULES_VERSION` stays 1.

### 2026-11-22 — Goals on screen (D-76)
New: the goals side panel (`#goals-side`, under the tally in a new `#right-stack` column; before, `#tally` was fixed top right on its own), its New goals and ⤢ buttons; the Goals view overlay `'goals'` (`goalsPager`, `GOALS_PAGES` 1, `#goals-panel`); the goal banner (`#goal-banner`, in a new `#banners` column with `#milestone`, which was fixed top centre on its own); the goals-met overlay `'goalsDone'` (`#goals-done-panel`); `GameDisplayArtifacts.MESSAGES` (`goalMet`); Help's sixth page, Goals and achievements (`HELP_PAGES` 5 → 6). The news panel now closes through `closeNews()`, so goals met can wait behind it. `test/helpers/page.js` keeps element listeners (`fire`) and has a `live` clock. ONTOLOGY (GameUI view state, Goals on screen), CRITERIA R-90…R-95, U-24 (6 pages), U-41, README, UI_CONTROLS, CLAUDE.md follow. No rule changed; `RULES_VERSION` stays 1.

### 2026-11-22 — Goals in the engine (D-75)
New: `GameArtifacts.GOALS_PER_GAME` (3) and each `MAP_SIZES` row's `goalLevels` and `goalExcludes`; `Rando.stream(n)` (an independent mulberry32 generator); `GameState.goals` `{set, base, list}` (in toJSON/fromJSON; a save without it is refused); `GameEngine.dealGoals(set)` (`newGame` deals set 0 last, off the shared stream), `goalStates()`, `checkGoals()` (the last step of every tick: `goal` and `goalsDone` events, `goalsMet` counted; before, `goalsMet` stayed 0) and `newGoals()` (no tick, a `goals` event). No rule changed, no shared `Rando` call added; `cc-sim 200 small` unchanged. ONTOLOGY (GameState `goals`, the Goals rule, the Generate and Tick pseudocode, the invariants (`newGoals` ticks nothing; the goal list's shape), `goalsMet`'s row, Numbers, Commands, Queries, Events, `restore`), CRITERIA R-85…R-89, CLAUDE.md follow. `RULES_VERSION` stays 1.

### 2026-11-22 — Per-game counters and the ladder (D-74)
New: `GameArtifacts.COUNTERS` (the counter table: 22 rows `{key, label, scale, goal, negative, perGame}`), `COUNTER_READS`, `STORED_COUNTERS`, `LADDER_STEPS` and `rung` / `rungsCrossed` / `standing`; `GameState.counts` (the stored counters, 0 in a new game, in toJSON/fromJSON; a save without them is refused) and `GameState.zeroCounts()`; `GameEngine.counters()` and `count(key, n)`. Before, `loseValue(piece)` only added to `lost`; now it takes the cause and adds to `cratesSunk`, `cratesSmashed` or `cratesLostOther` too. Motions carry `counter` (the counter their Thing's launch set). GameState's own list of whole-number fields is renamed `TALLIES` (was `COUNTERS`). No rule changed, no Rando call added; `cc-sim 200 small` unchanged. ONTOLOGY (GameState `counts` and `lost`, the Counters rule, Numbers, Queries, `restore`), CRITERIA R-79…R-84, CLAUDE.md follow; CLAUDE.md's artifacts.js row no longer says `RULES_VERSION` is 2 and bumped with every rule change (stale since the D-65 entry below). `RULES_VERSION` stays 1.

### 2026-11-21 — RULES_VERSION back to 1, and it stays 1 through development (D-65)
Before, `RULES_VERSION` was to be bumped by one with every rule or tuning change, and D-73 took it to 2. Now it stays 1 while the game is in development, rule changes included: the game record's `version` (the commit hash) already tells builds apart, and it changes only for a drastic, breaking rules change, at the designer's call. `artifacts.js`, R-69's check, ONTOLOGY (Numbers and the note above the table), CLAUDE.md, D-65 and D-73 follow. Production games recorded under 2 between the D-73 deploy and this one carry `rulesVersion` 2.

### 2026-11-21 — Walls stop a Spring's throw again (D-73, superseding D-62)
Before, a Spring's throw passed over Walls as it does mountains (`THINGS` flag `overWalls`, D-62). Now a Wall ends every flight on the hex before it, the Spring's too, as it did before D-62; only the Cannon's `clears` hexes pass over Walls (D-36), and the Spring still clears up to 2 mountains (D-35). `overWalls` is gone from `THINGS`, the push `how`, `wanderOf` and `flightLength`; `canLand` stays `groundOpen`. `RULES_VERSION` 1 → 2 (R-69's check follows). The Spring's verb line is back to "leaping over lakes and mountains in between"; README's row says "a Wall stops it"; DYNAMICS, CLAUDE.md, ONTOLOGY (`overWalls` row removed, `blocks`, invariant, Motion, Flights, Tick) follow. R-67 rewritten in place (test now `test/R-67/wall_stops_spring.js`); R-7's and R-53's rows lose their Wall-leap wording; R-12, R-15 and R-53 fire a Spring at a Wall again. `cc-sim 200 small` unchanged.

### 2026-11-21 — `just local-d1-clear`; production's tables recreated (D-64)
Before, emptying or recreating the local telemetry D1 was by hand (delete `.wrangler/state/v3/d1`, then `just d1-local`). Now `just local-d1-clear` does both. Production's tables, first applied without the four `delivered_<color>` columns, were checked empty, dropped and re-applied with `just d1-production` (pjpd prodtables-3xzh); their columns and indexes now match the schema. README, ONTOLOGY, the schema header and D-64 call 14 name the recipe.

### 2026-11-21 — deliveredByColor moves out of rest into four INTEGER columns (D-64, D-65)
Before, every event and milestone record carried `deliveredByColor` as an optional `{color: n}` map, and the Worker stored it inside the row's JSON `rest` (`{"args":{…},"deliveredByColor":{…}}` on events, `{"deliveredByColor":{…}}` on milestones; `rest` NOT NULL), about 40 bytes of mostly key names per row. Now the record sends it as a required array of 4 whole numbers ≥ 0 in `GameArtifacts.CRATE_COLORS` order (red, green, blue, yellow; 0 for a color not open), built by telemetry.js from the targets; the Worker checks it (anything else is a 400) and binds it into `delivered_red`, `delivered_green`, `delivered_blue`, `delivered_yellow` (INTEGER NOT NULL) on both tables. `rest` is nullable: an event's holds `{"args":…}` only, NULL when every arg has a column; a milestone's is NULL. worker/telemetry.js gains `DELIVERED_COLORS` (R-68 checks it equals `CRATE_COLORS`); the report's records.js rebuilds `deliveredByColor` from the columns. Format stays 1, changed in place: nothing was deployed and no portal build had shipped telemetry. No ALTER migration: a local D1 made earlier is recreated (delete `.wrangler/state/v3/d1`, then `just d1-local`); production's tables, applied earlier the same day and still empty, must be recreated by hand before the first deploy (pjpd prodtables-3xzh). R-68, R-69, R-70 extended; R-74's and R-70's fixtures send the array. README's local-telemetry paragraph says how to recreate the local D1.

### 2026-11-21 — events loses its events_by_command index (D-64)
Before, `worker/telemetry_schema.sql` indexed events by time and by command. Now only `events_by_time` stays: D1 counts another written row per index for each event, and the report filters events only by time, never by command, so the command index bought nothing. The schema replaces its CREATE with `DROP INDEX IF EXISTS events_by_command`, so rerunning `just d1-local` / `just d1-production` removes it from a database that has it; the file is still safe to rerun. The games and crashes indexes are unchanged. R-68 checks the indexes, and that the schema drops an old events_by_command. ONTOLOGY's tables part and D-64 (call 13) follow.

### 2026-11-21 — Event seq comes from the browser (D-64, D-65, D-67)
Before, `worker/telemetry.js` numbered each event inside its INSERT with `(SELECT COUNT(*) FROM events WHERE game_key = ?1)`, so a game of n events read about n²/2 rows (a 1000-move game ~500k, against D1's free 5M rows read a day), and a resent event would have been numbered again. Now the recorder numbers its event records: `GameTelemetry` keeps a per-game `eventSeq` (0 at each startGame, +1 per queued event record, accepted or refused, milestones not; it survives `switchIdentity`) and sends it as each event's `seq`. The Worker requires it (a missing, wrong-typed or negative `seq` is a 400) and binds it directly; the event insert is now `INSERT OR IGNORE`, so a resent event (same game key and seq) is kept once. The sign-in redirect's save gains `ui.telemetrySeq` (`GameTelemetry.eventSeq()`), `resumeGame` takes it back as `eventSeq`, and a save without a whole-number `telemetrySeq` ≥ 0 is refused like any bad save. Format stays 1, changed in place: nothing was deployed and no portal build had shipped telemetry. R-68, R-69, R-72, R-73 extended; R-70's and R-74's fixture events carry `seq`. R-70 also builds its placeholder config by putting `PUT-THE-DATABASE-ID-HERE` back into env.production's `database_id`, since `wrangler.jsonc` now holds the real production id and the refusal checks had started failing.

### 2026-11-21 — `just telemetry-local` (D-66)
Before, the local telemetry report was `just telemetry-report local-d1 [days]`. Now it is its own recipe, `just telemetry-local [days]` (it passes the tool's `local-d1`), and `just telemetry-report [days]` reads production only: the recipe refuses a `local-d1` argument with a one-line pointer at telemetry-local and exits 1. `tools/telemetry_report.js`'s CLI is unchanged; its usage line, its WRANGLER-unset message and the placeholder refusal's hint name the new recipe. README, CLAUDE.md, ONTOLOGY's Telemetry report section, CRITERIA R-70 (and its Status note that the recipes are checked by hand) and RATIONALE D-66 / D-72 follow.

### 2026-11-21 — Telemetry report: Volume section (D-72)
Before, the report said nothing about how close telemetry came to D1's free-plan limits. Now a new `tools/telemetry_report/volume.js` holds `D1_FREE_ROWS_WRITTEN_PER_DAY` (100000), `D1_FREE_DB_BYTES` (500 MB) and `WARN_SHARE` (0.5), the Volume section's figures and its `d1 info` call; `render.js` prints the section once, last: rows written per UTC day per table and in total (each row on its own time column's day), days at or over half the daily limit marked, the busiest day's line with a WARNING: prefix at or over half, a note that index writes and the Worker's requests aren't counted, and the database's size from a new `wrangler d1 info ttdat-telemetry --json` call (`--env production` for production) against the size limit, or "size: unknown (local)" for wrangler dev's database, which d1 info can't see. New `test/R-70/volume.js`; R-70's CLI test's fake wrangler answers `d1 info`. ONTOLOGY's Telemetry report section and Numbers, CRITERIA R-70, README and CLAUDE.md follow.

### 2026-11-21 — Crash reports (D-71)
Before, the crash card (D-63) only showed the error; nothing reached us unless the player wrote in, and the Worker's `crashes` table stayed empty. Now crash.js, after the card is up, sends one crash record by sendBeacon to the recorder's endpoint: format, time, version, the recorder's game key, seed / size / turn from the board, the message (500) and the stack's first lines (2000), the user agent, under the recorder's player and token (or a fresh random ID), and only under telemetry's rules (data-version, http(s), no GPC, not while the recorder backs off), checked in crash.js so a crash before telemetry.js loads is reported too. The new `GameTelemetry.beforeCrash()` sends the queue by sendBeacon first and returns the identity. Once only, failures ignored, nothing on the card. About's privacy line adds "and any error the game hits". `test/helpers/page.js` gains `version` and `patch`. New R-78, U-40; ONTOLOGY's crash screen row and the Telemetry section (`beforeCrash()`, Crash report), CLAUDE.md, README, SHIP.md ERR-3 / PRIV-2 / PRIV-3 and U-33 follow.

### 2026-11-21 — POST /t rate limit and Origin allow-list (D-70)
Before, `POST /t` took any request: any website could post from its visitors' browsers, and a loop could flood D1; the Worker read no header but the body's length. Now `worker/telemetry.js` checks two things before reading the body: an Origin header not in the new `TELEMETRY_ORIGINS` (the live site, https://html-classic.itch.zone, https://uploads.ungrounded.net; plus wrangler dev's `TELEMETRY_DEV_ORIGINS` var, http://localhost:8787) gets 403, and the new Workers Rate Limiting binding `TELEMETRY_LIMIT` (wrangler.jsonc `ratelimits`, top level and env.production, 1000 per 10 s, restated as `TELEMETRY_RATE_LIMIT`), keyed by `CF-Connecting-IP`, answers 429 over the limit; neither writes anything, and the IP is only the limiter's key. The browser recorder backs off on a 429 or 403: the queue dropped and nothing recorded or sent for the new `GameDisplayArtifacts.TELEMETRY_BACKOFF_MS` (300000). New R-77, U-39; ONTOLOGY's Recorder, Endpoint and Numbers, README's Telemetry paragraph, SHIP.md PRIV-5 and CLAUDE.md follow.

### 2026-11-21 — R-76 waits for the redirect, not 10 turns
Before, R-76's browser test checked the sign-in redirects after a fixed 10 event-loop turns, which the real WebCrypto digest in `GameSignIn.begin()` sometimes outran under the full suite ("redirects once" failed, then `new URL(undefined)` threw). Now the three redirect checks wait with `until()`: poll every 5 ms until `assigned` has the redirect (5 s cap, failing with "timed out … waiting for the sign-in redirect"), then the 10 turns to catch a second one; the successful return waits until the bar shows the handle. The other checks keep the fixed wait: nothing starts there, or (a failed return) only the stub fetch's promises, with no WebCrypto work. Same checks as before; signin.js unchanged.

### 2026-11-21 — Sign out (D-69)
Before, a sign-in lasted until its token expired; there was no way to sign out but clearing `thingfactory.auth` by hand. Now, while signed in, the top-left bar shows a "Sign out" button (`#signout`) after the handle: `GameUI.signOut()` (ignored under an overlay, no tick) calls `GameTelemetry.switchIdentity(null)` (the queue goes with the token, later batches under a fresh random ID and no token), the new `GameSignIn.signOut()` (removes `AUTH_KEY`) and `showSignIn(null)`; no reload, no revoke call to auth/, and the game keeps going. `showSignIn` keeps `this.signedIn` (ONTOLOGY's GameUI state row, CLAUDE.md's signin.js row and Sign-in bullet follow). New U-38; uiboot's `bootPointer` takes `opts.doc`, `opts.globals` and `opts.version` and gains the sign-out walk; ONTOLOGY §9 and README follow.

### 2026-11-21 — Optional "Sign in with Bluesky" (D-68)
Before, there was no sign-in: telemetry's `token` field was reserved and ignored, every row had `signed_in` 0, and the sign-in return marker was a query parameter (`SIGNIN_RETURN_PARAM`) nothing set. Now a new `signin.js` (`GameSignIn`, after telemetry.js) runs auth/'s authorization code + PKCE flow in the browser, offered only on `SIGNIN_SITES` origins (the live site, localhost:8787); GameUI shows a "Sign in" button in the top-left bar and on the intro and New Game panels (the handle in its place once signed in) and a line on About's credits page, calls `saveForRedirect()` before the bar's redirect, and on a return (an OAuth state starting with the new `SIGNIN_STATE_PREFIX`, which replaces `SIGNIN_RETURN_PARAM`) restores the game, trades the code and stores `{token, handle, expiresAt}` under `AUTH_KEY`. `GameTelemetry.switchIdentity(token)` puts the token on every later batch. The Worker gains `worker/auth.js` (`POST /auth/token`, passed to auth/'s `/token` through a new `AUTH_SERVICE` service binding; `identityFor`, the salted sub hash with `signed_in` 1 for a valid token), the vendored auth-client in `worker/vendor/auth-client/` (lazily imported by `worker/index.js`), `worker/package.json` with cbor-x 1.6.4 (the Worker's first npm dependency; new `just worker-deps`, run by `deploy`, `dev-worker` and `preview` when missing) and the vars `AUTH_ISSUER`/`TTDAT_CLIENT_ID` in both wrangler environments; `telemetry()` takes the verifier as a fourth argument and resolves identity inside its waitUntil write. The privacy page's ID line now covers the hashed account ("No cookies, no account, no IP addresses kept, no personal data." became "… We don't keep your handle. No cookies, no IP addresses kept.") and its storage line the sign-in ("It never leaves your computer." became "Only the sign-in is ever sent, with your moves."). New R-74, R-75, R-76, U-37; R-72, uiboot and `test/helpers/page.js` (origin, extra window and page globals, `assigned`) follow the new marker. ONTOLOGY gains §9 Sign-in and the Telemetry batch/endpoint changes; README "Deploy" gains the auth/ client-row SQL; U-33, D-59's privacy wording, D-67's marker call, SHIP.md PRIV-3, CLAUDE.md follow.

### 2026-11-21 — The game is saved around the sign-in redirect (D-67)
Before, nothing but the mute setting was stored, and `SAVE_KEY` was only a name for Start fresh to remove. Now `GameUI.saveForRedirect()` writes `{version: SAVE_VERSION (1), savedAt, state, ui}` under `SAVE_KEY` for the sign-in work to call before its redirect (nothing calls it yet), and `GameUI.start()` restores it on a sign-in return (`SIGNIN_RETURN_PARAM` in the query string) if it's under `SAVE_REDIRECT_MAX_AGE_S` (1800 s) old, skipping the intro and first-time Help with Go off; every boot removes a save it finds. New `GameState.toJSON`/`fromJSON`, `GameEngine.save`/`restore`, `Rando.state`/`setState` (the stream unchanged), `GameTelemetry.gameKey`/`resumeGame`, and the display numbers `SAVE_VERSION`, `SAVE_REDIRECT_MAX_AGE_S`, `SIGNIN_RETURN_PARAM`. The privacy page's storage line changed from "Your browser keeps your settings (like mute). Map saves are planned." to "Your browser keeps your settings (like mute), and your game while you sign in. It never leaves your computer." New R-71, R-72, R-73 and `test/helpers/page.js`; uiboot saves a played game and restores it in a fresh page. ONTOLOGY (GameState, §7 `restore`/`save`, the Save subsection and its numbers), U-33, D-59's privacy wording, SHIP.md PRIV-3, README and CLAUDE.md follow.

### 2026-11-21 — Telemetry report (D-66)
Before, the telemetry tables could only be read with hand-written `wrangler d1 execute` SQL. Now `just telemetry-report [local-d1] [days]` (new `tools/telemetry_report.js` with `tools/telemetry_report/records.js`, `figures.js`, `render.js`; plain Node, no npm) reads the four tables with four read-only SELECTs (every game; events, milestones and crashes from the period on) through yuwakisacloud's wrangler (production by default, refused while `wrangler.jsonc` holds the placeholder id; `local-d1` for wrangler dev's database) and prints a heading and the Games, Milestones, Commands, Bomb, Sessions, Clients, Crashes and Players sections, once per rules version when there are several. New `LONG_PAUSE_SECONDS` (300) and `WINDOW_BUCKET_PX` (100) in the report, ONTOLOGY's Telemetry report subsection and Numbers rows, R-70 (fixtures, usage errors, the placeholder refusal, `local-d1` end to end over node:sqlite with a fake wrangler), the `telemetry-report` recipe, README and CLAUDE.md.

### 2026-11-21 — Privacy page, README and SHIP.md describe the telemetry as built (D-59, D-65)
Before, the About privacy page described telemetry that wasn't built yet: moves, board size, seed and version, "tied to a hashed ID". Now it matches the recorder (pjpd privacydocs-ntj5): it adds browser type and window size, the ID is "a random ID made fresh each time you open the game", and a new line says Global Privacy Control turns it off. D-59's "Must stay true" now binds the page to D-65 instead of a planned feature; U-33 names the privacy page's lines. README's About bullet says what the page lists, and a new Deploy "Telemetry" paragraph covers what is recorded, ship builds only, GPC, the D1 database and its recipes. SHIP.md: PRIV-1, PRIV-2, PRIV-4, ERR-5, PORT-6 done; PRIV-3 and LOAD-6 evidence updated; PRIV-5 partial (no retention period, no rate limit); tiers recounted.

### 2026-11-21 — Telemetry's browser half: the recorder (D-65)
Before, nothing in the browser sent telemetry; the Worker's `POST /t` waited for a client. Now `telemetry.js` (`GameTelemetry`, loaded after displayartifacts.js) records each game from the first board pick: a game record (new `GameArtifacts.RULES_VERSION`, 1), an event per place/remove/discard/move/scrap/bomb/blast with the snapshot after its tick (no wait or rotate), and a milestone record per milestone; it posts batches to the live endpoint (own origin on localhost) every `TELEMETRY_FLUSH_MS` (30 s) or at `TELEMETRY_FLUSH_RECORDS` (50), the rest by sendBeacon on pagehide or a hidden tab; only from a ship build over http(s), never under GPC; a random per-load player ID and `switchIdentity()`. `GameUI.commit(fn, cue, record)` takes `{command, args}` and hands every result to the recorder; `startGame` starts its game. New `TELEMETRY_ENDPOINT`/`TELEMETRY_FLUSH_MS`/`TELEMETRY_FLUSH_RECORDS` in `GameDisplayArtifacts`. New R-69, U-36; uiboot's page is now stamped and checks the intro sends nothing and the milestone game's records; ship.js checks telemetry.js ships. ONTOLOGY's Telemetry section gains the Recorder rules and numbers.

### 2026-11-21 — Telemetry's server side: POST /t into D1 (D-64)
Before, ttdat was an assets-only Worker. Now `wrangler.jsonc` has `"main": "worker/index.js"` (plain-JS ES module, no build; it routes `POST /t` to `worker/telemetry.js` and answers 404 to anything else the assets don't serve), a D1 binding `TELEMETRY` (`ttdat-telemetry`; a made-up local id at top level, `PUT-THE-DATABASE-ID-HERE` restated in `env.production`) and observability off. `POST /t` takes one text/plain JSON batch (`format`, `player`, reserved `token`, `games`/`events`/`milestones`/`crashes`), checks it whole (64 KB, 200 records, types, known commands: else 400, nothing written; an unknown format 204 and dropped), answers 204 and writes every row in one `db.batch()` under `ctx.waitUntil`. New `worker/telemetry_schema.sql` (four tables, per-batch `player_id`/`signed_in` on every row, `INSERT OR IGNORE` for games and milestones, `seq` counted in the insert), `tools/telemetry_db.sh`, and recipes `d1-local`, `d1-production`, `dev-worker`; `just deploy` now takes args and refuses while the placeholder id remains (`--dry-run` passes). `GameDisplayArtifacts.TELEMETRY_FORMAT` (1) for the browser recorder to come. New R-68 (the worker against node:sqlite with the schema), U-35; `test/integration/ship.js` checks `worker/` isn't shipped. ONTOLOGY gains §8 Telemetry.

### 2026-11-21 — Crash screen (D-63)
Before, an uncaught error left a frozen canvas. Now a new `crash.js`, loaded before every other script, installs window `error` and `unhandledrejection` handlers (the task set them in index.js; loading them first means an error while a later script loads is caught too, D-63 call 6); the first one shows `#crash-panel` (index.html, styled in index.css over everything, the sorry page included): "Thing Factory hit a bug and stopped.", the error and the version/seed (selectable), Reload, and Start fresh, which removes only the new `GameDisplayArtifacts.SAVE_KEY` (`'thingfactory.run'`, for save-resume) and reloads. Later errors don't stack or replace it. It reads index.js's `state`/`ui` and `SAVE_KEY` only at crash time, in try/catch (a literal key before displayartifacts.js loads). uiboot checks it (an error thrown from the Wait button, a boot that throws, a script that throws as it loads, a rejection, the sorry page, storage that throws); new U-34; SHIP ERR-3 done.

### 2026-11-21 — Stale text
The README's Bomb paragraph and U-31 still described a 3-boom Bomb; they now follow `wipes` (5). The big crate's hover name had "worth 10" typed in; the hover now adds " — worth N" from `PIECES` (`pieceName`), and doesnumbers.js checks no piece name has a number in it.

### 2026-11-21 — A Spring leaps Walls (D-62)
Before, a Wall ended every flight; now a Spring's throw treats a Wall hex exactly like a
mountain: it passes over it and can't come down on it (trimmed back short of it, or no throw if
all three hexes are mountain or Wall). New `THINGS` flag `overWalls` (Spring only), read in
`flightLength`; `canLand` now delegates to `groundOpen`, so it refuses a Wall. The Rocket still stops at Walls; the Cannon
already cleared them. Spring's does line, README row, ONTOLOGY (template, `blocks`, Motion with `canLand`,
Flights, invariant), DYNAMICS, CLAUDE.md updated; new R-67, R-7's note; R-53 lost its "a Wall still stops it" check, R-12's and
R-15's Wall checks now fire a Rocket. `cc-sim 200 small` unchanged.

### 2026-11-21 — Help: Keys split in two (D-60)
The Keys page was too tall; `B` and the lines after it moved to a new "More keys" page after Keys. Help is now five pages: Keys, More keys, Special cards, Things, World.

### 2026-11-21 — Help's Special cards page (D-60)
Help has four pages ("1 / 4"): Keys, then a new Special cards page, then Things and World.
The Pusher/Puller color line, the Mover line and the Bomb line (its count still from
`TOOLS.BOMB.wipes`) moved off Keys onto it. Keys wording: X / Discard "throw away the picked
card" became "discard the picked card and show another", the Shift+1/2/3 / red × line "throw
that card away at once" became "discard that card at once", "Click a hex" "select it" became
"select the Thing there"; the Help and About lines are gone. `HELP_PAGES` 4, Things is
`#help-page-2`, World `#help-page-3`. The `uiboot.js` pager run pages through four and checks
the moved lines' page; U-24 updated.

### 2026-11-21 — Help's World rows get pictures (D-61)
Each World row but Milestones now has a 32 px picture in the Things page's column, drawn by the
board's own code under a shrinking transform (`worldPicture`; `drawTerrain` factored out of
`paint`, then `drawThing` / `PIECE_DRAW`): a crate, a big crate and a gremlin counter on
plains, an ice hex beside a Slide, a water hex. Milestones keeps a blank slot so its text lines
up; `.world-row` is gone. The `uiboot.js` World run checks the pictures.

### 2026-11-21 — Help's World page (D-61)
Help has a third page after Things, World ("3 / 3"): one plain row each for crates, big crates,
gremlins, ice and Slides, open water and milestones, every number filled from GameArtifacts at
runtime (`WORLD_LOOK` in displayartifacts.js, `worldNumbers()` in gameui.js). A `uiboot.js` run
checks the numbers against the rules data; the pager run pages to World. U-24 updated; SHIP.md
ONB-4 done.

### 2026-11-21 — Help is a pager with a Things page (D-60)
Help was one page of keys. It now pages like About (`<` `>`, ← →, "1 / 2"), through one
`Pager` class that About uses too (About's own `showAboutPage`/`aboutKey`/`onAboutClick`
and `aboutPage` are gone; `.about-nav` CSS became `.pager-nav`). Pages: Keys, where it
opens, then Things, one row per card in `CARDS`, locked or not: the hand's tile, the name
and the card's hover line. A World page is to come. The Keys page's Bomb line said 3 hexes; it
now reads `TOOLS.BOMB.wipes` (5). `THING_LOOK.does` lines rewritten (this changes the hand
hover and the news panel too): Spring "flings what is on it up to 3 hexes, leaping over lakes
and mountains in between" (was "3 hexes, over lakes and mountains"), Rocket "up to 8 hexes,
leaping over lakes in between" (was "…over lakes, skidding on ice; splats gremlins"), Cannon
"lobs what is on it 5 hexes, leaping over the 4 in between, whatever is on them" (was "over 4
hexes of anything, down on the 5th (slides on ice)"), Bomb "Things and pieces" (was "Things,
crates and gremlins"). `test/integration/doesnumbers.js` ties each line's numbers to the rules
data; `uiboot.js` drives the Help pager. U-24 updated; SHIP.md ONB-4 partial (Things done).

### 2026-11-21 — A network layer is no longer a non-goal
ONTOLOGY's non-goals dropped "A network layer": the game is working toward telemetry
(telemetry-v54s), whose planned collection the privacy page (D-59) already describes, and
later optional login and achievements. Nothing is sent yet; the engine stays headless and never sends.

### 2026-11-21 — About panel (D-59)
An About button in the top bar, and an About link on the intro, open a two-page overlay:
credits (made by Yuwakisa and yuwakisa.com, a Credits list (Wrangler: Rob Young), the AI disclosure, tools, version and seed) and privacy
(the planned telemetry, telemetry-v54s, described as running; settings kept in the browser).
< > and ← → flip pages; clicks on links, buttons and the version/seed text keep it open, any
other click or key closes it, back to the intro if it came from there. The version is
`<html data-version>`, "dev" unstamped. The feedback link is an empty `ABOUT.feedbackUrl` and
stays hidden until the GitHub Issues page exists. Help lists About. U-33 is its manual check; U-14 notes the intro's About link. Before this there was no
credits screen and no in-game version.

### 2026-11-21 — Unlisted screencap key (D-58)
P saves the board as PNGs named by use (window, og 1200x630, capsule 630x500, shot 1280x720) for the listings and
the link preview, each painted fresh at its size with the screen's center and zoom. `render()`
split into `paint(clean)` and `updateHUD()`; a clean paint skips the ghost, legal hexes, hover
outline and selection. Not in the Help panel or README. `tools/ship.js` copies og.png into
`dist/web/` when it exists (not into the zip).

### 2026-11-21 — Ship build
The game moved to its own repo (a fresh history; it was yuwakisaweb/thingthatdoesathing up to
122ba86). `just ship` (`tools/ship.js`, plain Node, no npm) builds `dist/web/` from only the
files index.html loads, stamps their URLs `?v=<short hash>` and `<html data-version>`, and
zips them as `dist/ttdat-<version>.zip` for the portals. The web build sits in `web/` so the
zip beside it isn't served. Before this, the whole folder (docs, tests, backlog) was what got
served. `test/integration/ship.js` checks the zip. No game code changed.

`just deploy` ships and deploys `dist/web` as an assets-only Cloudflare Worker (`ttdat`,
`wrangler.jsonc`, the yuwakisacloud/site shape) at ttdat.yuwakisa.com, using yuwakisacloud's
pinned wrangler; the repo stays npm-free. A Worker script and D1 for login and achievements
would join the same config. LICENSE (MIT) added.

### 2026-11-17 — ONTOLOGY checked against the code
Doc-only, plus one code comment. The non-goal "picking a Thing back up" now reads as getting a
removed Thing's card back (the Mover lifts Things, D-47). The idle-redraw reset lists every
card command (`move`, `scrap`, `bomb` too; the `IDLE_REDRAW_TICKS` comment in artifacts.js
said place or discard). Generate's first crate is a `spawnKind()` (it can be big). The GameUI
view-state table gains `scale`/`zoom`, `selected`, `bursts`, `notice` and `queue`, and `anim`,
`running`, `sound`, the sorry-page note and the pick modes' refused clicks match D-49, D-41,
D-53 and D-55. `NOTICE_MS` joins the numbers.

### 2026-11-17 — Coding-conventions pass over the D-49–D-57 work
No behavior change. `PICK_MODES.locked` is now the lock's reason (`REASONS.carrying` /
`REASONS.bombing`, null when unlocked) instead of a boolean, so `lockedReason()`'s branch on
the mode is gone; `refusedLocked()` replaces four copies of check-and-notify. The D-49 queue
is a `TickQueue` class (`defer(fn)`, `has`, `clear`, `flush`; built with a `busy()` check on
the animation) in place of the `queued` field and five inline copies of the hold; card
commands wrap with `whileSameCard(fn)`.
`whyNotBuild` reads terrain from `BUILD_REFUSALS`; the sorry page's share/copy is
`shareLink(onCopied)`. Engine: `advanceLine` is the bumped line's motions, shared by
`startBump` and `splatBump`.

### 2026-11-17 — The slide cap counts slick-to-slick moves (D-52 amended)
`MAX_SLIDE` was 4 free slick hexes, the first one entered from other ground included, so a
Belt push covered 4 slick hexes but a skid or a piece already on ice 5. Now only moves from a
slick hex onto a slick hex count (`slidInto(m, hex, fromSlick)`, motions carry `onSlick` and
`sliding`) and `MAX_SLIDE` is 3: at most 4 slick hexes in a row. D-54 reads `sliding` instead
of `slid > 0`. R-65 updated (skid stops 3 past the landing; new standing-on-ice case); R-32's
long-ice Rocket stops at 10, not 11. `just cc-sim 200 small` unchanged (median 94).

### 2026-11-17 — Game keys ignore Ctrl/Alt/Meta chords (D-57)
`GameUI.onKeyDown` returns early, without `preventDefault`, when Ctrl, Alt or Meta is held, so
Ctrl+D, Ctrl+R and Cmd+number stay the browser's. Shift still works. New `uiboot.js` check.

### 2026-11-17 — Meta description, Rocket favicon and link-preview tags (D-56)
index.html gains a description, an inline-SVG Rocket favicon, og:title/description/type/url/image and twitter:card. `og.png` is not in the repo yet.

### 2026-11-17 — Refused clicks and keys say why (D-55)
`GameUI.notify` puts a reason from `REASONS` (displayartifacts.js) in the hover bar for
`NOTICE_MS`, no sound, for a non-legal build or pick hex, a bare hex in pick-up, D or B with
nothing to act on, and the hand, Wait or B while a spent card is in play. Commands queued
mid-tick (D-49) show none. New `uiboot.js` check.

### 2026-11-17 — A sliding gremlin that bumps goes splat (D-54)
A gremlin sliding into a D-33 bump used to follow its line like any bumper. Now a piece with
the new `PIECES.*.splatsOnSlideBump` (the gremlin) splats where it is at the bump's hop
(`splatsOnBump`, `splatBump` in `startBump`); the bumped line still advances, unless the
bumped piece has the flag too, and then both splat. New R-66 (`test/R-66/`). `just cc-sim 200
small` unchanged (median 94).

### 2026-11-17 — Sound button and M mute (D-53)
`GameSound` gains `setMuted`/`isMuted` (remembered in `localStorage` `thingfactory.muted`);
a muted `phrase()` plays nothing and never creates the AudioContext. New `#sound` button
beside Help and the `M` key; help legend, README and CLAUDE.md note it. `uiboot.js` checks
the button and `M` flip the flag.

### 2026-11-17 — A slide stops on its 4th slick hex (D-52)
Slides were unlimited: a ground motion or a landing's skid kept going over bare ice or Slides
until ground that wasn't slick. Now each motion counts its free slick hexes (`slid`,
`slidInto`) and stops on the `MAX_SLIDE`-th (4, new in `artifacts.js`). New R-65
(`test/R-65/`); R-14 and R-48 note the cap; R-32's long-ice Rocket skid stops at 11, not 12.
`just cc-sim 200 small` and `just cc-sim-to 100 small 5` unchanged (median 94; milestones
94 / 152 / 250 / 405 / 709).

### 2026-11-17 — Crate cap is a number per board size (D-31)
`crateCap(size)` returns the new `MAP_SIZES.*.crates` (small 2, medium 3, large 4, huge 5)
instead of 0.6 × √area (8 / 12 / 18 / 36); `CRATE_CAP_PER_ROOT` is gone. The +1 per milestone
reached is unchanged. R-19 and its test updated (the test seeds `delivered` 10 for its
three-crate sequence). `just cc-sim 200 small`: first-milestone median 52 → 94.

### 2026-11-17 — The Cannon unlocks before the Rocket (D-51)
`UNLOCKS` swaps its `[ROCKET]` and `[CANNON]` steps: Mover, Cannon, Rocket, Bomb. Only the
order moves; R-49 and R-54 now expect it, and ONTOLOGY, CRITERIA, README, DYNAMICS and
CLAUDE.md state it.

### 2026-11-17 — One-action discard: a card's red × and Shift+1/2/3 (D-50)
Discarding used to take a pick and then the Discard spot or `X`. Each hand card now has a
red × (`.x`) and Shift+1/2/3 discards by slot (`e.code`); both call the new
`discardSlot(slot)`, which queues mid-animation like D-49's X.

### 2026-11-17 — Input during a tick animation is queued, not dropped (D-49)
`discardPicked`, a board click with a card picked (now `clickPicked(hex)`), `removeSelected`
and `blastHovered` (now via `blastAt(q, r)`) used to return early while `anim` was set, so
with Go on X mostly missed. They now store a closure in a one-slot `queued`, which
`finishAnim()` runs once the tick's animation ends; `pick`, `unpick` and `startGame` clear it.

### 2026-11-17 — The Bomb blows up 5 hexes, up from 3 (D-48 amended)
`TOOLS.BOMB.wipes` went from 3 to 5 at the user's call: a Bomb now takes up to five booms
before it ends on its own. Engine and UI already read `wipes`; tests and docs follow.

### 2026-11-17 — A picked tool shows its ghost before the pick-up (D-47 amended)
`PICK_MODES.pickup` used to draw no ghost, so a picked Mover or Bomb showed nothing under
the mouse until its first click. It now has `ghost: true` and a new `ghostAnywhere` flag:
the tool's ghost (the Mover's green cross, the Bomb) follows the mouse over every board
hex, where `build` still shows it on legal hexes only (pjpd tool-ghost-fewq). Tweaked
the same day: `carry` got `ghostAnywhere` too, and `carry()` sets the ghost facing to the
lifted Thing's, so the pick-up click swaps the cross for that Thing under the cursor at once.
Later the same day `bomb` mode (after the first boom) got `ghost: true, ghostAnywhere: true`
as well; it used to drop the ghost, so the bomb vanished after the first click (D-48 amended).

### 2026-11-17 — The Bomb blows up each hex as it's clicked (D-48 amended)
The Bomb used to mark its hexes with a red ring and cross (`picked.marks`,
`drawBombMark`, `BOMB_MARK_COLOR`) and show nothing blowing up until it went off. Now each
legal click bursts its hex at once: the UI's new `bursts` list plays the Thing's burst and
the piece's splat (with the splat sound) outside the tick animation, and `picked.booms`
hides that hex's Thing and piece (and drops them from the hover bar) until the command is
sent. `mark`/`unmarked`/`fireBomb` became `boom`/`unboomed`/`endBomb`; `endBomb` sends the
same `bomb(slot, hexes)` and filters the booms' `clear`s and `splat`s out of the tick's
events before animating. The engine, its rules and R-64 are unchanged; the cleared-Thing
burst is now `drawThingBurst`, shared by both. U-31, the help legend, README and the card
text say "boom"; `uiboot.js` checks the burst, the hidden hex and the unreplayed events
(pjpd bomb-booms-mp74).

### 2026-11-17 — The Bomb card (D-48)
`TOOLS` gains `BOMB` (`picks: 'filled'`, `wipes: 3`, weight 0.5) and every tool a `wipes`
field (the Mover's 0); `UNLOCKS` gains a last `[BOMB]` step, after `[CANNON]`. The engine's
`PICKS` table gains `filled` (a hex holding a Thing or a piece), and the new command
`bomb(slot, hexes)` clears 1 to `wipes` hexes and ticks once. `clearHex` (D-44) and `blast`
now share `clearThing(h, hop)` and `smash(piece, hop)`; the `clear` event used to be
`{kind, q, r}` and now carries `hop` too. `gameui.js` gains a `bomb` pick mode, an
`AFTER_PICK.BOMB` row (`AFTER_PICK` rows became `{ pick, hint }`, and a mode's `hint` a
function), `picked.marks` drawn as red ring-and-cross, and a burst for every `clear` event in
the tick animation. R-64 added (test/R-64/), R-49 and R-54 updated for the order, R-62 checks
the `clear` hop, U-31 added, `uiboot.js` drives the Bomb (pjpd bomb-card-w466).

### 2026-11-17 — The Mover card, and tool cards (D-47)
Every card used to be a `THINGS` kind, and the UI's `picked` card only ever built. Now a card's
kind may also be a `TOOLS` kind (`artifacts.js`: `TOOLS`, `CARDS`, `cardOf`); the deck,
`everDealt` and `colorChoices` read `cardOf`, and `aims` is false for a tool. `UNLOCKS` gains
a `[MOVER]` step after `[SPRING]`, so the Rocket and Cannon each unlock one milestone later.
The engine gained `canPick`/`legalPicks` (a `PICKS` table keyed by a tool's `picks`), and the
commands `move(slot, fq, fr, q, r, facing)` and `scrap(slot, fq, fr)`; `place`'s replace step
became `build(thing)`, and `remove`'s stranded-piece sink became `stranded(q, r, usedCard)`,
shared by all three. `gameui.js` routes a picked card through `PICK_MODES` (`build`, `pickup`,
`carry`) instead of assuming it builds; Esc and right-click call `backOut()`. R-63 added
(test/R-63/), R-27 and R-49 extended to tools and the new order, U-30 added, `uiboot.js`
drives the Mover (pjpd mover-card-82t7).

### 2026-11-13 — A crate on its own color's new target is delivered (D-46)
`clearHex` used to destroy any piece on a newly revealed source or target, a crate on its own
color's new target included (D-44 call 6). Now that crate is delivered (`deliver` event at the
tick's last hop). `reachMilestones(before, after, hop)` became `reachMilestones(before, hop)`,
reading `state.delivered` live so a reveal's delivery can cross the next milestone that tick.
R-62 row and test extended.

### 2026-11-13 — Big crates: 1% at the start, 5% by the fifth milestone (D-45)
`bigCrateChance(m)` used to be m / (m + `BIG_CRATE_HALF`) with `BIG_CRATE_HALF` = 4: 0 before
the first milestone (with no `Rando` roll), 20% after it, 56% by the fifth. Now it's a
straight rise from `BIG_CRATE_START` (0.01) to `BIG_CRATE_AT_FIFTH` (0.05) over
`BIG_CRATE_KNEE` (5) milestones, then 1 − 0.95·`BIG_CRATE_EASE`^(m − 5) with `BIG_CRATE_EASE`
= 0.85. `BIG_CRATE_HALF` is gone, and `spawnKind()` rolls on every spawn. R-52 rewritten
(end points, strict rise, < 1; a roll below the first milestone). The bot's turn to the fifth
milestone on small went from a median of 236 to 649 (pjpd bigcrate-odd-755q).

### 2026-11-13 — A new source or target clears its hex (D-44)
`openColor` used to pick new sources and targets only from free end-slice hexes
(`freeEndHexes`: no Thing, no piece, no endpoint), so a built-up or crowded slice could
leave no spot and the color waited for the next milestone. Now `openEndHexes` drops only
existing endpoints, and `clearHex` empties each newly placed hex: a Thing goes (`clear`
event, no card back), a piece is destroyed (`splat` at the tick's last hop; a crate's value
to `lost`, a gremlin to `exGremlins` and the shore). `openColor` returns a list and takes
the hop, as does `reachMilestones`; the tick runs milestones before its tally and emerge,
emitting their events last as before. R-38 rewritten, R-62 added (test/R-62/), R-36 and R-31
mention cleared gremlins; `test/sim.js` prints colors opened and clears per game (pjpd
port-clears-kh58).

### 2026-11-13 — Crates come from a fixed color cycle, one slot a tick (D-43)
Spawning used to be a board clock: `spawnTimer` counted to `SPAWN_INTERVAL` (3), and each
such chance rolled one open color with `Rando.choice` and spawned at its source if it was
clear and the board under the cap. Now `newGame` shuffles all of `CRATE_COLORS` once into
`spawnCycle` (right after the starting color is picked, so every seed's game after the map
plays differently), and every tick takes slot `spawnSlot` and advances it: an open color
spawns if under the cap with its source clear, anything else skips the slot. `spawnTimer` and
`SPAWN_INTERVAL` are gone; D-31's cap is unchanged. R-19 was rewritten (shuffle, one slot a
tick, closed slot, skip on cap or blocked source, every color open = a crate a tick); R-6,
R-26 and R-52 set the cycle instead of the timer; `flatGame()` holds spawns off with a
`[null]` cycle; `test/sim.js` prints the share of ticks at the cap. Small's first milestone
moved from a median of 45 to 53 turns (pjpd spawn-cycle-jisb).

### 2026-11-13 — Sources and targets fill their hex (D-42)
A source or target used to be a glowing ring over its terrain with an "IN" or ★ label; a
target also had a black line inside the ring and a source a row of color pips. Now each
fills its hex with its crate color (a shared source in equal wedges, one per color) under a
dark outline; a target carries two light rings and a source a light plus (neutral when it
makes several colors). `drawPort` is gone; `fillPort` and `outlinePort` replace it.
`CRATE_SHADES` moved above the return in `displayartifacts.js` and each entry gains a derived
`light` (`lighten`, `PORT_MARK_LIGHTEN`); the new `PORT_*` constants hold the mark sizes and
outline. The intro's "★ target" is just "target". U-19 points at the new U-29; `uiboot.js`
checks the light shades and renders sources of 0, 1 and every color (pjpd port-look-jtj4).

### 2026-11-17 — Past the sorry page: any-pointer, Try it anyway, Copy link (D-41)
`TOUCH_ONLY_QUERY` now also needs `(not (any-pointer: fine))`. The sorry card gained "Try it
anyway" (`index.js` `boot()` builds state, engine and UI then; `GameUI.showSorry(onPlay)`) and
"Copy link" (`navigator.share`, else clipboard plus a "Link copied" note). `uiboot.js` covers
the query, both buttons. D-41 amended, U-28 and README touched (pjpd sorry-past-zwbb).

### 2026-11-13 — Phones and tablets get a sorry page (D-41)
The page used to boot the game for every browser. Now `index.js` checks
`matchMedia(TOUCH_ONLY_QUERY)` (`'(pointer: coarse) and (hover: none)'`, in
`displayartifacts.js`) first; on a match it builds no `GameState`, `GameEngine` or `GameUI`
and calls `GameUI.showSorry()`, which unhides the new `#sorry-panel` (the name, a Belt from
the card art, a line on the game, a mouse-and-keyboard note) and adds `touch-only` to the
body so the CSS hides everything else. No `matchMedia` counts as a desktop. `uiboot.js`
boots extra stub pages for a coarse pointer, a fine one and none; U-28 is the look on a phone
(pjpd mobile-lock-twxz).

### 2026-11-12 — Map scale: 1, 2, ∞; fit above the hand (D-40)
After a look in the browser: 1/4 came out smaller than the fit, so the `4` button is gone
(`ZOOM_DIVISORS` [1, 2]). ∞ now fits the board between the window top and the top of the hand
(`aboveHand()`, the hand's measured top), or across the canvas, whichever is tighter, and
centers it in that space. The hand sits flush on the bottom edge (`bottom: 0`, was 14px).

### 2026-11-12 — Map scale buttons (D-40)
The board always drew at `HEX_SIZE` with a screen-space pan. Now a "Map 1 2 4 ∞" row under the
HUD sets a view `scale` (1, 1/2, 1/4, or a fit computed once on the press, capped at 1x).
`render()` draws in world px under one canvas transform, so the drawing helpers take world
positions (`hexToWorld`) and only `hexToScreen`/`screenToHex` (and the color picker's offset)
deal in screen px. On-map text under `MIN_TEXT_PX` is skipped. Zooming keeps the canvas center
fixed (∞ centers the board); `clampPan()` keeps the canvas center on the board during drags
and zooms. New games open at 1x; resizes don't touch the scale. `ZOOM_DIVISORS` and
`MIN_TEXT_PX` are in `displayartifacts.js`. `uiboot.js` covers the buttons, round-trips,
a 1/4 click, the 60×60 fit and the reset; U-27 is the look (pjpd map-zoom-8cwk).

### 2026-11-12 — Loop decisions reviewed and accepted (D-24, D-27 … D-37)
The designer reviewed the loop decisions logged before the lockstep work and accepted them all:
the D-24 first-vs-last addendum (keep Pushers/Pullers first; the "revisit if merges stall" line
dropped) and D-27 through D-37 as they stood before D-38, with the review-round updates to D-29,
D-30 (the banner call, (6)), D-31 (√area cap current; the linear cap is history) and D-33. Their
*unreviewed* tags became "reviewed and accepted 2026-11-12" and their "Unreviewed calls" became
"Calls (reviewed 2026-11-12)". Still *unreviewed*: D-38, every D-38 lockstep note (D-6, D-24,
D-33, D-35, D-36, D-37, Q-1), D-39, and the slide-no-ice addition to D-29's call (1)
(pjpd rationale-ok-cpnp). Docs only.

### 2026-11-12 — No Slide on bare ice (D-29)
The Slide's `on` was `'both'` (plains, ice or water); ice already slides, so a Slide there did
nothing. `BUILDS_ON.both` is renamed `unslick` (plains or water) and the Slide is its only user,
so `legalPlacements('SLIDE')` leaves ice out, `place` rejects it (`ok:false`, nothing changed),
and a Slide can't replace a Thing standing on ice (D-28). R-48's "a Slide on ice still slides"
check, now unreachable, became the placement checks; R-8 spot-checks ice. The Slide's verb line
and README say "plains or water" (pjpd slide-no-ice-nrq5).

### 2026-11-12 — `D` removes the selected hex's Thing (D-39)
`D` used to call `remove` on the hovered hex (`removeHovered`), so a drifting mouse with Go
running took out the wrong Thing. Now `removeSelected` acts on `GameUI.selected` only (the
bare-click selection); with none, or a bare hex, it does nothing, and a successful remove clears
the selection (`commit` now returns whether the command was legal). The hover-bar hint, help
legend, README, CLAUDE.md and U-12 say "select, then D". `B` still blasts the hovered crate
(D-39 follow-up). `uiboot.js` covers it (pjpd delete-sel-rcax).

### 2026-11-12 — Lockstep movement: one hex per hop, all together (D-38)
The tick's movement was rewritten as a lockstep, hop-by-hop simulation (pjpd lockstep-ritf).
Before, each Thing acted in turn (Pushers/Pullers first, then placement order) and ran its
piece's whole `push` (`step` per hex, `passOver`, `comeDown`, `skid`, `bump` → `advance` +
`follow`) before the next Thing looked; a piece blocked by another just stopped, a `moved` set
kept one move per piece, and line moves carried `by`/`byAt` so the client could hold them. That
made outcomes depend on placement order: a Rocket's skid stuck on ice behind a crate a later
Belt carried off, back-to-front Belt trains stalled every other tick, packed rings never moved,
and the UI could draw two crates on one hex. Now every Thing (and wanderer) claims its piece as
the tick starts and gets a *motion* in a phase (`over`, `air`, `ground`, `skid`, `line`,
`follow`, `drop`; `PHASES`, `OPEN_TO`, `ARRIVED`, `STOPPED` in `gameengine.js`); `runHops` runs
hops until every motion stops, each hop proposing, settling same-hex ties (by rank, or a crash
for two flights), resolving occupant chains (3+-cycles rotate, swaps fail), restarting the hop
when a bump starts a line, then applying. Flight lengths are fixed at launch (`flightLength`);
the Cannon's fire check moved to `aimShot`. Events: `move{id, path, hop, over}` (one hex per hop
from `hop`), ends carry `hop` (`blast`/`remove` at hop 0); `by`/`byAt` are gone from moves.
`gameui.js` `startAnim` builds each track as `pts[k]` = hex after hop k and fades an ended piece
over the hop after its end. Decided by the designer (recorded in `pjpd/decisions.md`): blocked
pieces stop for the tick, swaps fail, cycles rotate, ties to placement order, Pushers/Pullers
first and win claims, only two airborne pieces meeting crash, landings trimmed at launch.
New: D-38; D-24, D-33, D-35, D-36, D-37, D-6, Q-1 updated; R-55…R-61 with tests (train, Rocket
skid past a crate carried off, ring, swap, tie, mid-air crash, no two pieces on one hex at any
hop via the new `test/helpers/hops.js`, also checked in `smoke.js`, and on the UI's tracks in
`uiboot.js`); R-7 now tests through a tick (`step` is gone); R-51, R-32, R-33, R-54, R-26, R-44,
R-52 tests updated (path entries per hop, `hop` for `byAt`, gremlins boxed in now that they
wander on hop 1, two big crates a hop apart). ONTOLOGY's Step/Push rules became the Motion rule.
Sims, before → after: `just cc-sim 200 small` 200/200, p10/median/p90 43/49/58 → 41/45/51,
lost/game 2.08 → 0.61, crates on board mean 4.5 → 4.5, peak 8 → 8; `just cc-sim-to 100 small 5`
100/100, median turn per milestone 49/75/103/139/199 → 44/67/90/127/183 (p10 173 → 157, p90 239
→ 210), lost/game 20.13 → 3.14, big crates/game 19.9 → 18.8.

### 2026-11-12 — Hover waits behind an overlay (no-board crash on the intro)
The designer saw "Cannot read properties of null (reading 'has')" right after load, before a
map (pjpd nullhas-7q2s). The intro and size cards are centered panels that don't cover the
canvas, so moving the mouse over the bare canvas ran `onMouseMove`'s hover lookup
`state.hexes.has(...)` while `hexes` was still null (no game until a size is picked). Before,
only `handleClick` honored L5; now `onMouseMove` returns while any overlay is up, so hover and
drag-pan wait like clicks. The other `.has(` sites were checked and can't see null before a
game: `picked.legal` exists only with a pick, `handleClick` already returned on the overlay,
`resize`/`render` test `hexes`, and the engine's `moved` sets are built per tick. uiboot gained
an early-events check (hover, drag, right-click, wheel, leave, resize, keys, timers and frames
on the intro); CRITERIA's test-command line and U-8 updated.

### 2026-11-12 — Every landing skids; the `skids` flag is gone
The designer settled the skid rule: "Basically anything that lands, slides, anywhere. The only
exception is hitting a gremlin stops it in that hex", short Rocket landings included, and
dropped the `skids` flag. Before, only a full-range landing skidded (a flight blocked mid-air,
one backed up off a hex it couldn't land on, and the Cannon's 4th-hex fallback came down dead),
and `skids` was a `THINGS` field (true on Spring, Rocket, Cannon). Now `push` runs `comeDown`,
then the landing checks (new `landingResult`), then the new `skid(piece, dir, path, res, moved)`
from the landing hex if it's slick, for every aloft piece except one that splatted a gremlin,
one that bumped, and a gremlin riding a Rocket. `slidesOnLanding` is gone: `comeDown` running
first is the `canLand` guard. `skids` left every `THINGS` row, `wanderOf`, `actionOf` and the
`how` docs. Board outcomes are unchanged (the hex past a short landing is what shortened it).
D-37 rewritten; D-17, D-15, D-29, D-35, D-36 touched; R-14, R-32, R-53, R-54 rows and tests
updated (new checks: a Spring stepped back off a mountain onto ice, a Cannon's 4th-hex fallback
on a Slide; flipped: a blocked Rocket onto ice); ONTOLOGY's `flies` field and Push rule,
README, DYNAMICS and CLAUDE.md updated. Sims unchanged (small median 49, medium 61).

### 2026-11-12 — Rockets and Cannons skid on landing
The designer asked for pieces thrown by a Rocket or a Cannon to slide on when they land on
ice, as a Spring's landing does (pjpd rocket-skid-v7ky). `THINGS.ROCKET.skids` and
`THINGS.CANNON.skids` went from false to true; `push`'s skid loop needed no kind check. Its
condition now reads the new `slidesOnLanding(piece, cleared)` (`canLand` and `isSlick`) instead
of bare `isSlick`, so a flight that ends over another color's target on ice comes down short
and stays instead of skidding on from the target hex (a latent Spring bug), and it skips a
piece the push splats on landing (`doomed`: a gremlin on a Rocket). Before, a Rocket came down
dead on ice and Slides (D-15, D-17, D-29 (3)). The Cannon's 5th-hex slide was already a ground
slide in the main loop and still happens once. New D-37; D-15, D-17, D-29, D-36 updated;
R-14, R-32, R-48, R-54 rows and tests updated, new `test/R-32/rocket_skid.js`; ONTOLOGY's
`skids` field and Push rule, README, DYNAMICS, CLAUDE.md and the Rocket and Cannon verb lines
updated. Sims unchanged (small median 49, medium 61).

### 2026-11-12 — The Cannon
The designer asked for a Cannon card (pjpd cannon-card-93j7): a facing mover that shoots the
piece on it 5 hexes, passing over everything on the first 4 and moving into the 5th as a
plain ground step. It's a `THINGS` row (`push` 5, `clears` 4, `flies` false, weight 1) and
the last `UNLOCKS` step, after the Rocket. New template field `clears` (0 for every other
kind), carried in the push's `how`: `push` sends the first `clears` hexes through the new
`passOver(piece, dir)` (off the map is the only stop) and the rest through `step` as before.
The D-35 back-up loop moved into `comeDown(piece, path, start, clears)`, shared by every
flight and shot: a shot stopped right after its cleared stretch is still aloft, may come
down only on the last cleared hex (`canLand` with `cleared` also wants no Wall, no other
piece, no open water), and otherwise doesn't fire. Delivery came out of `step` into
`goalFor`/`deliver`, so a shot that comes down on its color's target on the 4th hex is
delivered. New D-36; new R-54 and `test/R-54/`; R-49's test now expects six steps (Rocket at
50 on small, Cannon at 100); R-7's and R-10's rows and R-10's test name the Cannon;
`uiboot.js` checks the banner and news panel name it. ONTOLOGY's `THINGS`, invariant, Push,
Tick and Numbers, README, DYNAMICS and CLAUDE.md updated; new `THING_LOOK.CANNON` and glyph
(a barrel on a wheel, a dotted arc from the muzzle). Sims unchanged (small median 49, medium
61, milestone 5 at 208): the Cannon unlocks at the fifth milestone at the earliest.

### 2026-11-12 — Slides are drawn twice as often
The designer raised `THINGS.SLIDE.weight` from 1 (as a Bridge) to 2 (as a Wall or Spring):
Slides felt rare, since they join the deck only after Pushers and Pullers. ONTOLOGY's weight
row and D-29 (5) updated; R-27's test reads weights from `THINGS`, so it needed no change.
Sims unchanged (small median 49, medium 61): the Slide unlocks after the first milestone.

### 2026-11-12 — A Spring's throw clears mountains
The designer asked that a Spring cross 2 mountain hexes, landing on the third. Before, a
mountain stopped every flight (`canEnter`), so a Spring came down short of it. Now `THINGS`
has an `overMountains` flag (true only for the Spring), carried in the push's `how`;
`step(piece, dir, air)` takes `{flies, overMountains}` instead of a bare `flies` (ground
callers pass a frozen `GROUND`) and lets an `overMountains` flight over a mountain. The
"drop one hex short of another color's target" landing became a loop over the new
`canLand(piece, hex)` (no mountain, no wrong target), so a throw that ends over a mountain
comes down on the last hex short of it, or stays on the Spring. Walls, pieces and bumps
are unchanged; the Rocket is still stopped by mountains. New D-35 (D-17 points to it);
new R-53 and `test/R-53/`; R-7's row and test updated (`step` now takes `air`); ONTOLOGY's
`THINGS`, terrain table, invariant, Step and Push updated; the Spring's verb line, README,
DYNAMICS and CLAUDE.md one-liners touched. Sims unchanged (the bot never throws at a ridge).

### 2026-11-12 — The milestone banner names the cards it unlocked
The designer asked for the milestone report to show unlocked cards. Before, the banner showed
only the milestone (the last `milestone` event of the tick) and any `unlock` opened the news
panel, which held play. Now `gameui.js` collects every `milestone` count of the tick:
`showMilestone(counts, kinds)` titles the banner for the last one, adds "passed A and B" when
several were crossed, and fills a new `#milestone-cards` row with a small picture and name per
unlocked card. `showNews` runs only when a color opened (still listing that tick's cards), so
a cards-only milestone no longer stops play. A shared `cardPicture(kind, px)` draws the card
canvas for both. No engine change. D-30 gained an unreviewed addendum (6); U-11, U-23,
ONTOLOGY's Milestones note and README updated; `uiboot.js` now checks the banner for the
Slide at the first milestone and a two-milestone banner.

### 2026-11-12 — A bump advances the line 2, and the bumper follows; flights bump too
The 2026-11-11 bump stopped the bumper dead and pushed the bumped piece one hex and on along
the ice (a recursive `push` with `BUMP`, so bumps chained), and a flight stopped by a piece
never bumped. Now `bump(piece, dir, moved, byAt)` takes the line from the bumped piece on
(`lineFrom`), steps it `BUMP_ADVANCE` (2, new in `artifacts.js`) hexes far end first
(`advance`, plain `step`s, no slide after), then steps the bumper after it as far as the
bumped piece went (`follow`); the bump ends the bumper's push. `push` calls it from flights
too and lost its `by` argument; `BUMP` is gone; a shared `endEvent(piece, res)` builds the
sink/deliver/trap splat for both. `move` events gained `byAt` (hexes the bumper had entered at
contact; null with `by` on every other move). `gameui.js` holds a line piece until its bumper
reaches the contact hex (`track.hold + byAt`), so line and bumper move together. D-33
rewritten, Q-1 updated (partly answered); R-51 and its test rewritten, R-12, R-26 and R-32 touched (R-26's test
updated for `byAt`).

### 2026-11-12 — Crate cap grows with the square root of board area
`crateCap(size)` used to be max(1, round(area / `CRATE_HEXES_PER_CAP` = 20)): small 8, medium
20, large 45, huge 180, which left large and huge effectively uncapped. The designer chose a
square-root shape: `CRATE_CAP_PER_ROOT` = 0.6 replaces `CRATE_HEXES_PER_CAP`, and
`crateCap(size)` = max(1, round(0.6 × √area)): small 8, medium 12, large 18, huge 36. The
+1 per milestone reached is unchanged. No engine or state change. D-31 updated; R-19 and its
test updated (the test now also pins the four caps).

### 2026-11-12 — D-24 settled: Pushers and Pullers stay first
The designer agreed with the D-24 recommendation. D-24 is now *Decided*; no code change.

### 2026-11-11 — Big crates worth 10
Every spawn used to be a `crate` worth one delivery. `PIECES` gained a `value` field (crate 1,
gremlin 0) and a new row, `bigcrate` (value 10); `artifacts.js` gained `BIG_CRATE_HALF` and
`bigCrateChance(m)`. The engine's new `spawnKind()` picks the spawn's kind (no `Rando` roll
before the first milestone), `step` adds the value to `delivered` and the target's count, and
the new `loseValue(piece)` replaces the `lost++` in sink, wreck and blast. `crateCount()`
still counts pieces. Display: `BIG_CRATE_SCALE`, a `bigcrate` row in `PIECE_LOOK`, and
`PIECE_DRAW`/`SPLAT_COLOR` entries in `gameui.js`. `test/sim.js` takes a third argument,
milestones to play to (`just cc-sim` passes 1; new `just cc-sim-to`). D-34 added; R-52 and
U-26 added, R-15, R-16, R-19, R-37, R-44 and U-10 touched (R-19's test counts cargo).

### 2026-11-11 — Pieces on ice get bumped
A piece stopped by another piece used to be blocked, always. Now a ground step blocked by a
piece standing on slick ground (`isSlick`: bare ice or a Slide) calls the new
`bump(piece, dir, moved)`: the bumper stays, and the bumped piece goes through `push` with a
fixed one-hex ground motion (`BUMP`), so chains run. `push` takes two more arguments, the
tick's `moved` set and `by`; `move` events gained a `by` field (the bumper's id, else null).
The wander loop now checks and marks `moved` as it goes. `gameui.js` holds a bumped piece's
track until its bumper arrives. D-33 added; R-51 added, R-12 and R-26 touched (R-16 and R-26
tests updated for the new `by` field on moves).

### 2026-11-11 — Pushers and Pullers get their color when placed
A Pusher or Puller card used to come in a color rolled at draw time (`cardColor()`, one of the
open colors, equally likely), and the placed Thing took the card's color. Cards are now just
`{kind}`; `draw()` no longer rolls a color and `cardColor()` is gone. `place` takes a fifth
argument, `color`, which must be one of the new query `colorChoices(kind)` (the open colors
for a `colored` kind, `[WHITE]` otherwise). The UI asks for it with a new L5 overlay, `color`
(`#color-panel` backdrop, `#color-picker` swatches, `GameUI.choosing`), opened by a click on a
legal hex when there's more than one choice; `COLOR_PICKER_PX` added to display artifacts. The
sim bot, smoke test and rule tests pass a color. D-32 added, D-22 and D-28 touched; R-50 and
U-25 added, R-6, R-9, R-27 and U-20 updated; uiboot drives the picker.

### 2026-11-11 — Crate spawning caps by board area
`SOURCE_INTERVAL` (a crate every 3 ticks whenever the rolled source was clear, retried each
tick while jammed) became `SPAWN_INTERVAL` (a spawn chance every 3 ticks) plus a crate cap:
`crateCap(size)` = max(1, round(area / `CRATE_HEXES_PER_CAP` = 20)) plus
`milestonesReached(delivered)`, both new in artifacts.js. The engine gained `crateCount()` and
`crateMax()`; `spawnTimer` now resets on every chance. No new state field. `test/sim.js`
also prints mean and peak crates on the board. D-31 added, D-21 touched; R-19 updated.

### 2026-11-11 — Cards unlock one step per milestone
Every kind used to be in the deck from turn 1. A new `UNLOCKS` list in artifacts.js orders the
kinds in steps (Belt/Bridge/Wall/Trap, then Pusher+Puller, Slide, Spring, Rocket); a new game
opens the first step (`GameState.unlocks = 1`) and each milestone opens the next with an
`unlock{kinds}` event, passing over an all-colored step on a one-color board.
`drawableKinds()` filters to the open steps before the D-22 color gate and the weights. The
milestone loop moved into `reachMilestones(before, after)`. The UI's new-color panel became
the news panel (overlay `news`, `#news-panel`), which also names unlocked cards. D-30 added,
D-7, D-22 and D-29 touched; R-49 added, R-6, R-26, R-27 and U-23 updated.

### 2026-11-11 — The Slide card: ice you can build
A new Thing, `SLIDE`, with a new `THINGS` flag `slides` and a new `on` value `'both'` (land
or water). The engine's `isBareIce(hex)` became `isSlick(hex)`: a Thing on the hex decides by
its `slides` flag, otherwise the hex is slick if it's ICE, so terrain ice and Slides go
through the one slide path in `push` (and the Spring's skid). Over water a Slide keeps the
piece from sinking through the existing open-water check. Weight 1; no facing. Added a
glyph and `THING_LOOK`; the sim bot discards Slides. D-29 added; R-48 added, R-7, R-8 and
R-14 updated.

### 2026-11-11 — Placing on a Thing replaces it
A hex holding a Thing used to be illegal for every card: rebuilding it took `D` (remove,
one tick) and then a place (another tick). `canPlace` no longer checks for a Thing, so
`legalPlacements` includes occupied hexes, and `place` takes the old Thing out before
appending the new one, in one tick. The terrain, target, source and blocking checks still
apply as if the hex were bare, so a Bridge on water can only be replaced by a Bridge.
`remove` stays. The UI rings replaceable hexes with a dashed yellow line, hides the Thing
under the ghost, and the hover bar says "click to replace". D-28 added; R-47 added, R-8,
R-9 and U-3 updated.

### 2026-11-11 — The Bridge carries what's on it
A Bridge used to be a facing-less fixture: water a piece could stand on, where a pushed crate
stopped. It's now a mover with `push: 1`, a Belt built on water: it turns on click, places
with a facing, shows the selection arrow, and pushes the piece on it each tick through the
usual `step` (so one aimed at open water sinks the crate). Only the `THINGS.BRIDGE` row
changed in the engine; the glyph gained a chevron over faint planks, darker ink, and a new
hover line. D-27 added, D-5 touched; R-46 added, R-10 and R-15 updated, U-9 updated.

### 2026-11-11 — Pushers and Pullers only once two colors are open
Pushers and Pullers used to be drawn from the start, in the one open color, where they
only acted like white Things. They now stay out of the deck until a second color opens,
so a board with one color (small) never deals them; the other kinds' shares grow to fill.
`draw()` picks from `drawableKinds()`. D-22 and R-27 updated.

The new draws sent the smoke test down a path that turned up an old bug: a Wall could be
built on a source (Things may sit on one), and the source still spawned a crate inside it.
Walls can no longer be built on a source (the crates must flow); other Things still can.
`canPlace` checks it; R-8 updated and covers it.

### 2026-11-11 — Enter toggles Go
Enter used to be a Wait, the same as the Wait button. It now calls `toggleRun()`, like the
Go button: it starts Go, and pressed again it turns Go off, letting the tick already
animating finish. The Wait button still does one tick; Space is unchanged. U-8 and U-13
updated; uiboot covers it.

### 2026-11-11 — Intro and keys legend are two panels; Help button
The intro used to carry the story, the full key list and the size picker in one card. Now
the intro is the story and the sizes; picking a size from it opens the keys legend (new
`help` overlay, closes on a click or any key). A Help button in the HUD shows the same
legend any time; like every overlay it holds Go, which picks up when it closes. The legend
now lists select/turn, Space and Enter as they work today. U-24 added; uiboot covers both.

### 2026-11-11 — Space is "one tick, then stop"
Space used to be the same Wait as Enter, which did nothing useful while Go ran. It is now
`GameUI.oneTick()`: with Go off it's a Wait; with Go running it turns Go off and the tick
already animating finishes. Enter and the Wait button are unchanged. U-8 updated; uiboot
covers it.

### 2026-11-11 — Click selects a hex before it turns
Clicking a moving board to turn a Belt was confusing, since the tick could shift things
under the cursor. A bare click now selects a hex (`GameUI.selected`): a white outline, a
white arrow along a mover's facing, and Go holds while it's selected. A second click on it
turns the mover (`rotate`, still no tick, D-19); a click elsewhere or Esc deselects and Go
resumes. Selecting and turning are allowed mid-animation. U-6, U-8, U-13 updated; uiboot
covers it.

### 2026-11-11 — Pushers and Pullers only in crate colors, and rare (D-22)
`cardColor()` no longer offers white: a colored kind takes one of the open colors (the only
one on a single-color board). `PUSHER` and `PULLER` weights went from 2 to 0.5 each, since
about one per color is enough. R-27, U-20, D-22, ONTOLOGY Draw rule and Numbers updated.
`just cc-sim 200 small`: 200/200, median 58 → 51, 2.60 lost/game. The bot discards
Pushers and Pullers, so this mostly measures more Belt draws (R-6 updated for colored cards).

### 2026-11-11 — A new color opens a panel that waits for the player
The milestone banner no longer lists opened colors; an `open` event now shows the `color`
overlay (swatch, name, "click or press any key to continue"), which holds Go until dismissed.
Overlay keys dispatch through `OVERLAY_KEYS`. U-19 trimmed, U-23 added; uiboot covers it.

### 2026-11-11 — Idle ticks redraw a card (D-26)
New state field `idleTicks` and constant `IDLE_REDRAW_TICKS`. The tick's `first` input gained
`usedCard` (`CARD_FIRST` for place and discard, `NOTHING_FIRST` and the remove/blast inputs
false); at the threshold the tick redraws one random slot and emits `redraw{slot}`. The UI
flashes that card. R-45 and U-22 added.

### 2026-11-11 — `blast` command blows up a crate (D-25)
New engine command `blast(q, r)`: removes the crate there, `lost` +1, then ticks with its
`splat` first. The UI binds `B` to the hovered hex, and the help lists it. R-44 and U-21 added.

### 2026-11-11 — Pushers and Pullers act first in the tick (D-24)
The tick loop used to run every Thing in placement order, so a Pusher or Puller placed after
the Belt line beside it never acted (the Belt moved the crate first, R-13). Now Things with
`shove` or `pull` run first, then the rest, each in placement order. R-43 added.

### 2026-11-11 — Trapped gremlins counted apart from Ex-gremlins (D-18)
New state field `trapped`; `exGremlins` no longer includes Trap kills (it still counts sinks,
Rocket splats and target kills). Every `splat` event gained `trap` (true only for a Trap
kill), and the tick counts both from events; new query `isTrap(hex)`, which `trapsPiece` now
uses. The tally has a Trapped row. R-36 reworded, R-42 added; U-10 and U-17 name Trapped.

### 2026-11-11 — The Pusher, colored Pushers and Pullers, gremlins die on targets (D-22, D-23)
New kind `PUSHER` and two new template fields on every `THINGS` row: `shove` (hexes it pushes
the piece on the hex it faces, in its facing) and `colored` (Pusher, Puller). Things gained
`color` (`WHITE` or a crate color, new constant `WHITE`), and the hand changed from kinds to
`{kind, color}` cards: `draw()` now returns a card, `drawKind()` is the old weighted pick,
and `cardColor()` rolls a colored kind's color once 2+ colors are open. The tick skips a
Thing's piece when `affects(thing, piece)` is false. `actionOf` builds `how` once and has a
shove branch. `trapsPiece` now also kills a splatting piece on any target, which replaces
"a gremlin on the target stays and blocks crates". UI: Pusher glyph (a ram), colored kinds
draw their accent from `COLOR_INK` (the Puller's teal became white), and card names read
"Red Pusher". The pjpd task colorthings-3nq7 is done. Measured one change at a time: the
Pusher alone took `just cc-sim 200 small` from 185/200, median 65 to 184/200, median 70; then
the target kill took it to 200/200, median 57, 3.2 lost per game (medium 200/200, median 73).
New R-40, R-41, U-20; R-10, R-16, R-27 reworded.

### 2026-11-10 — Colors: each milestone opens a new crate color with its own target (D-21)
`GameState.source`/`target` became `sources` (`{q, r, colors}`) and `targets`
(`{q, r, color, delivered}`). `MAP_SIZES` rows gained `colors` (1/2/3/4) and GameArtifacts
gained `ENHANCE_CHANCE` (0.5). `CRATE_COLORS` used to be cosmetic; now the first color is
rolled at New Game (the same random call that used to color the first crate), and each
milestone runs `openColor()`, emitting the new `open` event. A spawn rolls an open color
every ready tick (it used to roll only when the source was clear), so the random stream
after a jam differs from before. `step` blocks a crate at another color's target on the ground
and delivers only at its own; `push` drops a flight one hex short of a wrong target.
`placeSourceAndTarget` returns the hexes and `endSlice`/`freeEndHexes` share the slice
logic with `openColor`. UI: targets ringed in their color (`TARGET_COLOR` removed), source
pips, `#color-info` per-color tally, the banner names opened colors. New R-38, R-39, U-19;
R-4, R-5, R-6, R-8, R-16, R-19, R-26, R-30, R-32 reworded. `just cc-sim 200 small` 183 →
185/200, median 65 unchanged (the random stream moved; the bot stops at the first milestone,
before any color opens).

### 2026-11-10 — Gremlins scale with board area (Q-5 settled by D-20)
`GREMLIN_DICE_COUNT` (1 on every size) became `GREMLIN_HEXES_PER_DIE` (160, the small
board's area) and `gremlinDice(size)` in GameArtifacts, which rolls one die per that many
hexes, rounded: 1, 3, 6, 23 dice for small, medium, large, huge. `MAP_SIZES` moved out of
the GameArtifacts return literal into a const so `gremlinDice` can read it. Small boards are
unchanged roll for roll (the sim matches exactly). R-6 now checks every size. Measured one
change at a time with `just cc-sim`: medium 195/200, median 65 → 183/200, median 84;
large 196/200, median 81 → 187/200, median 110; huge 50/50, median 142 → 42/50, median
226 (lost per game 5.0 → 13.2, 2.4 → 14.4, 1.6 → 30.6).

### 2026-11-10 — Turning a mover no longer ticks (Q-2 settled by D-19)
`rotate` used to turn the facing and then run a tick like every other command; now it
returns `{ok: true, events: []}` and changes nothing else. Q-2 ("clicking a mover spends the
turn") is settled by D-19, and D-1 now reads "every command but turning a mover". The UI's
`rotate` no longer goes through `commit()` (no snapshot, no animation): it plays the cue
and re-renders. R-10 rewritten (no tick, Rocket added), the smoke test expects no turn
change for rotate, and the ONTOLOGY invariant, rotate rule and commands table, DYNAMICS
turn structure, README, intro keys and CLAUDE.md updated. `just cc-sim 200 small` is
identical (183/200, median 65).

### 2026-11-10 — Gremlins wreck crates they step onto
New piece template field `wrecks` (gremlin yes, crate no) and a `wrecks` field on the push's
`how` (false for every Thing; the piece's own value for a wander, so the shared `WANDER`
constant became `wanderOf(piece)`). A wandering step blocked by cargo removes it (`lost` +1)
and takes the hex, emitting `splat{id: crate, by: gremlin}`; `splatVictim` became
`victim(piece, dir, isVictim)` for both. `wanderDirs` treats a crate's hex as open. The
client colors a splat by kind (`SPLAT_COLOR`), and the tally's lost line now reads "N crates
lost" since not all of them sank. D-8 rewritten; R-37 and U-18 added; R-18 reworded;
R-16's blocking test now checks events, since its pinned gremlin wanders back onto the crate.
One change, measured alone: `just cc-sim 200 small` went from 187/200, median 53, p90 73,
0.15 lost per game to 183/200, median 65, p90 247, 11.5 lost; medium 195/200, median 65
(was 196, 57); large 196/200, median 81 (was 198, 76); huge 50/50, median 142 (was 132).

### 2026-11-10 — The Trap, the ex-gremlin count, and a top-right tally
New Thing `TRAP` (weight 1, as ROCKET) with a new template field `traps` on every row: a
piece that splats dies when it comes onto the hex (`step` returns `'trapped'`; a flight
checks only its landing hex) and the kill is a `splat` with `by` null, so it re-emerges
through the existing Emerge rule. New state field `exGremlins`, counted in the tick from the
same gone kinds that feed `emerge`. The Delivered meter and lost count moved out of the
top-left HUD into a new `#tally` panel at the top right, with Ex-gremlins; the lost line now
reads "N crates lost at sea" and hides at 0. D-5 grew to seven kinds; D-18, R-35, R-36,
U-17 added; U-9 and U-10 reworded. Adding a kind changes the draw table, so a seed now
deals different hands than before. `just cc-sim 200 small` went from 187/200, median 51, p90 76, 0.17
lost to 187/200, median 53, p90 73, 0.15 lost: the bot throws Traps away, so a Belt is a
slightly smaller share of each draw (D-7 evidence updated).

### 2026-11-10 — History and rationale swept out of code comments and ONTOLOGY
Provenance and "why" notes moved here or to their decision. `sound.js` is adapted from
`../../warrior/sound.js` (its 12.5% pulse wave and pentatonic cues). `Piece`, `Board`, the
UI's hover/pan/drag fields, and the board-wargame look came with the Hex & Counters fork;
ONTOLOGY now defines them directly instead of saying "from the base", and `board.js` no longer
describes other games extending it. Module comments that argued for the server-portable split
or the double-click rule (`index.js`, `gamestate.js`, `gameengine.js`, `index.html`) now cite
D-9, and `RUN_GAP_MS` no longer explains itself (D-13 does). Stale base-game wording was
fixed along the way: the CSS meter comment described the base's "progress to end" for the
player counter, the accent was the base's reachable-hex yellow, and the sound cues named
footsteps, end of turn, and victory (now: turning a mover, Wait, game start and milestones).
The shared libraries carried history too: `colortheory.js` is ported from a Scala
ColorWheel/Schemes/Colors library, and `hex.js`'s `Hex` class replaced the base's free
`hex*(q, r)` functions; their comments now just describe them.

### 2026-11-10 — Review against the ontology: remove's emerge moved into the tick
A code-vs-ONTOLOGY review found one behavior mismatch. `remove` sank a piece left on a removed
Bridge, ticked, then ran a second `emerge` for it, so its newcomer's `spawn` came after the
tick's `milestone` (the events table says milestones come last) and after the tick's own
emerges. Now `tick(first)` takes what the command did first (`NOTHING_FIRST`, or remove's
sink and its kind): the sink leads the events and its kind joins the tick's one `emerge`,
first. Added `test/R-31/remove_emerge_order.js` (fails on the old code); R-31 and the
Emerge/Commands rules reworded. The sim is unchanged (the bot never removes). Also fixed
stale comments (`piece.js` still described the base's player and enemies; `index.js` said four
modules) and ONTOLOGY's view-state table (`picked` has no `facing`; the ghost's facing is its
own field) and terrain table (flying over water).

### 2026-11-10 — Spring landings skid on ice again
The designer wanted flying Springs to keep sliding on ice. `THINGS` gained `skids` (Spring
yes, Rocket no): a flying push that runs its full range onto bare ice slides on, on the
ground (so a skid into a lake sinks). Ice under the flight still counts toward the range.
D-17 rewritten, R-14 updated; `isBareIce` factored out of the push. Small boards: 187/200,
median 51, p90 76, 0.17 lost (was p90 75, 0.14 lost with dead landings).

### 2026-11-10 — Springs fly; Bridges drawn half as often
At the designer's request `SPRING` got `flies: true` (**D-17**): a Spring's throw now
clears inland water, counts ice hexes, and doesn't skid on landing (it used to sink in any
water, get free ice hexes, and slide on landing). Bridge weight went from 2 to 1 (D-7).
R-14 and R-15 updated (R-15 gained `flying_over_water.js`). Controlled steps on small
boards: before 187/200, median 52, p90 73, 0.17 lost; flying Springs 186/200, median 53,
p90 74, 0.12 lost; plus Bridge weight 1, 187/200, median 51, p90 75, 0.14 lost. Other sizes
in RATIONALE D-3.

### 2026-11-10 — Rocket range capped at 8
The designer found unlimited flight felt like cheating: `THINGS.ROCKET.push` went from
`Infinity` to 8. A flying push now counts every hex and doesn't slide on ice (with a finite
range, free ice hexes would have stretched it). D-15 and R-32 updated. The sim is unchanged,
since the bot discards Rockets.

### 2026-11-10 — Rocket flights cross inland water
At the designer's request only the outer sea stops a Rocket's flight; it used to sink in any
open water. `THINGS` gained `flies` (Rocket only). `step` takes `flies` and lets a flying
piece over inland open water; `push(piece, dir, n, splat)` became `push(piece, dir, how)`
with `how = {n, splat, flies}` (gremlin wandering uses a `WANDER` constant). A flight stopped
above inland water comes down and sinks. D-15 and R-32 updated. The sim is unchanged, since
the bot discards Rockets.

### 2026-11-10 — The Rocket (with splats) and a Discard spot
The designer asked for a Rocket card that blasts a crate as far as it will go and splats
gremlins, choosing splats both ways (the gremlin a flier hits, and a gremlin it launches)
and re-emergence for splatted gremlins (**D-15**). `THINGS` gained `splat` and the
`ROCKET` row (`push: Infinity`, weight 1); `PIECES` gained `splats` (gremlin yes).
`push(piece, dir, n)` became `push(piece, dir, n, splat)`, and a new `splat{id, by}` event
feeds `emerge` alongside `sink`. The designer also asked for a Discard spot that throws away
the picked card and ticks (**D-16**, settling **Q-3**): new `discard(slot)` command, a
Discard button after the cards, and `X`. Added R-32 (flight), R-33 (splats), R-34
(discard), U-15, U-16; R-31 now covers splats; R-25, R-26 and the smoke walkthrough cover
the new command and event.
`test/sim.js` now throws unusable cards away with `discard` instead of building them
somewhere harmless. Controlled steps on small boards: Rockets off, old bot 187/200, median
50, p90 69 (unchanged); discarding bot 187/200, median 51, p90 76; with Rockets (weight 1)
187/200, median 52, p90 73. Other sizes moved too (RATIONALE D-3).

### 2026-11-10 — Board size picked at New Game: 16×10, 20×20, 30×30, 60×60
The designer asked for a size panel on New Game. `MAP_COLS`/`MAP_ROWS`, `HEIGHTMAP_SIZE` and
`KNOWN_GOOD_SEED` were replaced by `MAP_SIZES` rows (`cols`, `rows`, `heightmap`,
`knownGoodSeed`); 60 × 60 samples a 65 heightmap and the others keep 33. `newGame(seed)`
became `newGame(seed, size)`, recording `state.size`; an unknown size is `ok:false`. D-3
rewritten (it was one small board that always fits); D-11 now falls back per size.
R-1, R-2, R-5 and R-23 now run at every size; R-25 checks the size argument; U-2 updated,
U-14 added. On the client the intro's Begin button became the size picker, New Game opens
a second picker that Esc closes, and a board too big for the window opens centered on the
source. `test/sim.js` and `just cc-sim` take the size; the small board reproduces its
figures exactly (187/200, median 50). Opened Q-5 (gremlins don't scale with size).

### 2026-11-10 — Drowned gremlins re-emerge on the shore
The designer asked that a gremlin falling into the ocean be replaced by a new one on an
edge hex. This settles **Q-4** as **D-14**. `PIECES` gained `reemerges` (gremlin yes,
crate no). The new `emerge(sunkKinds)` puts a fresh gremlin (new id, palette color) on a
random shore hex, meaning land next to an edge hex that is free and isn't the source or
target, and emits `spawn`. It runs at the end of each tick and after `remove` sinks a
piece. Added **R-31**; R-15's gremlin case now checks that gremlin is gone rather than
that the board is empty. The sim moved from 191/200, median 49, p90 60 to 187/200,
median 50, p90 69, the only change being gremlins that no longer thin out.

### 2026-11-10 — Endless milestones replace the win; Go/Pause button
The designer asked for goals of 10, 20, 50, 100, "and keep going from there, 200, 500,
1000". The win at `DELIVER_GOAL` (5) is gone, along with `gameWon`, the `won` result flag,
the "after a win" refusals and the victory card. `FIRST_MILESTONE` (10) and
`nextMilestone(n)` (the 1-2-5 series, no last one) replace them, and a tick that reaches a
milestone emits `milestone{count}` (D-2 rewritten). The client shows a banner that hides on
its own. **R-20 retired**, **R-30** added, R-9/R-10/R-11/R-29 lose their won cases, U-8/U-10/
U-11 updated.
The designer also asked for a green Go/Pause button in the top centre (D-13, U-13). It
calls `wait()` `RUN_GAP_MS` after each animation and holds while a card is picked; picking
now works mid-animation so you can step in. `uiboot.js` got a fake `setTimeout` and drives
it. The sim now measures turns to the first milestone, which is twice the old goal, so its
numbers aren't comparable to before: 191/200, median 49, p90 60.

### 2026-11-10 — Colored isometric crates; gremlin counters show 👹
At the designer's request, with colored crates in mind for later, each crate now gets a
`color` from `CRATE_COLORS` (red, green, blue, yellow) when it spawns, through the new
`spawnCrate()` (`Rando.choice`). No rule reads it yet. The client draws crates as a
shaded isometric box from `CRATE_SHADES` and dispatches piece drawing via `PIECE_DRAW`;
`PIECE_LOOK.crate.color` is gone. The gremlin label changed from `'G'` to `'👹'` (the
crate's `'C'` became `'📦'`, which nothing draws now). R-19 now checks the crate color.
The extra `Rando` draw shifts every later roll, so the sim's boards differ:
`just cc-sim 200` gives 192/200, median 38 (was 189/200, median 36 on the old stream).
This isn't a balance change.

### 2026-11-10 — `D` removes a placed Thing
The designer asked for a way to delete a placed item. That replaces the left-out rule that
Things are permanent once placed. The new `remove(q, r)` command takes any Thing off the
board and ticks once, and the card isn't refunded (D-12). A piece left on open water by a
removed Bridge sinks before the tick, so its `sink` event has no `move` before it, and the
client fades it where it stood. Added R-29 and U-12; R-25 now covers `remove`. The smoke
walkthrough also plays random removes now. Q-3 (discarding hand cards) is still open,
since removal spends a placed Thing, not a card in hand.

### 2026-11-10 — Coding-conventions pass: templates for pieces, no default parameters
A review against the coding conventions found kind checks scattered through the code,
default parameters, and duplicated helpers. This was a refactor with no rule changes:
`just cc-sim 200` gives the same 189/200 and median 36 as before.
- **Pieces became templates.** `GameArtifacts.PIECES` (`label`, `cargo`, `wanders`)
  replaced the `kind === 'crate'` checks in `addPiece`, `step`, and the tick's wander loop.
  On the client, `GameDisplayArtifacts.PIECE_LOOK` (hover name, display color) replaced
  `CRATE_COLOR`.
- **Thing glyphs are a dispatch table.** `GLYPHS[kind]` in `gameui.js` replaced the
  `if/else` chain in `drawThing`, and the Wall's full-size tile is now `THING_LOOK.inset`.
- **`newGame(seed)` requires its seed.** It used to roll one with `Math.random` when the
  seed was missing; now that's `{ok:false}`, and the UI rolls the seed. R-22 now says the
  engine never calls `Math.random`, and R-25 checks the seedless call.
- **One placement rule.** `canPlace(kind, hex)` is used by both `place` and
  `legalPlacements`.
- **Events are returned, not collected.** `push()` returns its events and `tick()` gathers
  them, so `engine.events` is gone.
- **Shared helpers.** `aims` moved to `GameArtifacts`. `clockwise`, `counterClockwise`,
  `opposite`, and `same` became static on `Hex`. The neighbour lookup became
  `neighborHex`, and the gremlin-direction scan became `wanderDirs`. An unreachable guard
  in the wander loop was removed.
- **Client:** `render()` reads the clock itself. `drawThing` and `drawCounter` no longer
  take default arguments. `renderHand` redraws only when the hand, the picked card, the
  facing, or the won state changes.
- **Tests and tools:** `uiboot.js` seeds the page's `Math.random`. Its whole-game check had
  been failing on about one board in eight; it now plays the same boards every run. Added
  the `just cc-test` / `just cc-sim N` recipes and the project-local `thingfactory-tools`
  skill.

### 2026-11-10 — Spinner replaced by the Puller
The Spinner (a belt that turned clockwise every tick) was mostly a hazard. Crates arrive
about every `SOURCE_INTERVAL` (3) ticks, so it pushed every other crate backwards. The
designer replaced it with the **Puller**: it reaches across the near hex and pulls the piece
on the far hex into the near hex.
- `THINGS`: the `spin` field became `pull`; `SPINNER` became `PULLER` with the same weight.
- The engine's tick loop now goes through `actionOf(thing)`, which picks which piece a Thing
  moves, which way, and how far. Pushers and pullers share the one `push`/`step` path.
  Rotate works on any Thing with a facing. The `spin` event is gone.
- **R-17 retired** (Spinner); **R-28** added (Puller); R-10 and R-26 updated.
- `test/sim.js`: the bot no longer uses Spinners as belts. It discards Pullers facing away
  from its path, and `NOSPIN` is gone. `node test/sim.js 200` → 189/200 won, median 36.
  The earlier 192/200 was the `NOSPIN=1` run with different draws, so the two can't be
  compared directly.

### 2026-11-10 — Forked from Hex & Counters; became Thing Factory
Copied from `ideas/hexandcounter` (the base platform) and turned into a different game.
The designer chose **Thing Factory** over three other pitches, then settled three forks:
place-then-tick (D-1), deliver N crates with no time limit (D-2), and a board that fits on
one screen (D-3).

What changed from the base:
- **Removed:** the player counter, MP, reachability, `movePlayer`/`endTurn`, the progress
  meter, and the forest/scrub/hills/rough terrains.
- **Added:** Things (`THINGS` templates in `GameArtifacts`), crates, a source, the hand,
  the tick, and the `place`/`rotate`/`wait` commands, which return events. Added ICE
  terrain and gremlins (the base's enemies, now pushable and drownable).
- **Map:** 60×40 → 16×10; the heightmap shrank from 129 to 33.
- **Client:** animates each tick from events (the base re-rendered from state), adds a
  hand of cards, and new sound cues (place, deliver, sink).
- **Docs:** a fresh ID namespace. These IDs don't map to the base's R-/D-numbers.
- **Tests:** every `test/R-n/` was rewritten for the new rules (R-1…R-27). Added
  `test/sim.js`, a greedy builder bot used as the tuning harness.

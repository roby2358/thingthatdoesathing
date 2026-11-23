# Thing Factory — Architecture Log

Dated entries, newest first. This is the only doc that records what something used to be. The why of a current decision lives in RATIONALE (D-n); step-by-step detail lives in git history.

### 2026-11-23 — This log pruned
From 108.6 KB to about 31 KB (pjpd prunelog-sjnt): decisions RATIONALE already records became one-liners; kept every date and ID, reversals, measured before → after, incidents and abandoned designs.

### 2026-11-23 — CLAUDE.md slimmed to an orientation page
CLAUDE.md went from 45.6 KB to 11.4 KB (pjpd slimclaude-thps): one line per module and recipe, pointers to ONTOLOGY, README, UI_CONTROLS and RATIONALE. Every removed fact was checked to live elsewhere; the one that didn't (the queue's `whileSameCard` drop) moved to ONTOLOGY.

### 2026-11-23 — The bag crate's outline is heavier (D-84)
`BAG_OUTLINE_WIDTH` 2, scaled with the crate's draw scale (was 1px like every shape): the bag was "a little hard to see". R-116.

### 2026-11-23 — A new color usually gets its own source (D-21)
`ENHANCE_CHANCE` 0.5 → 0.16: a new color shares an existing source 16% of the time. The sims reach the fifth milestone more often (figures in D-21). R-38's 400-seed check replaces the old 40-seed one; D-61's Help line for Milestones follows.

### 2026-11-23 — Crate shapes shuffled per game (D-84 amended)
The color → shape pairing is shuffled once per game from the seed (`crateShapesFor`, `Rando.stream` + new `Rando.mix`, shared with the goal deal); the fixed red-cube/green-cylinder/blue-strapped/yellow-bag map is now only `CRATE_SHAPES_DEFAULT`. Help's World pictures are redrawn per game (they would have kept the default). R-117, U-46.

### 2026-11-23 — Each crate color has its own shape (D-84)
Cube, cylinder, strapped cube, bag; before, every crate was the shaded isometric cube. R-116, U-46. (Also U-26.)

### 2026-11-23 — The Discard button discards the whole hand (D-83)
New `discardAll()`: every slot redrawn, one tick, telemetry hears three `discard` records (`how: 'all'`). Before, the button discarded only the picked card, like X. R-114, R-115, U-45; U-15 retired; D-16 now names X alone.

### 2026-11-23 — Five counter scales from the first telemetry (D-74)
From the first production report (one player reached 500 Spring throws and hexes slid and 200 mountains flown over within a few sessions; Cannon lobs 50, Rocket flights 20): `springThrows`, `slides`, `mountainsFlown` scale 10 → 100; `cannonLobs`, `rocketFlights` 1 → 10. Goals that dealt 50 or 100 now deal 500 or 1000; 5 or 10 now 50 or 100. R-79, R-85. (Also R-70, R-74, R-97, R-98, R-108.)

### 2026-11-23 — The selection hint (D-82)
`#select-hint` says what a selected hex allows; before, the Go hold a selection causes was invisible (the designer couldn't tell why Go stopped). R-113, U-44.

### 2026-11-23 — Gremlins lunge (D-81)
`GREMLIN_LUNGE_CHANCE` 0.16: a gremlin beside a crate may jump onto it and smash it before claims. Before, it smashed only by its own wandering step, so one riding a Belt never did. Seeded play shifts; the sims are slower and lose more (figures in D-81). R-112.

### 2026-11-23 — "Hexes slid" counts every slick hex a crate slides off (D-74)
Reversal of D-52's slick-to-slick count for the counter: `slides` now counts each slick hex a crate leaves by sliding (skids, D-33 bump lines included), not gremlins, not powered steps. Before, a crate skidding off ice onto plains or into water counted nothing. The `slid` cap is unchanged, so play is too. R-81.

### 2026-11-23 — A Cannon's lob counts its mountains (D-74)
Reversal of D-74 call (3): `mountainsFlown` also counts each mountain a Cannon's lob passes over (before, only a Spring's flight). R-81.

### 2026-11-23 — No Bomb goals (D-75)
`bombs` `goal` false (a rare, last-unlocked card made a dead goal slot); the pool went 15 → 14 counters, so a seed may deal different sets than before; `GOAL_COUNTERS` refuses it. R-79, R-85. (Also R-70, R-74, R-86, R-87, R-97, R-98.)

### 2026-11-23 — Gremlin counters on a scale of 100 (D-74)
`exGremlins` scale 1 → 100 (ex'd en masse by Bombs, Rockets and slide-bump splats; 10 was weighed), then `trapped` 1 → 100 to match: their goals deal 500 or 1000, not 5 or 10. R-79, R-85. (Also R-70, R-74, R-86, R-97, R-98, R-103, R-105, R-106, R-107, R-108, R-109, R-111.)

### 2026-11-22 — Telemetry on achievements (D-80)
Rung records join the batch (additive, format stays 1); new `rungs` table (production's at the designer's go, before deploying this Worker). R-109, R-110, R-111. (Also R-70, R-74, U-33.)

### 2026-11-22 — Achievements in the browser (D-79)
`achievements.js`, the rung banner, the Goals view's Achievements page; before, `POST /achievements` had no client and `rungsReached` was never counted. Fixed on the way: index.css's `--met` was `var(--met)`, so the met green never showed. R-102…R-108, U-43. (Also R-92, R-94.)

### 2026-11-22 — Achievements on the server (D-78)
The `PlayerTotals` Durable Object and `POST /achievements`; wrangler.jsonc's binding with migration v1. Not deployed: production needs the migration at the designer's go. R-99, R-100, R-101, U-42. (Also R-68, R-70, R-74, R-75, R-77.)

### 2026-11-22 — Goals: engine, screen, telemetry (D-75, D-76, D-77)
Goals dealt from `Rando.stream` (no shared draw; `cc-sim 200 small` unchanged), checked last in every tick, re-dealt with no tick (D-75, R-85…R-89); the goals panel, Goals view, goal banner and goals-met panel, Help's sixth page (D-76, R-90…R-95, U-41); goal-set and goal-met records, tables `goal_sets` and `goals_met` (D-77, R-96, R-97, R-98). (Also R-70, R-74, R-91, U-24, U-33.)

### 2026-11-22 — Per-game counters and the ladder (D-74)
`COUNTERS` (22 rows), the 1-2-5 ladder, `GameState.counts`; `loseValue` takes its cause. CLAUDE.md's stale "`RULES_VERSION` is 2" line fixed (D-65). GameState's own field list renamed `TALLIES` (was `COUNTERS`). No rule or Rando change; `cc-sim 200 small` unchanged. R-79…R-84.

### 2026-11-21 — RULES_VERSION back to 1, and it stays 1 through development (D-65, D-73)
Reversal: `RULES_VERSION` was to be bumped with every rule change, and D-73 took it to 2. Now it stays 1 in development (the commit hash tells builds apart) and changes only for a drastic break, at the designer's call. Production games recorded between the D-73 deploy and this one carry `rulesVersion` 2.

### 2026-11-21 — Walls stop a Spring's throw again (D-73, superseding D-62)
Reversal of D-62 the same day: the `overWalls` flag is gone and a Wall ends every flight on the hex before it; only the Cannon's cleared hexes pass over Walls (D-36), and the Spring still clears 2 mountains (D-35). R-67 rewritten in place. `cc-sim 200 small` unchanged. (Also R-7, R-12, R-15, R-53.)

### 2026-11-21 — Production's telemetry tables recreated; `just local-d1-clear` (D-64)
Production's tables, first applied without the four `delivered_<color>` columns, were checked empty, dropped and re-applied with `just d1-production` (pjpd prodtables-3xzh). New `just local-d1-clear` does the local equivalent.

### 2026-11-21 — deliveredByColor moves out of rest into four INTEGER columns (D-64, D-65)
Before, a `{color: n}` map inside each event and milestone row's JSON `rest`, about 40 bytes of mostly key names per row. Now a 4-number array in `CRATE_COLORS` order, bound to `delivered_red/green/blue/yellow`; `rest` nullable. Format stays 1, changed in place: nothing deployed, no portal build had shipped telemetry. No ALTER migration: local D1s recreated; production's tables recreated by hand (entry above).

### 2026-11-21 — events loses its events_by_command index (D-64)
D1 counts a written row per index per event, and the report never filters by command, so the index bought nothing; the schema now drops it.

### 2026-11-21 — Event seq comes from the browser (D-64, D-65, D-67)
Before, the Worker numbered each event with `SELECT COUNT(*)` in its INSERT: a game of n events read about n²/2 rows (a 1000-move game ~500k, against D1's free 5M a day), and a resent event was numbered again. Now the recorder sends `seq` (kept across the sign-in redirect's save) and the insert is `INSERT OR IGNORE`. Format stays 1, changed in place (nothing deployed).

### 2026-11-21 — Telemetry report: Volume section; `just telemetry-local` (D-66, D-72)
The report's Volume section measures rows written per day and DB size against D1's free plan (D-72). The local report became its own recipe; `telemetry-report` reads production only (D-66).

### 2026-11-21 — Crash reports (D-71)
crash.js sends one crash record by sendBeacon under telemetry's rules; before, the `crashes` table stayed empty unless a player wrote in. R-78, U-40.

### 2026-11-21 — POST /t rate limit and Origin allow-list (D-70)
Before, any site could post from its visitors' browsers and a loop could flood D1. Now an Origin allow-list (403) and a rate-limit binding keyed by IP (429), both before the body; the recorder backs off on either. R-77, U-39.

### 2026-11-21 — R-76 waits for the redirect, not 10 turns
Test flake: R-76's fixed 10 event-loop turns were sometimes outrun by the real WebCrypto digest in `GameSignIn.begin()` under the full suite; the redirect checks now poll with `until()`.

### 2026-11-21 — Sign out (D-69)
Before, a sign-in lasted until its token expired, with no way out but clearing `thingfactory.auth` by hand. U-38.

### 2026-11-21 — Optional "Sign in with Bluesky" (D-68)
`signin.js` runs auth/'s code + PKCE flow; the Worker gains `POST /auth/token`, `identityFor` (salted sub hash, `signed_in` 1), the vendored auth-client and its first npm dependency (cbor-x 1.6.4). The return marker moved from a query parameter (`SIGNIN_RETURN_PARAM`) to the OAuth state's `SIGNIN_STATE_PREFIX`. The privacy page changed from "No cookies, no account, no IP addresses kept, no personal data." to "… We don't keep your handle. No cookies, no IP addresses kept." R-74, R-75, R-76, U-37; D-59's privacy wording and D-67's marker follow.

### 2026-11-21 — The game is saved around the sign-in redirect (D-67)
`saveForRedirect`/`restoreSaved`, `GameState.toJSON`/`fromJSON`, `Rando.state`/`setState`. Before, only the mute setting was stored and `SAVE_KEY` was just a name for Start fresh. The privacy line "Map saves are planned." became "…and your game while you sign in." R-71, R-72, R-73; D-59 follows.

### 2026-11-21 — Telemetry report (D-66)
`just telemetry-report` (plain Node, read-only SELECTs through wrangler); before, the tables could only be read with hand-written SQL. R-70.

### 2026-11-21 — Privacy page describes the telemetry as built (D-59, D-65)
Before, About described telemetry not yet built, "tied to a hashed ID"; now "a random ID made fresh each time you open the game", and Global Privacy Control turns it off (pjpd privacydocs-ntj5).

### 2026-11-21 — Telemetry: the browser recorder and POST /t into D1 (D-64, D-65)
ttdat stopped being an assets-only Worker: `worker/index.js` routes `POST /t` into D1 (four tables; D-64, R-68, U-35). `telemetry.js` records each game from the first board pick, ship builds over http(s) only, never under GPC, with `RULES_VERSION` 1 (D-65, R-69, U-36).

### 2026-11-21 — Crash screen (D-63)
Before, an uncaught error left a frozen canvas. `crash.js`, loaded first so a throw while a later script loads is caught too (the task had put the handlers in index.js). U-34.

### 2026-11-21 — Stale text
The README and U-31 still said a 3-boom Bomb; the big crate's hover had "worth 10" typed in, now read from `PIECES`.

### 2026-11-21 — A Spring leaps Walls (D-62)
A Spring's throw treated a Wall like a mountain (`overWalls`). Reversed the same day by D-73 (above). R-67. (Also R-7, R-12, R-15, R-53.)

### 2026-11-21 — Help becomes a pager: Keys, More keys, Special cards, Things, World (D-60, D-61)
Help was one page of keys. It became a `Pager` shared with About, with a Things page (D-60), then a World page whose numbers come from GameArtifacts (D-61), then World pictures drawn by the board's own code (D-61), a Special cards page (D-60), and Keys split in two because it was too tall (D-60). Verb lines rewritten (the Spring "leaping over lakes and mountains"); `doesnumbers.js` ties their numbers to the rules data. (Also U-24.)

### 2026-11-21 — A network layer is no longer a non-goal
Dropped from ONTOLOGY's non-goals: the game was working toward telemetry, and later optional login and achievements.

### 2026-11-21 — About panel (D-59)
Credits and privacy pages; before, no credits screen and no in-game version. U-33. (Also U-14.)

### 2026-11-21 — Unlisted screencap key (D-58)
P saves PNGs at the listing sizes; `render()` split into `paint(clean)` and `updateHUD()`.

### 2026-11-21 — Ship build
The game moved to its own repo with a fresh history (it was yuwakisaweb/thingthatdoesathing up to 122ba86). `just ship` builds `dist/web` from only what index.html loads; before, the whole folder (docs, tests, backlog) was served. `just deploy` deploys it as an assets-only Worker at ttdat.yuwakisa.com. LICENSE (MIT).

### 2026-11-17 — ONTOLOGY checked against the code; conventions pass
Doc-only pass (the non-goal "picking a Thing back up" now means getting a removed Thing's card back, D-47; the view-state table caught up with D-41, D-49, D-53, D-55). A coding-conventions pass over the D-49–D-57 work changed no behavior.

### 2026-11-17 — The slide cap counts slick-to-slick moves (D-52 amended)
`MAX_SLIDE` was 4 free slick hexes counting the first one entered, so a Belt push covered 4 slick hexes but a skid or a piece already on ice 5. Now only slick-to-slick moves count and `MAX_SLIDE` is 3: at most 4 slick hexes in a row. R-32's long-ice Rocket stops at 10, not 11. `cc-sim 200 small` unchanged (median 94).

### 2026-11-17 — Small UI decisions (D-53, D-55, D-56, D-57)
Sound button and `M` mute (D-53); refused clicks and keys say why (D-55); meta description, Rocket favicon, link-preview tags (D-56); game keys ignore Ctrl/Alt/Meta chords (D-57).

### 2026-11-17 — A sliding gremlin that bumps goes splat (D-54)
Before, it followed its D-33 bump line like any bumper. R-66. `cc-sim 200 small` unchanged (median 94).

### 2026-11-17 — A slide stops on its 4th slick hex (D-52)
Slides were unlimited. `MAX_SLIDE` 4 (amended the same day, above). R-65. Sims unchanged (median 94; milestones 94 / 152 / 250 / 405 / 709). (Also R-14, R-48.)

### 2026-11-17 — Crate cap is a number per board size (D-31)
`crateCap` is `MAP_SIZES.*.crates` (2 / 3 / 4 / 5) instead of 0.6 × √area (8 / 12 / 18 / 36). `cc-sim 200 small` first-milestone median 52 → 94. (Also R-19.)

### 2026-11-17 — The Cannon unlocks before the Rocket (D-51)
`UNLOCKS`: Mover, Cannon, Rocket, Bomb. (Also R-49, R-54.)

### 2026-11-17 — Input: one-action discard and a queue during the tick animation (D-49, D-50)
Commands during a tick animation used to be dropped, so with Go on X mostly missed; now they're queued in one slot (D-49). A card's red × and Shift+1/2/3 discard without a pick (D-50).

### 2026-11-17 — The Bomb card (D-48, D-47)
New `BOMB` tool (`wipes` 3, last in `UNLOCKS`, clearing hexes as D-44's `clearHex` does; R-64, U-31). Amended the same day: it first marked hexes with a red ring and cross and showed nothing until it went off; now each click bursts its hex at once; `wipes` 3 → 5 at the designer's call. A picked tool (Mover, Bomb) now shows its ghost before the pick-up; it showed nothing until the first click, and the Bomb's ghost vanished after its first boom (D-47 amended). (Also R-49, R-54, R-62.)

### 2026-11-17 — The Mover card, and tool cards (D-47)
Cards may be `TOOLS` kinds, not only Things; the UI routes a picked card through `PICK_MODES`. `UNLOCKS` gains a Mover step after the Spring, so the Rocket and Cannon each unlock a milestone later. R-63, U-30. (Also R-27, R-49.)

### 2026-11-17 — Past the sorry page: any-pointer, Try it anyway, Copy link (D-41)
`TOUCH_ONLY_QUERY` also needs `(not (any-pointer: fine))`; the sorry card gains Try it anyway and Copy link. (Also U-28.)

### 2026-11-13 — A crate on its own color's new target is delivered (D-46, D-44)
Before, `clearHex` destroyed it like any piece (D-44 call 6). R-62.

### 2026-11-13 — Big crates: 1% at the start, 5% by the fifth milestone (D-45)
`bigCrateChance` was m / (m + 4): 0 before the first milestone, 20% after it, 56% by the fifth. Now 1% rising to 5% at the fifth, then easing toward 1. The bot's turn to the fifth milestone on small: median 236 → 649 (pjpd bigcrate-odd-755q). R-52.

### 2026-11-13 — A new source or target clears its hex (D-44)
Before, new endpoints took only free end-slice hexes, so a crowded slice could leave no spot and the color waited a milestone. Now a Thing there goes (no card back) and a piece is destroyed. R-62. (Also R-31, R-36, R-38.)

### 2026-11-13 — Crates come from a fixed color cycle, one slot a tick (D-43)
Before, a spawn chance every `SPAWN_INTERVAL` (3) ticks rolled an open color. Now a per-game shuffle of the four colors, one slot a tick, skipped when closed, capped (D-31, unchanged) or blocked. Small's first milestone: median 45 → 53 turns (pjpd spawn-cycle-jisb). (Also R-6, R-19, R-26.)

### 2026-11-13 — Sources and targets fill their hex (D-42)
Before, a glowing ring with an "IN" or ★ label. U-29. (Also U-19.)

### 2026-11-13 — Phones and tablets get a sorry page (D-41)
Before, every browser booted the game. U-28.

### 2026-11-12 — Map scale buttons: 1, 2, ∞ (D-40)
A view scale under one canvas transform; on-map text below `MIN_TEXT_PX` skipped. The first version had a `4` button; in the browser 1/4 came out smaller than the fit, so it went, and ∞ now fits above the hand. U-27.

### 2026-11-12 — Loop decisions reviewed and accepted (D-24, D-27 … D-37)
The designer accepted D-24's addendum and D-27–D-37 as they stood before D-38 (with D-29, D-30, D-31, D-33 review updates). Still unreviewed then: D-38 and its notes (D-6, D-24, D-33, D-35, D-36, D-37, Q-1), D-39, D-29's slide-no-ice addition.

### 2026-11-12 — No Slide on bare ice (D-29, D-28)
A Slide on ice did nothing; it's now plains or water only. (Also R-8, R-48.)

### 2026-11-12 — `D` removes the selected hex's Thing (D-39)
`D` acted on the hovered hex, so a drifting mouse with Go running took out the wrong Thing. U-12.

### 2026-11-12 — Lockstep movement: one hex per hop, all together (D-38)
Before, each Thing ran its piece's whole push in turn before the next looked, so outcomes depended on placement order: a Rocket's skid stuck behind a crate a later Belt carried off, back-to-front Belt trains stalled every other tick, packed rings never moved, and the UI could draw two crates on one hex. Now every Thing claims its piece as the tick starts and all motions advance one hex per hop together (chains, cycles rotate, swaps fail, ties by rank, two flights meeting crash). Decided by the designer (pjpd/decisions.md). D-6, D-24, D-33, D-35, D-36, D-37, Q-1 updated; R-55…R-61. Sims, before → after: `cc-sim 200 small` p10/median/p90 43/49/58 → 41/45/51, lost/game 2.08 → 0.61; `cc-sim-to 100 small 5` median per milestone 49/75/103/139/199 → 44/67/90/127/183, lost/game 20.13 → 3.14, big crates/game 19.9 → 18.8. (Also R-7, R-26, R-32, R-33, R-44, R-52.)

### 2026-11-12 — Hover waits behind an overlay (no-board crash on the intro)
Incident: the designer saw "Cannot read properties of null (reading 'has')" right after load (pjpd nullhas-7q2s). The intro panels don't cover the canvas, so mouse moves ran the hover lookup before any board existed. `onMouseMove` now returns under any overlay, like clicks; uiboot checks early events on the intro. (Also U-8.)

### 2026-11-12 — Every landing skids; the `skids` flag is gone (D-37, D-15, D-17, D-29, D-35, D-36)
Path: earlier the same day, Rockets and Cannons got `skids` true like the Spring (pjpd rocket-skid-v7ky; new D-37), which also fixed a latent Spring bug (a flight ending over another color's target on ice skidded on from the target hex). Then the designer settled it: "Basically anything that lands, slides, anywhere. The only exception is hitting a gremlin stops it in that hex", short landings included, and the flag was dropped. Before, only a full-range landing skidded. Sims unchanged (small median 49, medium 61). (Also R-14, R-32, R-48.)

### 2026-11-12 — The Cannon (D-36)
Shoots its piece 5 hexes, over everything on the first 4, into the 5th as a ground step; last in `UNLOCKS` then. R-54. Sims unchanged (it unlocks at the fifth milestone at the earliest). (Also R-7, R-10, R-49.)

### 2026-11-12 — Slides are drawn twice as often (D-29)
`SLIDE.weight` 1 → 2: Slides felt rare. (Also R-27.)

### 2026-11-12 — A Spring's throw clears mountains (D-35, D-17)
Up to 2 mountains, landing on the third; before, a mountain stopped every flight. R-53. (Also R-7.)

### 2026-11-12 — The milestone banner names the cards it unlocked (D-30)
Before, any `unlock` opened the news panel, which held play; now a cards-only milestone doesn't stop play. U-11. (Also U-23.)

### 2026-11-12 — A bump advances the line 2, and the bumper follows; flights bump too (D-33, Q-1)
The 2026-11-11 bump stopped the bumper dead and pushed the bumped piece one hex and on along the ice (chaining), and flights never bumped. Now the line advances `BUMP_ADVANCE` (2) and the bumper follows. R-51 rewritten. (Also R-12, R-26, R-32.)

### 2026-11-12 — Crate cap grows with the square root of board area (D-31)
The linear cap, round(area / 20), gave small 8, medium 20, large 45, huge 180, leaving large and huge effectively uncapped. Now round(0.6 × √area): 8 / 12 / 18 / 36. (Replaced by a number per size, 2026-11-17.) (Also R-19.)

### 2026-11-12 — D-24 settled: Pushers and Pullers stay first
D-24 *Decided*; no code change.

### 2026-11-11 — Big crates worth 10 (D-34)
`bigcrate` (value 10) and `bigCrateChance(m)` (none before the first milestone; retuned by D-45). New `just cc-sim-to`. R-52, U-26. (Also R-15, R-16, R-19, R-37, U-10.)

### 2026-11-11 — Pieces on ice get bumped (D-33)
A piece stopped by another was always blocked; now one on slick ground is bumped one hex, chaining (reworked 2026-11-12). R-51. (Also R-12, R-16, R-26.)

### 2026-11-11 — Pushers and Pullers get their color when placed (D-32, D-22, D-28)
Before, the card's color was rolled at draw time; now the player picks it at placement from `colorChoices`. R-50, U-25. (Also R-6, R-9, R-27.)

### 2026-11-11 — Crate spawning caps by board area (D-31, D-21)
`SOURCE_INTERVAL` (a crate every 3 ticks when the source was clear) became a spawn chance every 3 ticks under a cap linear in area plus one per milestone (the first cap; see 2026-11-12). (Also R-19.)

### 2026-11-11 — Cards unlock one step per milestone (D-30, D-7, D-22, D-29)
Every kind used to be in the deck from turn 1. R-49, U-23. (Also R-6, R-26, R-27.)

### 2026-11-11 — The Slide card: ice you can build (D-29)
R-48. (Also R-7, R-14.)

### 2026-11-11 — Placing on a Thing replaces it (D-28)
Before, rebuilding took `D` and a place, two ticks. R-47. (Also R-9, U-3.)

### 2026-11-11 — The Bridge carries what's on it (D-27, D-5)
It was a facing-less fixture where a pushed crate stopped; now a Belt built on water. R-46, U-9. (Also R-10, R-15.)

### 2026-11-11 — Pushers and Pullers only once two colors are open (D-22)
In one color they only acted like white Things. The new draws turned up an old bug: a Wall could be built on a source, which then spawned a crate inside it; Walls can no longer go on a source (R-8). (Also R-27.)

### 2026-11-11 — Controls: Enter toggles Go, Space is one tick, click selects before it turns, Help button
Enter was a Wait; now Go on/off. Space was the same Wait (useless while Go ran); now one tick, then stop. A bare click selects a hex and holds Go, a second click turns it, still no tick (D-19; turning a moving board under the cursor was confusing). The intro's key list moved to a Help panel. U-6, U-8, U-13, U-24.

### 2026-11-11 — Pushers and Pullers only in crate colors, and rare (D-22)
No white; weight 2 → 0.5 each. `cc-sim 200 small` median 58 → 51 (mostly more Belt draws; the bot discards them). (Also R-6, R-27.)

### 2026-11-11 — A new color opens a panel that waits for the player
Before, the milestone banner listed opened colors. U-23. (Also U-19.)

### 2026-11-11 — Idle ticks redraw a card (D-26)
R-45, U-22.

### 2026-11-11 — `blast` command blows up a crate (D-25)
R-44, U-21.

### 2026-11-11 — Pushers and Pullers act first in the tick (D-24)
In placement order, one placed after the Belt line beside it never acted. R-43. (Also R-13.)

### 2026-11-11 — Trapped gremlins counted apart from Ex-gremlins (D-18)
R-42. (Also R-36, U-10, U-17.)

### 2026-11-11 — The Pusher, colored Pushers and Pullers, gremlins die on targets (D-22, D-23)
Replaces "a gremlin on the target stays and blocks crates". Measured one change at a time: the Pusher alone took `cc-sim 200 small` from 185/200, median 65 to 184/200, median 70; the target kill then to 200/200, median 57, 3.2 lost/game (medium 200/200, median 73). R-40, R-41, U-20. (Also R-10, R-16, R-27.)

### 2026-11-10 — Colors: each milestone opens a new crate color with its own target (D-21)
`source`/`target` became `sources`/`targets`; `CRATE_COLORS` stopped being cosmetic; `ENHANCE_CHANCE` 0.5. `cc-sim 200 small` 183 → 185/200, median 65 unchanged (the stream moved; the bot stops before any color opens). R-38, R-39, U-19. (Also R-4, R-5, R-6, R-8, R-16, R-19, R-26.)

### 2026-11-10 — Gremlins scale with board area (Q-5 settled by D-20)
One gremlin die per 160 hexes: 1 / 3 / 6 / 23. Small unchanged roll for roll. Before → after: medium 195/200, median 65 → 183/200, 84; large 196/200, 81 → 187/200, 110; huge 50/50, 142 → 42/50, 226 (lost/game 5.0 → 13.2, 2.4 → 14.4, 1.6 → 30.6). (Also R-6.)

### 2026-11-10 — Turning a mover no longer ticks (Q-2 settled by D-19, D-1)
`cc-sim 200 small` identical (183/200, median 65). (Also R-10.)

### 2026-11-10 — Gremlins wreck crates they step onto (D-8)
Measured alone: small 187/200, median 53, p90 73, 0.15 lost → 183/200, median 65, p90 247, 11.5 lost; medium 196, 57 → 195, 65; large 198, 76 → 196, 81; huge median 132 → 142. R-37, U-18. (Also R-16, R-18.)

### 2026-11-10 — The Trap, the ex-gremlin count, and a top-right tally (D-5, D-18, D-7)
`cc-sim 200 small` 187/200, median 51, p90 76, 0.17 lost → 187/200, median 53, p90 73, 0.15 lost (a Belt is a smaller share of the draw). R-35, R-36, U-17; U-9, U-10.

### 2026-11-10 — History and rationale swept out of code comments and ONTOLOGY (D-9, D-13)
Provenance kept here: `sound.js` is adapted from `../../warrior/sound.js` (12.5% pulse wave, pentatonic cues); `Piece`, `Board`, the hover/pan/drag fields and the board-wargame look came with the Hex & Counters fork; `colortheory.js` is ported from a Scala ColorWheel/Schemes/Colors library; `hex.js`'s `Hex` class replaced the base's free `hex*(q, r)` functions.

### 2026-11-10 — Review against the ontology: remove's emerge moved into the tick
`remove`'s sunk piece re-emerged after the tick's `milestone`, against the events order; now its sink leads the tick's events and its kind joins the tick's one `emerge`. R-31.

### 2026-11-10 — Springs: fly, then skid again; Bridges drawn half as often (D-17, D-7, D-3)
`SPRING` `flies` true (clears inland water, no skid); Bridge weight 2 → 1. Then the designer wanted Spring landings to keep sliding on ice: new `skids` (Spring yes, Rocket no), a full-range landing on bare ice slides on. Small boards: before 187/200, median 52, p90 73, 0.17 lost; flying Springs 186/200, 53, 74, 0.12; plus Bridge weight 1, 187/200, 51, 75, 0.14; skidding again 187/200, 51, 76, 0.17. Other sizes in D-3. (Also R-14, R-15.)

### 2026-11-10 — Rocket: range capped at 8, flights cross inland water (D-15)
Unlimited flight felt like cheating (`push` Infinity → 8); a flight sank in any open water, now only the outer sea stops it. Sim unchanged (the bot discards Rockets).

### 2026-11-10 — The Rocket (with splats) and a Discard spot (D-15, D-16, Q-3)
R-32, R-33, R-34, U-15, U-16. `test/sim.js` discards unusable cards instead of building them somewhere harmless. Small boards: old bot 187/200, median 50, p90 69; discarding bot 187/200, 51, 76; with Rockets 187/200, 52, 73. Other sizes in D-3. (Also R-25, R-26.)

### 2026-11-10 — Board size picked at New Game: 16×10, 20×20, 30×30, 60×60 (D-3, D-11, Q-5)
D-3 was one small board that always fits. Small reproduces its figures exactly (187/200, median 50). Opened Q-5. U-14. (Also R-2, R-5, R-23, R-25, U-2.)

### 2026-11-10 — Drowned gremlins re-emerge on the shore (Q-4 settled by D-14)
Gremlins no longer thin out: sim 191/200, median 49, p90 60 → 187/200, median 50, p90 69. R-31. (Also R-15.)

### 2026-11-10 — Endless milestones replace the win; Go/Pause button (D-2, D-13)
The win at `DELIVER_GOAL` (5) is gone: milestones 10, 20, 50, … with no last one. R-20 retired, R-30, U-13. The sim now measures turns to the first milestone, twice the old goal, so not comparable: 191/200, median 49, p90 60. (Also R-9, R-10, R-11, U-8, U-11.)

### 2026-11-10 — Colored isometric crates; gremlin counters show 👹
Crates get a color (no rule reads it yet). The extra `Rando` draw shifts the stream: `cc-sim 200` 189/200, median 36 → 192/200, median 38, not a balance change. (Also R-19.)

### 2026-11-10 — `D` removes a placed Thing (D-12, Q-3)
Things were permanent once placed; `remove` refunds no card. R-29, U-12. (Also R-25.)

### 2026-11-10 — Coding-conventions pass: templates for pieces, no default parameters
No rule change (`cc-sim 200` same 189/200, median 36). `newGame` requires its seed (the engine never calls `Math.random`, R-22). uiboot seeds its `Math.random`: its whole-game check had failed on about one board in eight. (Also R-25.)

### 2026-11-10 — Spinner replaced by the Puller
Abandoned design: the Spinner (a belt turning clockwise every tick) was mostly a hazard, since with a crate about every 3 ticks it pushed every other crate backwards. The Puller replaced it. R-17 retired, R-28. `node test/sim.js 200` 189/200, median 36 (the earlier 192/200 was a `NOSPIN=1` run with other draws, not comparable). (Also R-10, R-26.)

### 2026-11-10 — Forked from Hex & Counters; became Thing Factory (D-1, D-2, D-3)
Copied from `ideas/hexandcounter`; the designer chose Thing Factory over three other pitches and settled place-then-tick (D-1), deliver crates with no time limit (D-2), a board that fits one screen (D-3). Removed the player counter, MP, reachability and four terrains; added Things, crates, a source, the hand, the tick, ice, pushable gremlins; map 60×40 → 16×10, heightmap 129 → 33. Fresh ID namespace; R-1…R-27 rewritten; `test/sim.js` added.

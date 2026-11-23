# Thing Factory — Ontology

The implementation reference for Thing Factory: what exists, what each thing carries, how
things relate, the rules as short pseudocode, and the interface between the engine and any
client. When the code and this doc disagree, that is a bug in one of them; raise it, don't
silently pick a side. CRITERIA.md turns each rule here into testable rows.

**Tags.** **[D]** decided by the designer · **[P]** proposed by Claude, pending review ·
**[T]** tunable number · **[D, unbuilt]** decided but not yet in the code.
**Serves:** names the goal (`G-n`), quality, or DYNAMICS driver an item exists for.
IDs (`G-n`, `D-n`, `Q-n`, `R-n`/`U-n`/`X-n`) are stable and never reused; cite them, not
section numbers.

---

## §0 Purpose

Thing Factory is **a small hex board where you build a contraption one Thing at a time
while it runs**. Each Thing does exactly one thing, every tick. Crates come
out of a source; get enough of them to the target. Bigger boards open more colors as you
pass milestones, each with its own target, and every milestone unlocks a new card. [D:
place-then-tick, deliver N, no time limit, board size picked at New Game, colors opened by
milestones, cards unlocked by milestones]

**Qualities**
- **Tinkerer's delight** — the fun is setting something up and watching it go. [P]
- **One verb per Thing** — you can predict any Thing by looking at it. [P]
- **Comedy** — gremlins ride your belts into the sea, a Puller yanks a wandering gremlin
  into the drink, and a spring flings a crate onto ice so it skids home. Overlapping Things are allowed to do silly things. [P]
- **Board-wargame feel** — flat hexes, chunky counters. [D]

**Goals, in priority order**
- **G-1 The contraption is the toy.** Placing a Thing should change what the machine does
  on the very next tick, visibly. Concretely: every command but turning a mover ticks, and the tick is animated
  from engine events. [P]
- **G-2 Readable.** Every Thing does one thing, shown by its glyph and facing arrow; the
  legal placement hexes highlight before you commit. [P]
- **G-3 Keep the base platform's seams.** Server-portable State/Engine split, seeded
  reproducibility, double-click to run. [D]

**Priorities when goals conflict.** G-3's double-click and seam constraints beat
everything; G-2 beats G-1 (a funny interaction that can't be read is a bug, not comedy). [P]

**Non-goals (for now)** [D]
- A defeat condition, a time limit, or an end. The factory runs forever; the score is the
  turn each milestone was reached.
- Combat, unit stats.
- Levels or a campaign; every board is generated.
- Undo, or getting a removed Thing's card back: removing costs the card and a tick (D-12); the
  Mover lifts a Thing only by spending its own card (D-47).

---

## §1 Entities

### GameState — the world struct
*Serves:* G-3. Authoritative, serializable data only.

| Field | Type | Notes |
|---|---|---|
| `seed` | uint32 | Reproducibility anchor. |
| `size` | key of `MAP_SIZES` | The board size this game was generated at. |
| `hexes` | `Map<"q,r", Hex>` | The map; `Board` wraps it. |
| `sources` | `[{q, r, colors}]` | Where crates appear; each makes the crates of its `colors` (one or more). Things may sit on one, except a blocking one (Wall). [D] |
| `targets` | `[{q, r, color, delivered}]` | One per open color, in the order they opened: it takes only `color` crates, and `delivered` sums their `value` (a big crate counts 10). Nothing may be built on one. [D] |
| `pieces` | `Piece[]` | Every crate and gremlin, in creation order. |
| `things` | `Thing[]` | Every placed Thing, in placement order (the order they act, Pushers and Pullers first: Tick rule). |
| `hand` | `{kind}[]` | Cards, length `HAND_SIZE` (Draw rule). A card's `kind` is a `THINGS` kind or a `TOOLS` kind (the Mover, D-47; the Bomb, D-48). A card has no color; a `colored` kind gets its color when placed (D-32). |
| `unlocks` | int ≥ 1 | How many `UNLOCKS` steps are open; their kinds are the deck (Unlock rule). A new game opens 1. [D: pjpd card-unlock] |
| `turn` | int ≥ 1 | Goes up by 1 per tick. |
| `delivered` | int | Crates delivered, all colors together, each counted at its `value` (a big crate is 10; milestones count this, D-34). |
| `lost` | int | Crates that sank, were wrecked by a gremlin, or were destroyed otherwise (blasted, bombed, crashed mid-air, cleared by a newly opened endpoint), each counted at its `value` (D-34); split by cause in `counts` (`cratesSunk`, `cratesSmashed`, `cratesLostOther`, D-74). |
| `exGremlins` | int | Gremlins gone any way but a Trap: sunk, splatted, bombed, or killed on a target (Tick rule). Shown in the tally. [D] |
| `trapped` | int | Gremlins a Trap caught (Tick rule). Shown in the tally. [D] |
| `idleTicks` | int | Ticks in a row with no card used (`place`, `discard`, `move`, `scrap`, `bomb`); at `IDLE_REDRAW_TICKS` one card is redrawn (Tick rule). [D] |
| `spawnCycle` | [`CRATE_COLORS` name] | Every `CRATE_COLORS` color once, shuffled with `Rando` at `newGame`; fixed for the whole game, never reshuffled (D-43). [D] |
| `spawnSlot` | int, 0 ≤ n < `spawnCycle.length` | The slot of `spawnCycle` the next tick takes; advances one per tick, wrapping. The crate cap isn't stored: it's `crateCap(size)` plus `milestonesReached(delivered)` (D-31). [D] |
| `nextId` | int | Next piece id. |
| `phase` | `'player' \| 'tick'` | `'tick'` only while a tick resolves inside a command. |
| `counts` | `{key: int ≥ 0}` | The stored per-game counters, exactly `STORED_COUNTERS`, each 0 in a new game; the ones read from the fields above or derived aren't stored (Counters rule, D-74). [D] |
| `goals` | `{set, base, list}` | The goal set now (Goals rule, D-75): `set` its number (0 for the one `newGame` deals, +1 per `newGoals`), `base` `counters()` when it was dealt (every `perGame` key), `list` `GOALS_PER_GAME` of `{counter, amount, met}`. [D] |

`toJSON()` gives the whole struct as plain JSON data (`hexes` as a list in Map order, pieces as
plain records) plus `rng`, the seeded `Rando` stream's position (`Rando.state()`, a uint32);
`GameState.fromJSON(data)` checks that data and builds a GameState from it, or throws, and never
touches `Rando`; it refuses data whose `counts` isn't exactly the stored counters with whole numbers ≥ 0 (D-74), or whose `goals` isn't a whole `set` ≥ 0, a `base` of exactly the `perGame` keys as whole numbers ≥ 0 and a `list` of `GOALS_PER_GAME` goals each with a goal counter, a whole `amount` > 0 and a boolean `met` (D-75). The engine's `save()` / `restore(data)` wrap them (D-67).

### Hex — one map cell (plain object)
| Field | Type | Notes |
|---|---|---|
| `q`, `r` | int | Axial, pointy-top. Key `"q,r"`. |
| `col`, `row` | int | Rectangle position; `q = col - floor(row/2)`. |
| `elevation` | float 0…100 | Generation only. |
| `isEdge` | bool | Outer ring. |
| `terrain` | `TERRAIN` | `WATER`, `PLAINS`, `MOUNTAIN`, `ICE`. |

### Piece — a crate or gremlin
*Serves:* G-1 (the things the machine moves), comedy (gremlins).
A `Piece` (position, color, label) with two fields set by the engine. Each kind is a row of `PIECES`.

| Field | Type | Notes |
|---|---|---|
| `q`, `r` | int | Position. |
| `id` | int | Unique, from `nextId`; events refer to it. |
| `kind` | `'crate' \| 'bigcrate' \| 'gremlin'` | Key into `PIECES`. |
| `label` | string | `PIECES[kind].label`: `'📦'` or `'👹'`. |
| `color` | `#rrggbb` \| `CRATE_COLORS` name | Gremlins get a seeded palette color; a crate gets the color of the spawn slot that made it. Only its color's target takes it (Motion rule); the client draws it as a shaded isometric box. [D] |

`PIECES[kind]` is the template:

| Field | crate | bigcrate | gremlin | Meaning |
|---|---|---|---|---|
| `label` | `'📦'` | `'📦'` | `'👹'` | The counter's glyph (the client draws crates as a box instead; a big crate's box is `BIG_CRATE_SCALE` bigger). |
| `cargo` | yes | yes | no | Delivered on entering its color's target, blocked by other colors' targets; counted in `lost` when it sinks. |
| `value` | 1 | 10 | 0 | What a delivery adds to `delivered` and its target's count, and what losing it (sunk, wrecked, blasted) adds to `lost`. Toward the crate cap every cargo piece counts one (D-34). [D: pjpd big-crate] |
| `wanders` | no | no | yes | Takes a random step on a tick when no Thing claimed it, its direction picked from the board as the tick starts (D-38). |
| `splats` | no | no | yes | A Rocket's flight destroys it: the piece the flier lands on, and the launched piece once it lands; so does coming onto a Trap (Motion rule). [D] |
| `wrecks` | no | no | yes | Its own wandering step into a cargo piece's hex destroys that piece (counted in `lost`) and takes the hex; pushed, pulled or flung into one, it's just blocked (Motion rule). [D] |
| `reemerges` | no | no | yes | When one sinks or splats, a new one climbs out on a shore hex (Emerge rule). |
| `splatsOnSlideBump` | no | no | yes | Sliding into a bump (a skid, or a ground motion that came onto slick ground free), it splats where it is at that hop instead of following; the bumped line still advances, unless the bumped piece has `splatsOnSlideBump` too, and then both splat and nothing moves on (Bump, D-54). [D: pjpd grem-splat] |

A big crate is a crate in every rule but `value`: Things, ice, bumps, Traps, targets and
gremlins treat it the same (D-34).

### Thing — a placed fixture (plain object)
*Serves:* G-1, G-2. Templates over snowflakes: every kind is a row of `THINGS` (§6).

| Field | Type | Notes |
|---|---|---|
| `kind` | `ThingKind` | `BELT`, `SPRING`, `ROCKET`, `PUSHER`, `PULLER`, `WALL`, `TRAP`, `BRIDGE`, `SLIDE`, `CANNON`. |
| `color` | `WHITE` \| `CRATE_COLORS` name | Set by `place` and kept for good (D-32): a `colored` kind takes the open color the player picked, every other kind `WHITE`. A colored one acts only on crates of its color and on every gremlin; white acts on every piece. [D] |
| `q`, `r` | int | Position. One Thing per hex; placing on an occupied hex replaces it (D-28). |
| `facing` | 0…5 \| null | Index into `Hex` neighbor directions; null for fixtures. Facing order E, NE, NW, W, SW, SE; clockwise is `(f+5) mod 6`. |

`THINGS[kind]` is the template:

| Field | Meaning |
|---|---|
| `push` | Hexes it shoves (or flies) the piece standing on it, along `facing` (Belt, Bridge, Spring, Rocket, Cannon). [Bridge D] |
| `splat` | Its push splats pieces that splat: the one it lands on and the one it launches (Rocket). [D] |
| `flies` | Its push is airborne: it passes over inland open water (only the outer sea, an edge hex, takes the piece mid-flight), every hex counts (ice is no shortcut mid-air), and it sinks if it comes down on water (Spring, Rocket). Every landing skids: a flight (or a `clears` shot) that comes down on slick ground (bare ice or a Slide), at full range or short, slides on, on the ground (a skid, Motion rule); there is no per-Thing flag. The one exception is a flight that splatted a gremlin in its way (it stops on that hex); a gremlin riding a Rocket splats where it lands. [D; skid on landing D-17, D-29, D-37 (settled 2026-11-12)] |
| `overMountains` | A flying push that passes over mountains too; it can't come down on one, so a flight that ends over a mountain lands on the last hex short of it that it flew over, or stays put if there's none (Spring: over two mountains, landing on the third). [D-35] |
| `clears` | How many hexes at the start of its push pass over everything: water (the outer sea too), mountains, Walls, pieces (gremlins unsplatted), targets, Traps; the shot touches nothing on them, and the rest of the push goes through `step` from the last one, on the ground unless `flies` (Cannon: 4 of its 5). Stopped right after them, it comes down on the last cleared hex if the ground there would take it (no Wall, no other piece, not open water, not a mountain or another color's target; its color's target delivers it), else it doesn't fire; a path that leaves the map within them doesn't fire. 0 for every other kind. [D-36: the clearing and the 4th-hex landing D; off-map and the target cases P] |
| `shove` | Hexes it pushes the piece on the **near hex** (the one it faces) on, along `facing` (Pusher). [D] |
| `pull` | Hexes it pulls the piece on the **far hex** (two ahead along `facing`) back toward itself, into the **near hex** (one ahead) (Puller). |
| `blocks` | Pieces can't enter (Wall); it ends every flight before it, a Spring's too (D-73); only a shot's `clears` hexes pass over it (D-36). |
| `traps` | A piece that splats dies when it comes onto this hex: walked, pushed, slid, or coming down from a flight; a flight passing over doesn't count (Trap). Every target does the same, with no Thing (Motion rule). [D] |
| `colored` | Placed in an open crate color the player picks, never white (`colorChoices`, D-32); its card is drawn plain, and only once two or more colors are open (Pusher, Puller). [D] |
| `slides` | Slick ground: a piece that comes onto it on the ground keeps going the same way, free, exactly like bare ice (Slide), up to `MAX_SLIDE` slick-to-slick moves per motion, so at most 4 slick hexes in a row (D-52). The one slick test, `isSlick`, reads it: a Thing on a hex decides by `slides`; with no Thing, the hex is slick if it's ICE. [D-29] |
| `on` | `'land'` (plains/ice), `'water'`, or `'unslick'` (plains or water: not bare ice, which already slides) — where it may be built. [unslick D-29] |
| `weight` | Relative draw chance for the hand, among the kinds in the deck (Draw rule). |

### Tool — a card that isn't a Thing [D-47]
*Serves:* G-1 (cleanup without a Wait-and-hope). A tool card is dealt like any card but never
built: it's played on the board in its own command. `TOOLS[kind]` is the template:

| Field | Meaning |
|---|---|
| `picks` | What its clicks on the board take (`canPick`): `'thing'`, a hex holding a placed Thing (Mover); `'filled'`, a hex holding a Thing or a piece (Bomb; a source or target counts only for what stands on it, D-48). |
| `wipes` | How many hexes it clears in one command: 0 (Mover), 5 (Bomb, D-48). Not `THINGS.clears` (a Cannon's passed-over hexes). |
| `colored` | Always false: a tool is dealt on any board. |
| `weight` | Relative draw chance, as `THINGS.weight` (Draw rule). |

`CARDS` is every card kind (`THINGS` keys, then `TOOLS` keys); `cardOf(kind)` is its template.
The tools are the **Mover**: pick up a placed Thing and put it down elsewhere (`move`), or back
out and scrap it (`scrap`); and the **Bomb**: clear 1 to `wipes` hexes of their Thing and piece
in one command (`bomb`, D-48).

### Board — query layer over `hexes`
`get`, `has`, `moveCost`, `isPassable`, `passableHexes` (non-edge only), `neighbors`,
`hasPath`. Passable means land (plains or ice). Transient, rebuilt with the map.

### GameUI view state (client only)
| Field | Notes |
|---|---|
| `picked` | `{ slot, card, mode, legal: Set<key>, kind, color, from, booms }` \| null — the hand card in play. `mode` (`PICK_MODES`, D-47): `'build'` (a Thing card: `legal` is `legalPlacements`; a legal click sends `place`, or opens the color picker, an illegal one puts the card back), `'pickup'` (a tool card: `legal` is `legalPicks`; a click on a legal hex leads where `AFTER_PICK[card]` says, a bare hex does nothing, Esc or right-click puts the card back), `'carry'` (the Mover holding the Thing it picked up from `from`: the card is spent and the hand, Wait/Space and `B` locked, the Thing is hidden from its hex, `kind`/`color` are that Thing's and draw the ghost and the card; a legal click sends `move`, an illegal one does nothing, Esc, right-click or Discard sends `scrap`), `'bomb'` (the Bomb after its first boom, D-48: `booms` are the hexes blown up so far; each bursts (its Thing in its colors, its piece splatting, the splat sound) the moment it's clicked and is drawn cleared from then on (Thing and piece hidden, gone from the hover bar), though the engine hears of them only when the bomb ends; the card is spent and the hand, Wait/Space and `B` locked; `legal` is `legalPicks` less the booms; a legal click booms, any other does nothing; the boom that reaches `wipes`, Esc, right-click or Discard sends `bomb` with every boom, and that tick's animation leaves out the booms' `clear`s and `splat`s, already shown). A click that does nothing, here or in `build`, says why in the hover bar (`notice`, D-55). |
| `facing` | 0…5 — the ghost's facing, remembered between placements. |
| `overlay` | `'intro'` \| `'size'` \| `'news'` \| `'help'` \| `'color'` \| `'about'` \| `'goals'` \| `'goalsDone'` \| null. `'intro'` and `'size'` are size pickers; picking a size starts a game, and `'size'` (New Game) also closes on Esc, back to the game. `'news'` shows the colors `open` events named and the cards `unlock` events named, on one panel, and closes on a click or any key (D-30). `'help'` is Help (D-60), a pager like About: Keys (the legend), then Things (every card, locked or not: its tile as the hand draws it, its name and its hover line), then World (crates, big crates, gremlins, ice, open water, milestones, each but milestones pictured by the board's drawing code, numbers from the rules data, D-61), then Goals and achievements (the mechanic only, D-76); it opens on Keys after the intro's size pick and from the Help button; `<` `>` or ←/→ turn the pages, a click on a button keeps it open, any other click or key closes it. A phone or tablet starts on the sorry page instead, with no UI built; its "Try it anyway" boots the game as on a desktop (D-41). `'color'` is the color picker (D-32): a click on a legal hex with a card whose `colorChoices` has more than one color opens it beside that hex, one swatch per choice; a swatch click or its number key sends `place` in that color; Esc, right-click or a click off the swatches closes it with the card still picked. `'about'` is the About panel (D-59): credits then privacy (what the recorder sends, its per-load random ID, and that Global Privacy Control turns it off, D-65; that a signed-in player's achievement totals are kept on the server, which Global Privacy Control doesn't stop, and a file copy's in the browser, D-79), flipped by `<` `>` or ←/→; opened by the About button or the intro's About link (it goes back to the intro); clicks on links, buttons and the version/seed text keep it open, any other click or key closes it. `'goals'` is the Goals view (D-76), a pager like Help opened by the goals panel's expand button: Goals (each goal with a progress bar, and New goals, which keeps it open), then Achievements (the active achievements, D-79); a button click keeps it open, any other click or key closes it. `'goalsDone'` is goals met (D-76): the tick that met a set's last goal turned Go off and opened it; New game opens `'size'`, New goals deals the next set and closes, Keep playing (or Esc) closes; every other key and click is eaten. Goals on screen has the rest. [D] |
| `helpPager`, `aboutPager`, `goalsPager` | Help's, About's and the Goals view's pager (one `Pager`, D-60): `page`, the page showing (Help: 0 Keys, 1 More keys, 2 Special cards, 3 Things, 4 World, 5 Goals and achievements; About: 0 credits, 1 privacy; Goals view: 0 Goals, D-76, 1 Achievements, D-79). |
| `achievementsDrawn`, `rungWaiting`, `rungLines` | The Achievements page's `{key: reached}` as last drawn with the totals known (a row whose rung differs flashes, D-79), and the achievement banner's announcements waiting and showing (at most `RUNG_BANNER_LINES`). |
| `goalLines`, `goalRows`, `goalsDrawn`, `doneWaiting` | The goals panel's lines and the Goals view's rows (`GOALS_PER_GAME` each, made once), what they last drew (redrawn only on change), and whether goals met waits behind a news panel (D-76). |
| `aboutFrom` | The overlay About opened over (`'intro'`, to go back to on close) or null over the game (D-59). |
| `choosing` | `{ q, r, colors }` \| null — the hex and swatches of the open color picker; the ghost stands there while it's open. [D-32] |
| `hoveredHex`, `panX/Y`, drag fields | The hex under the cursor, the screen-space pan offset, and left-drag tracking (`DRAG_THRESHOLD`). |
| `scale`, `zoom` | The view scale (screen px per world px) and the map-scale button last pressed (`1`, `2`, `∞`); a new game starts at 1x (D-40). |
| `selected` | `{q, r}` \| null — a clicked hex: outlined, holds Go; clicking it again calls `rotate`; `D` removes its Thing (D-39). |
| `bursts` | `[{q, r, thing, piece, t0}]` — Bomb booms bursting now, outside any tick (D-48). |
| `notice` | string \| null — why the last refused click or key did nothing, from `REASONS`; it takes the hover bar for `NOTICE_MS` (D-55). |
| `anim` | `{ t0, dur, tracks, before, hidden, milestone, opened, unlocked, redrawn, ends, goalsMet, goalsDone, goalSet, rungs }` \| null — tick animation, played hop by hop as the engine ran it (each track `{pts, hop, over, end}`, `pts[k]` its hex after hop k, D-38). Commands that arrive while it runs go into `queue`; picking a card, selecting, turning and muting work at once. |
| `queue` | `TickQueue` — one held command (the latest wins) that came in during `anim`: X / Discard, a card's × or Shift+number, a board click with a card picked, `D`, `B`; it runs when the animation ends, re-checking its own guards; picking or putting back a card and a new game clear it (D-49, D-50). |
| `running` | bool — Go/Pause. While true, the client calls `wait()` `RUN_GAP_MS` after each animation ends, and holds while a card is picked, a hex is selected or an overlay is open; the tick that meets a goal set turns it off (D-76). [D] |
| `sound` | `GameSound`, `Math.random` only; muted by the Sound button or `M`, remembered in `localStorage` (D-53). |
| (crash screen) | Not GameUI state: `crash.js`, loaded before every other script, owns it, so it works if GameUI never booted or a script failed to load (D-63). Its window `error` / `unhandledrejection` handlers show `#crash-panel` once (`crashed`): the error, the version (`<html data-version>` or "dev") and, with a board, the seed, selectable; Go stops and keys stop reaching the game; Reload reloads; Start fresh removes only `localStorage[SAVE_KEY]` (`'thingfactory.run'`, the saved run's key, written only around the sign-in redirect, D-67) and reloads. The same first error sends one crash record (the Telemetry section's Crash report, D-71); nothing about the send shows on the card. |
| (sign-in) | Not GameUI state: `GameSignIn` (signin.js) reads the sign-in from `localStorage[AUTH_KEY]` each time it's asked, and GameUI only shows it (`showSignIn`: the Sign in buttons or the handle label in the bar and both size panels, the bar's Sign out, About's line) and keeps `signedIn` (bool: what the spots show, so Sign out shows and acts, D-69). Offered only on `SIGNIN_SITES` origins (§9, D-68). |

---

## §2 Relations and invariants

- `hexes.size === cols × rows` of `MAP_SIZES[size]`; every edge hex is `WATER`. [D]
- Sources and targets are on passable non-edge hexes, sources in the leftmost placement
  slice, targets in the rightmost, each target with a land path from its color's source. No
  two share a hex. A newly opened one holds no Thing and no piece (D-44). [P; colors D]
- Each open color has exactly one target and comes out of exactly one source;
  `targets.length <= MAP_SIZES[size].colors`, and the targets' colors are distinct `CRATE_COLORS`. [D]
- At most one Thing per hex. No Thing on a target. Bridges only on water; Slides on plains or
  water (never bare ice); every other kind only on land. [P; Slide D-29]
- At most one piece per hex, between commands and after every hop of a tick (a Cannon's shot passing over doesn't count, D-36, D-38). No piece on a Wall, on mountain, or on open water (water with no Thing over it), between commands (a Spring's flight passes over a mountain mid-tick, D-35; a Cannon's shot over anything, D-36). [P; every hop D-38]
- `hand.length === HAND_SIZE` whenever a command returns. [P]
- `1 <= unlocks <= UNLOCKS.length`, and every card kind (`CARDS`: `THINGS` and `TOOLS`) is in exactly one `UNLOCKS` step. [D]
- Every command that returns `ok:true` ran exactly one tick and raised `turn` by 1, except `rotate`, which ran none and left everything but that facing alone, `newGoals`, which ran none and changed only `goals` (D-75), and `restore` (D-67). [P; rotate D]
- `goals.list` holds `GOALS_PER_GAME` distinct goal counters, none of the size's `goalExcludes`; a met goal stays met until the next set is dealt. Goals never draw from the shared `Rando` stream (D-75). [D]
- There is no won state: every command stays legal however many crates are delivered. [D]
- **Engine-side modules never read the DOM, canvas, or `GameDisplayArtifacts`.** [D]
- **Determinism:** same seed + same commands ⇒ same state and same events. [D]

---

## §3 Map and terrain

| Terrain | Pieces | Things | Placed by |
|---|---|---|---|
| `WATER` | sink on entry, unless a Thing covers it (Bridge, Slide); a flying push crosses inland water and sinks only if it comes down on it | Bridge, Slide | lowest band; all edges |
| `PLAINS` | enter normally | any land Thing | middle band |
| `ICE` | slide on through, unless a Thing that doesn't slide covers it | any land Thing | scattered onto plains |
| `MOUNTAIN` | can't enter; a Spring's flight passes over it but can't come down on it (D-35) | none | highest band |

*Serves:* terrain as language — water is the hazard, ice is the windfall, mountains are
walls you didn't have to spend a card on. [P]

---

## §4 Rules

### Generate — `newGame(seed, size)` [P; size D]
*Serves:* G-3, a fresh puzzle every board. The caller supplies the seed: the client rolls
one with `Math.random`, and tests and replays pass theirs. The engine never rolls one.
The player picks the size (D-3).
```
legal: seed is a non-negative integer; size is a key of MAP_SIZES
state.seed = seed; state.size = size
ends = generateMap(seed, GEN_MAX_ATTEMPTS) or (seed = knownGoodSeed; generateMap(seed, 1))
    # generateMap: Rando.seed; build cols×rows grid sampling a heightmap-side
    #   diamond-square grid; assignTerrain; placeSourceAndTarget; hasPath? → {source, target}
color = Rando.choice(CRATE_COLORS)
spawnCycle = Rando.shuffle(copy of CRATE_COLORS); spawnSlot = 0     # D-43
sources = [{ends.source, colors: [color]}]; targets = [{ends.target, color, delivered: 0}]
things = []; pieces = []; a spawnKind() of color on the source; spawnGremlins()   # 1% big (D-45)
unlocks = 1; hand = HAND_SIZE draws (from UNLOCKS[0]); turn = 1; delivered = lost = exGremlins = trapped = idleTicks = 0
counts = zeroCounts(); dealGoals(0)          # last, from a side stream: no shared Rando draw (Goals rule, D-75)
```

### Assign terrain [P]
```
edges -> WATER; inner sorted by elevation, by percentile p:
    p < WATER_PCT -> WATER; p < MOUNTAIN_PCT -> PLAINS; else MOUNTAIN
shuffle plains: first round(ICE_FRAC * inner) -> ICE
```

### Place source and target [P]
```
passable = board.passableHexes() sorted by col
slice = max(PLACE_SLICE_MIN, floor(PLACE_SLICE_FRAC * len))
source = Rando.choice(first slice); target = Rando.choice(last slice)
```

### Open a color — `openColor()` [D; placement P]
*Serves:* escalating commitment (each milestone asks for a second line), comedy (crossing
lines of different colors). Runs once per milestone reached, from the Tick rule.
```
if targets.length >= MAP_SIZES[size].colors: nothing
color = Rando.choice(CRATE_COLORS not yet open)
if Rando.random() < ENHANCE_CHANCE: src = Rando.choice(sources)        # it adds this color
else: src = Rando.choice(open hexes in the left slice)                  # a new source
tgt = Rando.choice(open hexes in the right slice with a land path from src)
if no src or no tgt: nothing                                            # the next milestone tries again
add color to src (or add {src, colors: [color]}); add {tgt, color, delivered: 0}
emit open{color, source, target}
for h in the newly placed hexes (tgt, and src unless it was enhanced):  # clearHex (D-44)
    if a Thing on h: remove it (no card back); emit clear{kind, q, r, hop: the tick's last hop}
    if a crate on h is h's target color: deliver it; emit deliver{id, hop: the tick's last hop}  # D-46
    elif a piece on h: remove it; lost += its value; emit splat{id, by: null, trap: false, hop: the tick's last hop}
```
An open hex is any slice hex that isn't already a source or target: a Thing or a piece on it
doesn't rule it out, and the pick is uniform (D-44). The slices are the Place source and
target rule's. A cleared gremlin counts in `exGremlins` and re-emerges like any splat (the
Tick rule runs milestones before its tally); a cleared crate or big crate counts as lost,
unless it stands on its own color's new target, where it's delivered (D-46). An enhanced source's hex is left as it is.

### Spawn gremlins [P; scales with area D]
*Serves:* comedy; moving obstacles.
```
dice = gremlinDice(size) = max(1, round(cols * rows / GREMLIN_HEXES_PER_DIE))
count = sum of dice rolls of d GREMLIN_DICE_SIDES
on shuffled passable hexes other than the source and target (the first crate stands on the source)
```

### Emerge — `emerge(goneKinds)` [D]
*Serves:* comedy, routes going stale (the board never goes quiet).
```
shoreHexes = passable hexes with an edge-hex neighbor, canEnter, not a source or target
for each sunk or splatted kind with PIECES[kind].reemerges (in event order):
    if shoreHexes is empty: stop                 # a walled-off shore keeps it drowned
    h = Rando.choice(shoreHexes); color = Rando.choice(a random palette)
    add a new piece of that kind on h; emit spawn{id, q, r}
```
Runs once at the end of every tick, for that tick's sinks and splats (a piece a newly opened
source or target cleared included, D-44) and for a piece `remove`, `move` or `scrap` sank just before the tick
(its kind comes first, as its `sink` does).

### Draw — `draw()` [P]
*Serves:* scarcity of agency (you build with what you're dealt).
```
deck = the unlocked kinds (UNLOCKS[0 … unlocks-1]), minus the colored ones while fewer than 2 colors are open
kind = chosen by Rando from deck with probability cardOf(kind).weight / deck's total weight   # Things and tools (D-47)
return {kind}                                # no color: a colored kind's is picked at place (D-32)
```

### Unlock — `unlock()` [D; skipping and kept hand D-30]
*Serves:* G-1 and escalating commitment: each milestone hands you one new toy to learn, so the
first board is a short list (Belt, Bridge, Wall, Trap) and the deck grows as the factory does.
Runs once per milestone reached, after Open a color, from the Tick rule.
```
everDealt(kind) = not cardOf(kind).colored or MAP_SIZES[size].colors > 1
step = the first UNLOCKS step after the open ones with some kind everDealt   # an all-colored step is passed over on a one-color board
if no such step: nothing                                                   # past the last step
unlocks = that step's index + 1
emit unlock{kinds: that step}
```
The cards already in hand stay as they are; new kinds arrive through later draws (D-30).

### Placement legality — `canPlace(kind, hex)` [P]
*Serves:* G-2 (the highlight *is* the rule). `place` calls it; `legalPlacements(kind)` is
the set of hexes where it holds.
```
hex exists, not a target                      # a Thing already there doesn't count: place replaces it (D-28)
terrain fits THINGS[kind].on:  'land' → PLAINS or ICE;  'water' → WATER;  'unslick' → PLAINS or WATER
THINGS[kind].blocks ⇒ no piece on hex, and not a source   # the crates must flow
```

### Motion — the lockstep hop simulation [D-38; splat, flies, wrecks, bump D; overMountains D-35; Walls stop every flight D-73; clears D-36; every landing skids D-37; slide cap D-52; slide-bump splat D-54]
*Serves:* G-1; one code path for every way a piece moves (movers, springs, rockets, cannons,
ice, Slides, bumps, gremlins); the animation replays exactly what happened.

Every piece that gets a motion this tick (from its Thing, a wander, or a bump) advances one
hex per **hop**, all together. Hop k in the engine is hop k in the animation. A motion is
always in one **phase**, which says how it travels (`lift`) and what arriving and being
stopped do:

| Phase | Lift | Bumps | Arriving on a hex | Stopped |
|---|---|---|---|---|
| `over` | over | no | passes over, touching nothing; after `clears` hexes → `ground` (still aloft) | — |
| `air` | air | yes | its color's target delivers, the outer sea sinks; at its planned length it **lands** | comes down where it is |
| `ground` | ground | yes | ground arrival; non-slick ground uses up one of its `n` hexes (slick is free; a move from slick onto slick counts toward `MAX_SLIDE`: it stops on the 3rd, at most 4 slick hexes in a row) | stops (aloft: comes down where it is) |
| `skid` | ground | yes | ground arrival; non-slick ground stops it, and so does its `MAX_SLIDE`-th (3rd) slick-to-slick move (the landing hex is where it starts) | stops |
| `line` | ground | no | ground arrival; stops after `BUMP_ADVANCE` hexes | stops |
| `follow` | ground | no | ground arrival; follows as far as its line's first piece went | stops (a flier that followed 0: comes down where it is) |
| `drop` | ground | no | lands | crashes |

```
ground arrival on hex: its color's target delivers; a Trap or a target kills a piece that splats
                       (splat, trap says which); open water sinks (lost += value)
groundOpen(hex) = on the map, not MOUNTAIN, no blocking Thing, not another color's target
canLand(hex) = groundOpen(hex): a flight comes down only where a ground step could go (D-35)
land:   the landing checks on its hex (its color's target delivers; open water sinks; a Trap kills
        a piece that splats); then a gremlin on a Rocket (doomed) splats; else on slick ground it
        skids (phase skid), unless it splatted a gremlin to land there; else it stops
comeDownHere: a flight over a MOUNTAIN or another color's target drops back (phase drop, next hop)
        to the last hex it flew over that it may land on (canLand), or its start (D-35); a shot over a hex
        that's a MOUNTAIN, another color's target, a Wall or another piece crashes; else land
crash:  remove it; lost += its value; emit splat{id, by: what it hit or null, trap: false}
stop:   the motion is over; a doomed piece splats (splat{id, by: null})
slide cap (D-52): a ground or skid arrival that survives the ground checks on slick ground is a
        free slide; if it came from a slick hex (not coming down from the air), slid += 1 (per
        motion, from 0 each tick); at slid = MAX_SLIDE it stops there, as if blocked. Entering
        the first slick hex from other ground, or landing, doesn't count, so a run covers at most
        MAX_SLIDE + 1 slick hexes. Hexes flown or passed over, line and follow steps never count.
```

**Launch** (each claim as the tick starts):
```
shot (clears > 0):  hexes 1..clears must be on the map, and either hex clears+1 is groundOpen or
                    hex clears could take it (not MOUNTAIN, not another color's target, no Wall, no
                    piece, not open water), as the board stands now; else no fire (still claimed)
                    → phase over for clears hexes, then ground for n - clears
flight (flies):     its length is fixed now: up to n hexes, stopping before the map's edge, a Wall
                    (every flight, D-73) or a MOUNTAIN (unless overMountains), and on its color's target
                    or the outer sea; then trimmed back to the last hex it may land on (canLand: off any
                    MOUNTAIN or other color's target it would end over; D-35)
                    → phase air for that many hops (0: it stays, and lands where it stands)
otherwise:          phase ground for n hexes (a wander: n = 1, wrecks)
```

**Each hop:**
```
every motion proposes its next hex (a drop: its drop hex; a follow: the next hex while it's behind
    its leader, nothing on the hop it bumped); terrain and Things alone may block it: an over always
    goes, an air motion while it has hexes left, a ground step if groundOpen
claims on one hex (over aside, unseen): two or more air → each crashes (collide), the ground
    claimants are blocked; else the lowest rank wins, the rest are blocked
each claim resolves along its chain of occupants (pieces on the hexes as the hop starts, a shot
    passing over not counted): free → go; occupant leaves this hop (go, collide, wreck, splat)
    → go; a cycle of 3+ → all go (they rotate); a 2-cycle (swap) → both blocked, both crash if
    both air; occupant stays → meet:
        an air motion with splat (a Rocket) meeting a piece that splats → splat it, take its hex,
            and land there (no skid)
        a wander (wrecks) meeting cargo → wreck it (lost += value, splat{by: the gremlin}), take its hex
        a phase that bumps meeting a piece that has had no motion this tick, on slick ground → bump
        anything else → blocked
a bump (lowest rank first) starts the line (that piece and the pieces right behind it in dir with no
    motion this tick) as line motions of BUMP_ADVANCE hexes from this hop, ranked as the bumper;
    the bumper becomes a follow that waits this hop; then the hop is resolved again
    — except a bumper with splatsOnSlideBump that is sliding (a skid, or a ground motion
    whose last arrival was free onto slick ground, `sliding`) (D-54): if the bumped piece has splatsOnSlideBump too it
    is destroyed (splat{by: the bumper}) and no line starts, else the line starts as above; the
    bumper is destroyed where it stands (splat{by: the bumped piece}), both at this hop
apply: victims go; every mover moves (all at once); each arrives by its phase; each blocked one stops
    by its phase. A hex freed by a sink, delivery, Trap or splat is open from the next hop (the
    splatter or wrecker takes its victim's hex at once).
```
A **blocked piece stops for the rest of the tick**: no retry when the hex frees up later.
**Rank** is the claiming Thing's place in the tick's order (Pushers and Pullers first, then
placement order, D-24); wanderers rank after every Thing; a bumped line takes its bumper's rank.

**Bump (D-33).** A piece stopped by a piece standing on slick ground (bare ice or a Slide)
that has had no motion this tick — on the ground or in the air, carried by any Thing,
sliding, or a gremlin — bumps it: from that hop the line of pieces from the bumped one on (it
and the motionless pieces right behind it; only the bumped hex needs to be slick) advances
`BUMP_ADVANCE` (2) hexes together, and from the next hop the bumper follows as far as the
bumped piece went, ending right behind it, so the bumped hex is left empty. Each line step is a
ground step: a piece in the line can sink, deliver, die on a Trap or a target, or stop against a
blocker or the piece ahead (the line compresses). There is no slide after the advance, and the
bump ends the bumper's motion, a flight included. A bumper whose line can't move at all stays
where it was stopped (a flight comes down there). A gremlin's own step into cargo still
wrecks it, and a Rocket still splats a gremlin in its path, before any bump. **A sliding
gremlin that bumps goes splat (D-54):** a bumper whose template has `splatsOnSlideBump` (the
gremlin) and that is sliding (skidding after a landing, or a ground motion that came onto
slick ground free) splats where it is at the bump's hop instead of following; the line it
bumped still advances 2, unless the bumped piece is another gremlin, and then both splat and
neither moves on. Each counts as an ex-gremlin and re-emerges. A gremlin that bumps without
sliding (pushed off plains, flying, or its first wander step off ice) follows as before.

**Flights.** A flight meets whatever is on a hex at the hop it gets there. A Rocket's flight
(`flies`, range `THINGS.ROCKET.push`) crosses movers, Bridges, ice, inland water and other
colors' targets, delivers on its color's target, and sinks in the outer sea, or in inland
water if it comes down there. A Spring's throw (`flies`, `overMountains`) does the
same over its 3 hexes and passes over mountains too, so it can clear two and land on the third;
a throw that would end over a mountain is trimmed at launch to the last hex short of it, or
doesn't leave the Spring if all three are mountain (D-35). A Wall stops every flight, a
Spring's too, on the hex before it (planned at launch, D-73); a Spring stopped by a Wall while
over a mountain comes down short of the mountain, or doesn't throw. A piece that stays in its
way stops a flight mid-flight and it comes down where it is, dropping back the next hop if
that's over a mountain. **Two airborne pieces entering one hex on the same
hop, or swapping hexes, both crash** (D-38); a flight never blows up a piece on the ground. Every
landing skids on bare ice or a Slide (D-29, D-37): the skid is a ground motion, so it sinks in
open water, delivers on its color's target, stops at a Wall, a mountain or another color's
target, kills a gremlin on a Trap and bumps a line on slick ground, and like any slide it stops
on its `MAX_SLIDE`-th (3rd) slick-to-slick move, 3 hexes past the landing (D-52). The one exception: a flight
that splatted a gremlin stops on that hex. A gremlin the Rocket carries splats where it lands.
A Cannon's shot (`clears` 4, range 5) passes over anything for its first 4 hexes, unseen
(it splats no gremlin, delivers on no target, springs no Trap, crashes into no flight, and
pieces may move under it), then moves into the 5th as an ordinary ground step: it can sink,
deliver, be blocked, bump a line on slick ground, kill a gremlin on a Trap, and slide on over
ice (once: the ground slide is the skid, D-37). Blocked there, it comes down on the 4th hex (a
Bridge, bare ice or a Slide takes it; its color's target delivers it; on ice or a Slide it
skids on, into what stopped it); if what blocks the 5th is terrain or a Thing and the 4th
couldn't take it as the tick starts, it doesn't fire, and if the 4th holds a piece by the time
it comes down it crashes (D-38). A shot whose cleared hexes run off the map doesn't fire (D-36).
A Slide moves nothing standing on it; it only keeps a piece that comes onto it going, and over
water it keeps that piece from sinking. Splatted pieces aren't `lost`; crashed and wrecked ones
are. A gremlin dies on a Trap however it comes onto it (a wander, a push, a slide, a landing),
but not when a flight carries it over one, and not when a Trap is built under it. A slide or a
flight always ends: a straight line reaches the water edge.

### Tick — `tick()` [P; lockstep D-38]
*Serves:* G-1. Runs once per command.
```
phase = 'tick'; deliveredBefore = delivered; claimed = {}
for thing in things with shove or pull, then the rest (each in placement order), rank = its index:   # D-24
    mover:  p = piece on thing's hex;  dir = facing;            n = push
    Pusher: p = piece on hex 1 ahead;  dir = facing;            n = shove
    Puller: p = piece on hex 2 ahead;  dir = opposite(facing);  n = pull
    skip p if thing.color != WHITE and p is cargo of another color   # affects(thing, p)
    if p and p.id not in claimed: claimed += p; launch(p, dir, {n, splat, flies, overMountains, clears of THINGS[kind], wrecks: false}, rank)
for piece with PIECES[kind].wanders (creation order), not claimed, ranked after every Thing:
    dirs = directions whose neighbor is land or covered water (Bridge, Slide), no blocking Thing,
           and empty or holding cargo it wrecks, as the tick starts
    if dirs: claimed += piece; launch(piece, Rando.choice(dirs), {n: 1, splat: false, flies: false, overMountains: false, clears: 0, wrecks: PIECES[kind].wrecks}, rank)
run hops 1, 2, … until every motion has stopped                     # Motion rule
emit one move per piece that moved, then every end (sink/deliver/splat) in the order they happened
color = spawnCycle[spawnSlot]; spawnSlot = (spawnSlot + 1) % length(spawnCycle)   # one slot a tick (D-43)
if color is open and crates on the board < crateCap(size) + milestonesReached(delivered):   # crateCap = MAP_SIZES[size].crates: 2/3/4/5 (D-31)
    src = the source that makes color
    if no piece on src:                                             # else the slot is skipped, not retried
        p = bigCrateChance(milestonesReached(delivered))              # D-34, D-45
        kind = 'bigcrate' if Rando.random() < p else 'crate'          # one roll per spawn, from the start
        a kind of color on src; emit spawn{id, q, r}
idleTicks = 0 if the command used a card (place, discard, move, scrap, bomb) else idleTicks + 1   # D-26; remove, blast, wait don't
if idleTicks >= IDLE_REDRAW_TICKS: slot = Rando.int(0, HAND_SIZE-1); hand[slot] = draw(); idleTicks = 0; emit redraw{slot}
for each milestone m with deliveredBefore < m <= delivered (read live: a reveal's delivery counts, D-46): milestone{count: m}; openColor(); unlock()   # reachMilestones; events held back
gone = kinds of the command's own sink (remove) and this tick's sunk, splatted (cleared included) and crashed pieces
trapped += count of gremlins whose splat has trap
exGremlins += count of 'gremlin' in gone, less those trapped
emerge(gone)
emit the held-back milestone, open, clear, splat and unlock events            # last, after the spawns
turn += 1; phase = 'player'
emit checkGoals()                                                # goal, goalsDone: the tick's last events (Goals rule, D-75)
```
Each piece gets at most one motion per tick, a bumped line included (D-33); a piece a Thing
claimed but couldn't move (a Cannon that didn't fire) has had its motion. A gremlin with
nowhere to wander has none, so a bump can still move it. Gremlins never step into water on
purpose, but a gremlin that wanders onto ice, or is pulled into water, goes in. A Puller
ignores pieces on its own hex and on the near hex; a pulled piece that lands on bare ice slides
on toward the Puller and stops on it (a Thing covers its hex). A Pusher ignores a piece on its
own hex. A gremlin that comes onto a target dies there, the same way as on a Trap.

### Milestones — `nextMilestone(delivered)` [D]
*Serves:* accumulation (a factory that keeps paying off), G-1.
```
milestones = FIRST_MILESTONE × (1, 2, 5) × 10^k for k = 0, 1, 2, …   # 10, 20, 50, 100, 200, 500, 1000, …
nextMilestone(n) = the smallest milestone > n                        # there is no last one
```
Reaching a milestone ends nothing: it may open a color (Open a color rule) and unlock cards
(Unlock rule), the client shows a banner naming the cards it unlocked, and play goes on. An
opened color also gets the news panel, which waits for a click or any key.

### Counters — `COUNTERS`, `counters()` [D-74]
*Serves:* goals (one game's objective) and achievements (lifetime totals), built on top later;
accumulation. Every game counts what happened in it: a named count per kind of thing, counted at
the one place in the engine where the thing happens, never from event text. Counting never
touches `Rando` and changes no rule. `GameArtifacts.COUNTERS` is the counter table, one row per
counter in this order, `{key, label, scale, goal, negative, perGame}`: `label` reads after a
number ("12 crates delivered"); `scale` is the unit of its ladder (1, 10, 100 or 1000); `goal`:
it may be a game's goal; `negative`: a bad thing, never a goal, its rung messages wry; `perGame`
false only for `rungsReached`, which is lifetime only and counted by the achievements client.
[D: the rows and fields, `exGremlins`' scale 100, `bombs` not a goal; T: the other scales, first guesses]

| Key | Label | Scale | Goal | Counted where |
|---|---|---|---|---|
| `cratesDelivered` | crates delivered | 10 | yes | `state.delivered` (a big crate counts its value, 10) |
| `bigDelivered` | big crates delivered | 1 | yes | `deliver`: 1 per big crate |
| `exGremlins` | ex-gremlins | 100 | yes | `state.exGremlins` (scale 100: ex'd en masse, D-74) |
| `trapped` | gremlins trapped | 1 | yes | `state.trapped` |
| `placed` | Things placed | 10 | yes | an accepted `place` |
| `springThrows` | Spring throws | 10 | yes | a Spring's motion that moved its piece (at least one hex) |
| `rocketFlights` | Rocket flights | 1 | yes | a Rocket's motion that moved its piece |
| `cannonLobs` | Cannon lobs | 1 | yes | a Cannon's shot that fired |
| `moved` | Things moved | 1 | yes | an accepted `move` (`scrap` doesn't count) |
| `bombs` | Bombs set off | 1 | no | an accepted `bomb` (not a goal: the Bomb is rare and last to unlock, D-75) |
| `slides` | hexes slid | 10 | yes | each slick-to-slick move of a ground motion or a landing's skid (the D-52 count) |
| `mountainsFlown` | mountains flown over | 10 | yes | each mountain hex a flight enters (only a Spring's, `overMountains`, ever does) |
| `pushes` | pushes | 10 | yes | a Pusher's motion that moved its piece |
| `pulls` | pulls | 10 | yes | a Puller's motion that moved its piece |
| `pushesPulls` | pushes and pulls | 10 | yes | `pushes + pulls`, derived |
| `milestones` | milestones | 1 | no | `milestonesReached(delivered)`, derived |
| `goalsMet` | goals met | 1 | no | the goal check: 1 per goal met (Goals rule, D-75) |
| `rungsReached` | achievements reached | 1 | no | lifetime only (`perGame` false): the achievements client |
| `cratesSunk` | crates sunk | 1 | negative | `loseValue` from `sink`: cargo value lost to open water |
| `cratesSmashed` | crates smashed by gremlins | 1 | negative | `loseValue` from a gremlin's wreck |
| `cratesLostOther` | crates lost otherwise | 1 | negative | every other `loseValue`: blast, Bomb, a mid-air crash or slide-bump splat, a new endpoint clearing it |
| `discards` | cards discarded | 10 | negative | an accepted `discard` |

```
COUNTER_READS: cratesDelivered ← delivered; exGremlins ← exGremlins; trapped ← trapped
               pushesPulls ← counts.pushes + counts.pulls; milestones ← milestonesReached(delivered)
STORED_COUNTERS = perGame keys not in COUNTER_READS        # state.counts holds exactly these, 0 at newGame
counters() = {key: COUNTER_READS[key](state) or state.counts[key]} for every perGame row, in order
loseValue(piece, cause): lost += value; counts[cause] += value  # cratesSunk + cratesSmashed + cratesLostOther = lost
a refused command (ok:false) counts nothing
```
A motion's counter (`springThrows`, `rocketFlights`, `cannonLobs`, `pushes`, `pulls`) is set
when its Thing launches it, and counted once the tick's hops have run if its piece moved: a throw
with nowhere to go or a shot that doesn't fire counts nothing; a bumped line's pieces are the
bump's, not a Thing's. No counter is stored twice: the tally fields stay as they are.

**The ladder** (`GameArtifacts`, for goals and achievements):
```
rung(scale, i) = scale × LADDER_STEPS[i mod 3] × 10^floor(i / 3)   # LADDER_STEPS [1, 2, 5]; scale 10: 10, 20, 50, 100, 200, …
level n = rung(scale, n − 1)
rungsCrossed(scale, before, after) = every rung r with before < r ≤ after, rising
standing(scale, total) = {reached: the last rung ≤ total, or null; next: the first rung > total}
```

### Goals — `dealGoals(set)`, `goalStates()`, `newGoals()` [D-75]
*Serves:* an endless game something session-sized to finish; accumulation. A game asks
`GOALS_PER_GAME` things of the player at a time, each "reach a rung of a counter, counted from
when the set was dealt". A new set can be dealt any time. Goals change no rule and never touch
the shared `Rando` stream: a seed plays the same with or without them. [D]
```
dealGoals(set):                                  # newGame deals set 0 after generation
    rng = Rando.stream(goalSeed(seed, set))      # a side stream; goalSeed: a 32-bit mix (murmur3 finalizer) of seed and set
    offered = COUNTERS rows with goal, minus MAP_SIZES[size].goalExcludes
    repeat GOALS_PER_GAME times:
        counter = a uniform pick from offered, removed from it
        level = a uniform pick from MAP_SIZES[size].goalLevels
        list += {counter, amount: rung(counter.scale, level − 1), met: false}
    goals = {set, base: counters(), list}
count(goal) = counters()[goal.counter] − goals.base[goal.counter]
goalStates() = [{counter, label, count(goal), amount, met}] in list order   # a query
checkGoals():                                    # at the end of every tick, after milestones
    for each goal i in order: if not met and count(goal) ≥ amount:
        met = true (for good); counts.goalsMet += 1; events += goal{index: i, counter, amount}
    if any was met now and every goal is met: events += goalsDone{set}
newGoals(): dealGoals(set + 1); no tick         # → {ok: true, events: [goals{set}]}
```
"Small goals for small boards": small deals level 3 only and never `pushes`, `pulls` or
`pushesPulls` (a small board has one color, so no Pusher or Puller is ever dealt); huge deals
level 4 only. A goal may be out of reach for now (its card not yet unlocked); the player can
deal a new set. A refused command or a `rotate` checks nothing. [D; uniform picks P]

### Commands
```
place(slot, q, r, facing, color):
    legal: 0 <= slot < HAND_SIZE, canPlace(hand[slot], hex at (q,r)),
           facing in 0..5 for Things with push, pull or shove (ignored, stored null, for fixtures),
           color in colorChoices(kind)                  # D-32
    if a Thing stands at (q,r): things.remove(it)       # replaced; its card is spent (D-28)
    things.push({kind, color, q, r, facing}); hand[slot] = draw(); tick()
colorChoices(kind) = cardOf(kind).colored ? open colors, in opening order : [WHITE]
    # the new Thing is last in placement order and acts this tick on a piece standing there
rotate(q, r):  legal: a Thing with a facing (push, pull or shove) stands at (q,r)
    facing = (facing + 5) mod 6               # no tick: events = [], turn unchanged
remove(q, r):  legal: a Thing stands at (q,r)
    things.remove(that Thing)                  # the card is spent; the hand is untouched
    if a piece stands there on open water: sink it (lost += its value)
    tick(), with that sink as its first event and that kind in its emerge
blast(q, r):   legal: a crate (PIECES cargo) stands at (q,r)        [D]
    remove it; lost += its value               # Things untouched; gremlins can't be blasted
    tick(), with splat{id, by: null, trap: false} as its first event
move(slot, fq, fr, q, r, facing):                                  [D-47]
    legal: 0 <= slot < HAND_SIZE, hand[slot] is a MOVER, a Thing T stands at (fq,fr),
           canPlace(T.kind, hex at (q,r)), facing in 0..5 if T.kind aims
    things.remove(T)                           # (q,r) may be (fq,fr): judged with T gone
    if a Thing stands at (q,r): things.remove(it)       # replaced (D-28)
    things.push({kind: T.kind, color: T.color, q, r, facing})   # same color, kept (D-32); last in order
    hand[slot] = draw()
    if a piece stands at (fq,fr) on open water: sink it (lost += its value)
    tick(), with that sink as its first event; a card was used (idleTicks reset)
scrap(slot, fq, fr):                                              [D-47]
    legal: 0 <= slot < HAND_SIZE, hand[slot] is a MOVER, a Thing T stands at (fq,fr)
    things.remove(T); hand[slot] = draw()
    if a piece stands at (fq,fr) on open water: sink it (lost += its value)
    tick(), as move
bomb(slot, hexes):                                                [D-48]
    legal: 0 <= slot < HAND_SIZE, hand[slot] is a tool with wipes > 0,
           1 <= len(hexes) <= its wipes, each on the board and canPick(its kind, h), none twice
    for h in hexes, in order:
        if a Thing on h: things.remove(it); emit clear{kind, q, r, hop: 0}   # no card back
        if a piece on h: remove it; lost += its value; emit splat{id, by: null, trap: false, hop: 0}
    hand[slot] = draw()
    tick(), with those events first and the pieces' kinds in its emerge   # a card was used
                                                # (a gremlin counts in exGremlins and re-emerges)
canPick(kind, hex) = TOOLS[kind] and PICKS[TOOLS[kind].picks](hex)
    # 'thing': a Thing stands there; 'filled': a Thing or a piece stands there
discard(slot): legal: 0 <= slot < HAND_SIZE                       [D]
    hand[slot] = draw(); tick()                # Things and the other cards untouched
wait():        always legal; tick()
```

---

## §5 Agents — gremlins [P]

*Serves:* comedy, routes going stale. Gremlins use the same `step` as everything else. They
know only the board and occupancy. They pick a random free land or covered-water (Bridge, Slide) neighbor, or
stay, and a crate on a neighbor counts as free: stepping there wrecks it. They never push
crates; a gremlin in the way is a wall until it moves, unless it steps onto the crate.
Pushed or pulled into a crate, a gremlin is only blocked, unless the crate stands on slick
ground: then it bumps it (D-33), and a gremlin on slick ground gets bumped like a crate, or carried along in a bumped line. A gremlin that bumps while sliding goes splat instead of following, and a gremlin it bumps splats with it (D-54). A gremlin standing on a
mover (a Bridge too) gets carried. One that drowns or splats is replaced by a new one on the shore.
The count only drops when the whole shore is walled off or full.

---

## §6 Numbers [T]

The code constant in `GameArtifacts` is the single source. `RULES_VERSION` stays 1 through development, rule changes included: the game record's `version` (the commit hash) tells builds apart; it changes only for a drastic, breaking rules change, at the designer's call (the Telemetry section, D-65).

| Name | Value | Unit |
|---|---|---|
| `MAP_SIZES` small / medium / large / huge | 16 × 10 / 20 × 20 / 30 × 30 / 60 × 60 | cols × rows (D-3) |
| `MAP_SIZES.*.heightmap` | 33 / 33 / 33 / 65 | diamond-square grid side (2ⁿ+1, ≥ the longer side) |
| `MAP_SIZES.*.knownGoodSeed` | 1 at every size | seed (must pass R-23) |
| `MAP_SIZES.*.colors` | 1 / 2 / 3 / 4 | most colors the board opens [D] |
| `ENHANCE_CHANCE` | 0.5 | chance a new color comes out of an existing source [D] |
| `FIRST_MILESTONE` | 10 | crates (then the 1-2-5 series, forever) |
| `MAP_SIZES.*.crates` | 2 / 3 / 4 / 5 | crates the board holds at once before any milestone; `crateCap(size)` returns it; +1 per milestone reached (D-31) [D] |
| `BIG_CRATE_START` | 0.01 | big-crate chance with no milestones reached (D-45) [D] |
| `BIG_CRATE_AT_FIFTH` | 0.05 | big-crate chance at `BIG_CRATE_KNEE` milestones (D-45) [D] |
| `BIG_CRATE_KNEE` | 5 | milestones over which the chance rises in a straight line, START → AT_FIFTH; `bigCrateChance(m)` = START + (AT_FIFTH − START)·m / KNEE for m ≤ KNEE: 1, 1.8, 2.6, 3.4, 4.2, 5% (D-45) [D: the end points; T: the straight line] |
| `BIG_CRATE_EASE` | 0.85 | past the knee, `bigCrateChance(m)` = 1 − (1 − AT_FIFTH)·this^(m − KNEE): 19% at 6, 31% at 7, 58% at 10, 81% at 15, toward 1, never 1 (D-45) [D: asymptotic to 1; T: the ratio] |
| `PIECES.bigcrate.value` | 10 | crates a big crate is worth (D-34) [D] |
| `COUNTERS.*.scale` | 100 exGremlins; 10 cratesDelivered, placed, springThrows, slides, mountainsFlown, pushes, pulls, pushesPulls, discards; 1 the rest | the unit of each counter's ladder (Counters rule, D-74) [D: exGremlins 100, the designer's call; T: the rest first guesses, the designer tunes] |
| `LADDER_STEPS` | 1, 2, 5 | a ladder's rungs: scale × these × 10^k (D-74) [D] |
| `GOALS_PER_GAME` | 3 | goals in a set (Goals rule, D-75) [D] |
| `MAP_SIZES.*.goalLevels` | [3] / [3, 4] / [3, 4] / [4] | the ladder levels a goal's amount may be (D-75) [D] |
| `MAP_SIZES.*.goalExcludes` | `pushes`, `pulls`, `pushesPulls` / none / none / none | counters never dealt as goals on that size (D-75) [D] |
| `HAND_SIZE` | 3 | cards |
| `BUMP_ADVANCE` | 2 | hexes a bumped line advances; its bumper follows to one hex behind it (D-33) [D] |
| `MAX_SLIDE` | 3 | moves from a slick hex (bare ice or a Slide) onto a slick hex one ground motion or skid makes; it stops on the 3rd, so at most 4 slick hexes in a row (D-52) [D] |
| `IDLE_REDRAW_TICKS` | 10 | ticks in a row with no card used before one random card is redrawn (D-26) |
| `CRATE_COLORS` | red, green, blue, yellow | the colors a game can open; their count is the spawn cycle's length (one crate chance per color per round, D-43) [D] |
| `WHITE` | white | the color of a Thing that acts on every piece [D] |
| `THINGS.SPRING.push` | 3 | hexes |
| `THINGS.BELT.push` | 1 | hexes |
| `THINGS.BRIDGE.push` | 1 | hexes, on the ground: a Belt over water (D-27) [D] |
| `THINGS.ROCKET.push` | 8 | hexes (its range) [D] |
| `THINGS.CANNON.push` / `.clears` | 5 / 4 | hexes: its range, and how many of them it passes over untouched (D-36) [D] |
| `THINGS.PULLER.pull` | 1 | hexes |
| `THINGS.PUSHER.shove` | 1 | hexes [D] |
| `UNLOCKS` | [BELT, BRIDGE, WALL, TRAP], [PUSHER, PULLER], [SLIDE], [SPRING], [MOVER], [CANNON], [ROCKET], [BOMB] | the order cards join the deck, one step per milestone [D; CANNON the last Thing D-36, then moved before ROCKET D-51; MOVER after SPRING D-47; BOMB last D-48] |
| `THINGS.*.weight` BELT/SPRING/ROCKET/PUSHER/PULLER/WALL/TRAP/BRIDGE/SLIDE/CANNON | 6 / 2 / 1 / 0.5 / 0.5 / 2 / 1 / 1 / 2 / 1 | relative (TRAP [D]: as ROCKET; PUSHER, PULLER [D]: rare, about one per color is plenty; SLIDE [D-29]: as WALL and SPRING; CANNON [D-36: low D, 1 P]: as ROCKET) |
| `TOOLS.MOVER.weight` | 0.5 | relative, on the same scale; rare like a Pusher or Puller [D-47: rare D, the number P] |
| `TOOLS.BOMB.weight` / `.wipes` | 0.5 / 5 | relative, rare like a Pusher or Puller / hexes one Bomb clears [D-48: rare D, 0.5 P; 5 D] |
| `GREMLIN_HEXES_PER_DIE` / `GREMLIN_DICE_SIDES` | 160 / 4 | hexes of board area per die (the small board's area) [D] / sides; gremlins = `gremlinDice(size)` d sides |
| `GEN_MAX_ATTEMPTS` | 10 | tries per seed |
| `HEIGHTMAP_ROUGHNESS` | 0.55 | — |
| `WATER_PCT` | 0.18 | elevation percentile |
| `MOUNTAIN_PCT` | 0.90 | elevation percentile |
| `ICE_FRAC` | 0.08 | of inner hexes |
| `PLACE_SLICE_FRAC` / `PLACE_SLICE_MIN` | 0.05 / 3 | of passable hexes / hexes |
| `HOP_MS` | 140 | ms per animated hop (client) |
| `RUN_GAP_MS` | 250 | ms between ticks while Go runs (client) |
| `MILESTONE_MS` | 3500 | ms the milestone banner, each goal banner and each achievement banner line show (client) |
| `NOTICE_MS` | 2500 | ms a refusal's reason holds the hover bar (client, D-55) |
| `DRAG_THRESHOLD` | 4 | px (client) |
| `SPLAT_BLOTS` | 8 | drops in the splat burst (client) |

---

## §7 Commands, queries, and events

### Commands

| Command | Legal when | Effect | Result |
|---|---|---|---|
| `newGame(seed, size)` | `seed` is a non-negative integer and `size` a key of `MAP_SIZES` | regenerate at that size | `{ok:true}` |
| `place(slot, q, r, facing, color)` | see Commands rule (`color` one of `colorChoices`) | build in `color` (replacing any Thing there), redraw slot, tick | `{ok, events}` |
| `rotate(q, r)` | a Belt, Bridge, Spring, Rocket, Cannon, Pusher, or Puller is there | turn clockwise; no tick | `{ok, events: []}` |
| `remove(q, r)` | any Thing is there | take it off (a piece left on open water sinks), tick | `{ok, events}` |
| `blast(q, r)` | a crate (or big crate) is there | blow it up (lost + its value), tick | `{ok, events}` |
| `move(slot, fq, fr, q, r, facing)` | `hand[slot]` is a Mover, a Thing is on (fq,fr), and its kind may go on (q,r) (with a facing if it aims) | the Thing goes from (fq,fr) to (q,r), same kind and color (replacing any Thing there; a piece left on open water sinks), redraw slot, tick (D-47) | `{ok, events}` |
| `scrap(slot, fq, fr)` | `hand[slot]` is a Mover and a Thing is on (fq,fr) | take the Thing off for good (a piece left on open water sinks), redraw slot, tick (D-47) | `{ok, events}` |
| `bomb(slot, hexes)` | `hand[slot]` is a Bomb; `hexes` 1 to `wipes` distinct board hexes, each holding a Thing or a piece | clear each: its Thing off, its piece destroyed (lost + a crate's value; a gremlin is an ex-gremlin), redraw slot, tick (D-48) | `{ok, events}` |
| `discard(slot)` | `0 <= slot < HAND_SIZE` | redraw that slot, tick | `{ok, events}` |
| `wait()` | always | tick | `{ok, events}` |
| `newGoals()` | always | deal goal set `set + 1`, counted from `counters()` now; no tick, `Rando` untouched (D-75) | `{ok: true, events: [goals{set}]}` |
| `restore(data)` | `GameState.fromJSON(data)` takes it (a known size, terrain, piece and card kinds, whole-number counters, `counts` holding exactly `STORED_COUNTERS`, each a whole number ≥ 0 (D-74), `goals` as the GameState row says (D-75), `phase` `'player'`, `rng` a uint32) | the state becomes `data`'s (the same GameState object), the board is rebuilt over its hexes, `Rando` goes back to `rng`; no tick (D-67) | `{ok, events: []}` |

Illegal → `{ ok:false }` and nothing changed (hand and `Rando` included).

### Queries
- `canPlace(kind, hex)` → bool — the check `place` enforces.
- `legalPlacements(kind)` → `Set<key>` — every hex where `canPlace` holds (none for a tool card).
- `canPick(kind, hex)`, `legalPicks(kind)` → bool, `Set<key>` — where a tool card's clicks may land (the Mover: every hex holding a Thing; the Bomb: every hex holding a Thing or a piece; none for a Thing card, D-47, D-48).
- `colorChoices(kind)` → color names — the colors `place` accepts for that kind: the open colors for a `colored` kind (the client asks the player when there's more than one), `[WHITE]` for any other (D-32).
- `affects(thing, piece)` — whether a Thing's color lets it act on that piece.
- `thingAt(q, r)`, `pieceAt(q, r)`, `targetAt(q, r)`, `sourceOf(color)`, `openColors()`, `isEndpoint(hex)`.
- `unlockedKinds()`, `drawableKinds()` — the kinds open so far, and the deck the Draw rule uses.
- `spawnKind()` — `'bigcrate'` or `'crate'` for the next spawn (Tick rule; one `Rando` roll per spawn, D-34, D-45).
- `counters()` → `{key: n}` — this game's count on every `perGame` `COUNTERS` row (Counters rule, D-74).
- `goalStates()` → `[{counter, label, count, amount, met}]` — the goal set as the UI shows it, each count from the set's base (Goals rule, D-75).
- `save()` → `state.toJSON()` — the whole game as JSON data, `rng` included; `restore` takes it back (D-67).
- `board.*`.

### Events (each `move` with its start hop, each end with the hop it happened on)

| Event | Fields |
|---|---|
| `move` | `id, path: [{q,r}…], hop, over` — one per piece that moved: one hex per hop from hop `hop` (the hop it entered `path[0]`), in order, including slides and a bumper's follow; a hop it sat out (a bumper waiting on its contact hop, a flight about to drop back) repeats its hex. `over` is how many of the first hexes it passed over (a Cannon's shot, unseen, D-36), else 0. Every `move` comes before every end, a bumped line's after its bumper's (D-38) |
| `sink` | `id, hop` (the piece is gone from that hop on, after its last `move`, or where it stood, at hop 0, if the Bridge or Slide under it was removed, moved or scrapped) |
| `deliver` | `id, hop` |
| `splat` | `id, by, trap, hop` — a piece destroyed by a Rocket's flight, a Trap, a target, a gremlin's step, a mid-air crash, or `blast` or `bomb` (hop 0), or a newly opened source or target (the tick's last hop, D-44): `by` is the flier or gremlin that landed on it, or the other flight it crashed into (D-38), or null for the launched piece itself, a trapped piece (after its `move`), a shot or flight with nowhere to come down, a blasted crate, a bombed piece, or a cleared piece; `trap` is true only when a Trap killed it |
| `spawn` | `id, q, r` — a new crate on a source, or a gremlin climbing out on the shore |
| `redraw` | `slot` — the hand slot the idle rule redrew this tick |
| `milestone` | `count` — a milestone this tick's deliveries reached (after the tick's other events) |
| `open` | `color, source: {q,r}, target: {q,r}` — the color that milestone opened, right after its `milestone` |
| `clear` | `kind, q, r, hop` — a Thing taken off its hex outside the tick's motions: by a newly opened source or target, right after its `open`, at the tick's last hop (with a `splat` for a piece it destroyed, D-44); or by `bomb`, at hop 0, before the tick's own events, each hex's `clear` before its piece's `splat` (D-48). The client bursts it over the hop after `hop` |
| `unlock` | `kinds` — the `UNLOCKS` step that milestone opened, after its `milestone`, `open` and clears |
| `goal` | `index, counter, amount` — a goal of the set met this tick, at the end of the tick's events (after milestones), in the set's order (D-75) |
| `goalsDone` | `set` — right after the `goal` that met the set's last goal (D-75) |
| `goals` | `set` — `newGoals` dealt this set (its only event; no tick, D-75) |

A piece pushed into water gets a `move` whose path ends on the water hex, then `sink`.

### Client contract [D]
The client reads state, calls commands and queries, never writes state, never calls
`Rando`, and animates only from events.

### Goals on screen — GameUI [D-76]
*Serves:* the player always sees the three goals and how far along each is, can re-roll them,
and is offered what next when a set is done. Client only: it reads `goalStates()`, calls
`newGoals()` and reacts to the `goal` / `goalsDone` events of a tick it animated.
```
goals panel (under the tally, top right; hidden until there's a board):
  per goal: capitalized label, "min(count, amount) / amount"; met → green with ✓
  New goals → newGoals(): no tick; works mid-animation (like rotate); ignored under an overlay
  expand → overlay 'goals' (ignored under an overlay)
Goals view ('goals', a Pager; holds Go like every overlay):
  page 0 Goals: per goal label, count / amount, a bar (met: green, ✓, full); New goals (stays open)
  page 1 Achievements: the active achievements (Achievements client section, D-79)
when a tick's animation ends, if goals.set is still the set it started with:
  goal events → a banner under the milestone's, one line each:
                a MESSAGES.goalMet wording picked with Math.random, {amount} and {label} filled
  goalsDone → Go off; overlay 'goalsDone' (after the news panel closes, if one opened)
goals met ('goalsDone'): "Goals met!"
  New game → the New Game size panel; New goals → newGoals(), close; Keep playing / Esc → close
  (a met set stays on the goals panel, green, until New goals); every other key and click eaten
```
Help's sixth page, Goals and achievements, describes the mechanic only (no counters or
amounts). New goals isn't a telemetry command; GameUI hands the recorder each set it deals, the new game's set 0 included, as a goal-set record (Telemetry section, D-77). The save around the sign-in redirect carries
the goals in `engine.save()`; an open goals-met panel isn't saved (the bar's Sign in is
ignored under an overlay).

### Save around the sign-in redirect — GameUI [D-67]
*Serves:* signing in (a full-page redirect and back) never costs the game in play. The top-left
bar's Sign in (`signInFromGame()`, Sign-in section) calls `saveForRedirect()` just before it redirects; autosave and Continue (save-resume)
build on the same save later. The engine and state stay DOM-free; GameUI does the storage, every
touch of `localStorage` in try/catch.
```
save (localStorage[SAVE_KEY], JSON):
  { version: SAVE_VERSION, savedAt: unix seconds,
    state: engine.save(),                              # the whole GameState, Rando's rng included
    ui: { zoom, scale, panX, panY, telemetryGameKey, telemetrySeq, running } }   # telemetrySeq: GameTelemetry.eventSeq()

saveForRedirect() → bool:
  no board, or the intro / New Game panel / About over the intro is up: save nothing, false
  write the save; storage refused or full: false        # never throws
  # a picked card, selection, open overlay, carried Thing or Bomb booms are not in it: the caller
  # backs them out first, as Esc would; what the engine hasn't heard of is simply not saved

boot (GameUI.start, after the input is wired):
  save ← localStorage[SAVE_KEY]; none: the intro, as always
  remove it                                            # read once, whatever happens next
  if the URL's OAuth state starts with SIGNIN_STATE_PREFIX (a sign-in return, D-68)
     and it parses, version = SAVE_VERSION, 0 ≤ now − savedAt < SAVE_REDIRECT_MAX_AGE_S
     and ui.telemetrySeq is a whole number ≥ 0 and engine.restore(save.state) is ok:
    GameTelemetry.resumeGame(seed, size, telemetryGameKey, telemetrySeq)   # same game record, its events numbered on, D-65
    Go off; zoom and pan back (a bad view context: 1x, centered); no intro, no first-time Help
  else: the intro, with no message                     # bad, old, wrong-version, or not a return
```
| Name | Value | Meaning |
|---|---|---|
| `SAVE_KEY` | `'thingfactory.run'` | the save's localStorage key (`GameDisplayArtifacts`; Start fresh removes it, D-63) |
| `SAVE_VERSION` | 1 | the save's shape; any other version is dropped (D-67) |
| `SAVE_REDIRECT_MAX_AGE_S` | 1800 | seconds a save stays good for a sign-in return (D-67) |
| `SIGNIN_STATE_PREFIX` | `'signin.'` | how every OAuth `state` signin.js sends begins, so a page URL whose `state` has it is a sign-in return (D-67, D-68) |

---

## §8 Telemetry [D; D-64, D-65, D-66, D-70, D-71, D-77, D-80]
*Serves:* tuning §6 from real play (how far games get, how fast, what players build), and bugs
players never report. Two halves, and a report: the browser recorder (`telemetry.js`, `GameTelemetry`, D-65),
which makes the records and sends them in batches, and the server side (D-64): the ttdat
Worker's `POST /t` and its D1 database; `just telemetry-report` reads that database back as tables (D-66). `crash.js` sends one crash record of its own to the same endpoint (Crash report, D-71). The engine knows nothing of telemetry; GameUI hands the
recorder each new game, each committed command, each goal set dealt (D-77) and each achievement rung announced (D-80).

### Recorder — `GameTelemetry` (telemetry.js) [D-65]
```
page load:
  nothing: no player, record, timer or listener until the first startGame
  player ← a random UUID with the first recorded game (or a switchIdentity after it), in memory only,
           never stored, kept for the page load              # identity, sent once per batch

startGame(seed, size):                         # GameUI.startGame: the intro's size pick, New Game
  flush('fetch')                               # the last game's records, under its own game record
  if not allowed(): stop recording             # allowed = <html data-version> set (a ship build)
                                               #   and location.protocol is http: or https:
                                               #   and navigator.globalPrivacyControl isn't true
  game ← { gameKey: a fresh random UUID, startedUnixSeconds, seed, size, version: data-version,
           rulesVersion: RULES_VERSION, userAgent (cut to 512), screen: "${innerWidth}x${innerHeight}@${devicePixelRatio}" }
  eventSeq ← 0                                 # the seq this game's next event record gets
  the first time: listen for pagehide, and visibilitychange to hidden → flush('beacon')
  start the flush timer

command(command, args, res, state):            # GameUI.commit, every engine command but rotate
  if no game: nothing
  snap ← state after the tick: turn, delivered, lost, exGremlins, trapped,
         things (Things on the board), crates (pieces that aren't gremlins),
         deliveredByColor (CRATE_COLORS.map(each color's target's delivered, 0 for a color not open))
  if command ∈ {place, remove, discard, move, scrap, bomb, blast}:
      queue event { gameKey, seq: eventSeq, unixSeconds, command, accepted: res.ok, ...snap, args }; eventSeq += 1
                                               # accepted or refused; milestones aren't numbered
  for each milestone{count} in res.events (wait and Go included): queue milestone { gameKey, milestone: count, unixSeconds, ...snap }
  if res.ok, for each goal{index, counter, amount} in res.events (D-77):
      queue goal met { gameKey, set: state.goals.set, index, counter, amount, turn: state.turn, unixSeconds, met: true }
  queued records (all four lists) ≥ TELEMETRY_FLUSH_RECORDS → flush('fetch'), else start the timer if it isn't running

goalSet(how, state):                           # D-77; GameUI: after startGame ('start', set 0) and on every New goals
  if no game or backing off: nothing           #   ('next' when every goal of the old set was met, else 'reroll')
  queue goal set { gameKey, set: state.goals.set, how, turn: state.turn, unixSeconds,
                   goals: state.goals.list → [{counter, amount}] }   # GOALS_PER_GAME of them, in order
  queued records ≥ TELEMETRY_FLUSH_RECORDS → flush('fetch'), else start the timer

rungs(announced):                              # D-80; GameUI's GameAchievements listener, every change
  if no game, backing off or announced empty: nothing
  for each announcement {counter, amount, …} (rungsReached's own included, in the order announced):
      queue rung { gameKey, counter, rung: amount, unixSeconds }
  queued records ≥ TELEMETRY_FLUSH_RECORDS → flush('fetch'), else start the timer
  # the recorder's rules, Global Privacy Control included: unlike the totals' sync (D-79), these are tuning data

flush(via):                                    # also when the timer fires (TELEMETRY_FLUSH_MS)
  nothing queued and the game record already sent → nothing
  batch ← { format, player, games: [game], events, milestones, goalSets, goalsMet, rungs }; empty the queue
  via 'fetch': fetch(endpoint, POST, keepalive, credentials omit); via 'beacon': navigator.sendBeacon
  any failure: dropped, never retried, never shown, never thrown into the game
  a fetch answered 429 or 403 (D-70): back off for TELEMETRY_BACKOFF_MS: the queue dropped, and until
    then command() records nothing, flush() drops what it has and sends nothing, no timer starts
    (sendBeacon can't see its answer)

switchIdentity(token?):  flush('fetch') under the current player, then player ← a fresh random UUID
                   (none before the first game, which makes its own), token ← the sign-in's access
                   token or null; every later batch carries the token while it is set (D-68);
                   the game, its key and eventSeq carry on
gameKey(), eventSeq(): the current game's key (or null) and the next seq, for the redirect's save (D-67)
resumeGame(seed, size, gameKey, eventSeq):     # a game restored after the sign-in redirect (D-67)
  startGame(seed, size); if recording and gameKey is a non-empty string:
    game.gameKey ← gameKey; eventSeq ← the saved eventSeq (a whole number ≥ 0)
  # no saved key: a fresh key and eventSeq 0, as a new game
endpoint: TELEMETRY_ENDPOINT (https://ttdat.yuwakisa.com/t) from anywhere, portal builds too;
          a page on localhost, 127.0.0.1 or [::1] (wrangler dev) posts to its own origin + '/t'

beforeCrash():   for crash.js (D-71): flush('beacon'), then { player, token, gameKey (or null), quiet (backing off) }
```

### Crash report — crash.js [D-71]
*Serves:* bugs players never report. The crash screen's first error (the `crashed` flag, D-63) also sends one crash record.
```
showCrash(err, message):                       # after the card is up
  not (data-version set and location.protocol http:/https: and navigator.globalPrivacyControl ≠ true) → nothing
                                               # the recorder's rules, checked in crash.js itself
  ids ← GameTelemetry.beforeCrash() if telemetry.js loaded (its queue goes first, by sendBeacon), else none
  ids.quiet (the recorder backing off, D-70) → nothing
  crash ← { format: TELEMETRY_FORMAT (1 if displayartifacts.js never loaded), unixSeconds, version: data-version,
            gameKey: ids.gameKey or null, seed, size, turn: index.js's state with a board, else null,
            message: the card's text cut to CRASH_MESSAGE_CHARS,
            stack: err.stack's first whole lines up to CRASH_STACK_CHARS (one longer line cut), or null,
            userAgent cut to 512 }
  navigator.sendBeacon(the recorder's endpoint, { format, player: ids.player or a fresh random UUID, token: ids.token if set, crashes: [crash] })
  any failure: ignored; nothing about the send shows on the card; later errors send nothing
```
Event `args`, as GameUI reads them before the command runs:

| command | args |
|---|---|
| `place` | `kind`, `q`, `r`, `facing` (null for a kind that doesn't aim), `color` |
| `remove` | `q`, `r`, `kind` (the Thing removed; null if none) |
| `discard` | `kind` (the card), `how`: `'pick'` (picked, then the Discard spot or X; a tool's too, before its first click) or `'slot'` (the card's ×, Shift+1/2/3) |
| `move` | `kind` (the Thing carried), `fromQ`, `fromR`, `q`, `r` (where it lands), `facing` (null if it doesn't aim) |
| `scrap` | `kind`, `q`, `r` |
| `bomb` | `hexes`: [{q, r}…] |
| `blast` | `q`, `r` |

`wait` and `rotate` get no event record.

### Records (JSON fields camelCase; D1 columns snake_case)

| Record | Fields |
|---|---|
| game | `gameKey` (a random ID per game), `startedUnixSeconds`, `seed`, `size` (a `MAP_SIZES` key), `version` (the commit hash from `<html data-version>`), `rulesVersion` (`GameArtifacts.RULES_VERSION`), `userAgent`?, `screen`? |
| event | `gameKey`, `seq` (0, 1, 2, … per game, in the order the recorder queued its event records), `unixSeconds`, `command` (one of the engine's commands, §7), `accepted` (bool), the snapshot after its tick: `turn`, `delivered`, `lost`, `exGremlins`, `trapped`, `things` (Things on the board), `crates` (pieces that aren't gremlins), `deliveredByColor` (4 whole numbers ≥ 0, the crates delivered to each color's target in `CRATE_COLORS` order: red, green, blue, yellow; 0 for a color not open); `args`? (the command's arguments: `kind`, `q`, `r`, `facing`, `color`, anything else) |
| milestone | `gameKey`, `milestone` (the count reached: 10, 20, 50, …), `unixSeconds`, the same snapshot and `deliveredByColor` |
| crash | `unixSeconds`, `message`, `format`?, `version`?, `gameKey`?, `seed`?, `size`?, `turn`? (each null if unknown), `stack`?, `userAgent`? |
| goal set (D-77) | `gameKey`, `set` (0 for the game's first, +1 per New goals), `how` (`'start'` the new game's set, `'reroll'` New goals with goals of the last set unmet, `'next'` New goals after a set all met), `turn` (when dealt), `unixSeconds`, `goals` (exactly `GOALS_PER_GAME` `{counter, amount}`: a goal counter key and a whole amount ≥ 1, in the set's order) |
| goal met (D-77) | `gameKey`, `set`, `index` (0 to `GOALS_PER_GAME` − 1, its place in the set), `counter`, `amount`, `turn` (after the tick that met it), `unixSeconds`, `met` (always `true`) |
| rung (D-80) | `gameKey` (the game it was reached in), `counter` (a `COUNTERS` key), `rung` (the mark its lifetime total passed: a whole number ≥ 1), `unixSeconds` |

`?` = may be missing or null. Fields a record doesn't list are ignored, so a new optional field
needs no format bump.

### Batch format
One JSON object, sent as `text/plain` (no CORS preflight; `sendBeacon` can carry it):
`{ format, player, token?, games?: [game…], events?: [event…], milestones?: [milestone…], crashes?: [crash…], goalSets?: [goal set…], goalsMet?: [goal met…], rungs?: [rung…] }`.
  The goal lists (D-77) and `rungs` (D-80) are additive: a batch without them (an older build) is read as before, so `format` stays 1.
- `format` — `TELEMETRY_FORMAT` (worker/telemetry.js and `GameDisplayArtifacts`), bumped in both
  whenever a field is renamed, removed or retyped. The itch.io and Newgrounds zips run whatever
  build was uploaded for months, so old clients keep sending old shapes: the Worker keeps one
  reader per known format (`READERS`; `KNOWN_FORMATS` = [1]). Until a build that sends telemetry
  ships, the format changes in place without a bump, since nothing is deployed and no portal build
  has shipped telemetry: an event's required `seq` (D-64) and the required 4-number
  `deliveredByColor` array are format 1 that way.
- `player` — the sender's random per-load ID (a string, at most 64 chars).
- `token`? — the sign-in's access token while signed in (D-68; in the body, not an Authorization
  header, so `sendBeacon` can carry it and no CORS preflight is needed). Never logged or stored.
- Identity is per batch, not per game: one game may run under a random ID, then a signed-in
  one, then a new random one. Every row a batch writes is stamped with its identity: a token
  that verifies (Sign-in section) gives `player_id` = the salted hash of its `sub`, `signed_in` 1;
  otherwise `player_id` = `player`, `signed_in` 0.

### Endpoint — `POST /t` (worker/index.js → worker/telemetry.js)
```
fetch(request):
  POST /auth/token → the sign-in's code exchange (Sign-in section)
  POST /achievements → a signed-in player's lifetime totals (Achievements server section, D-78)
  anything but POST /t → 404                # the static assets serve every file before this
  Origin header set and not in TELEMETRY_ORIGINS (nor env.TELEMETRY_DEV_ORIGINS, wrangler dev's
    http://localhost:8787) → 403, nothing written                       # D-70; no Origin goes on
  TELEMETRY_LIMIT.limit({key: CF-Connecting-IP}) says no → 429, nothing written, body never read
    # D-70: TELEMETRY_RATE_LIMIT, 1000 per 10 s per IP; no binding or a throwing limiter → let through
  body > MAX_BODY_BYTES → 400
  not a JSON object → 400
  format missing, not a number, or not in KNOWN_FORMATS → 204, nothing written, console.error with no body
  READERS[format](batch) fails (a list that isn't one, > MAX_RECORDS records in all, a record
    that isn't an object, a required field missing (or an empty string), a wrong field type or length, an
    event's seq not a whole number ≥ 0, an unknown command, a bad arg column, a deliveredByColor that isn't 4 whole numbers ≥ 0;
    a goal record (D-77) with a `how` not in GOAL_HOWS, a set < 0, an index outside 0 … GOALS_PER_SET − 1, a turn < 1,
    not exactly GOALS_PER_SET goals, a counter not in GOAL_COUNTERS, an amount not a whole number ≥ 1, met not true;
    a rung record (D-80) with a counter not in ACHIEVEMENT_COUNTERS or a rung not a whole number ≥ 1) → 400, nothing written
  else → 204 (Access-Control-Allow-Origin: *); ctx.waitUntil(identity, then one D1 batch of every row)
         identity = identityFor(batch.token) (Sign-in section) or the batch's random player
         a failed write is console.error'd and dropped
```
A crash's `message` and `stack` are cut to `CRASH_MESSAGE_CHARS` / `CRASH_STACK_CHARS`, not
refused; its `format` defaults to the batch's. The request's IP (`CF-Connecting-IP`) is read only
as the rate limiter's key (D-70): never written to D1, logged or echoed back, and the limiter's
counters are Cloudflare's, short-lived and in memory. No other header is read but Origin and
`Content-Length`; Cloudflare observability is off. 403 and 429 carry `Access-Control-Allow-Origin: *`
so a cross-origin page sees them and backs off.

### Database — D1 `ttdat-telemetry`, bound as `TELEMETRY` (worker/telemetry_schema.sql)
- `games` — PK `game_key`; `player_id`, `signed_in` (of the batch that first inserted it), `format`,
  `started_unix_seconds`, `seed`, `size`, `version`, `rules_version`, `user_agent`, `screen`.
  `INSERT OR IGNORE`: the browser resends the game record in each batch of its game.
- `events` — PK (`game_key`, `seq`); `seq` is the event record's own, numbered by the recorder and
  bound as sent (nothing reads the game's earlier rows); `INSERT OR IGNORE`, so a resent event is kept
  once; the snapshot columns, `delivered_red`/`delivered_green`/`delivered_blue`/`delivered_yellow`
  (INTEGER NOT NULL, `deliveredByColor` in `CRATE_COLORS` order), `kind`/`q`/`r`/`facing`/`color`
  from `args` (null where absent), `rest` JSON `{args: the other args}`, NULL when there are none.
- `milestones` — PK (`game_key`, `milestone`), `INSERT OR IGNORE`; the snapshot and the four
  `delivered_<color>` columns; `rest` (JSON of fields without a column) is NULL, as none is left.
- A table that already exists isn't altered by rerunning the schema (`CREATE TABLE IF NOT EXISTS`);
  a local database made before a table changed is recreated with `just local-d1-clear` (deletes
  `.wrangler/state/v3/d1`, then applies the schema as `just d1-local` does).
- `crashes` — `id` autoincrement, plain INSERT; `format`, `version`, `game_key`, `seed`, `size`, `turn`,
  `message`, `stack`, `user_agent`.
- `goal_sets` (D-77) — PK (`game_key`, `set_no`), `INSERT OR IGNORE`; `player_id`, `signed_in`, `how`, `turn`, `unix_seconds`,
  `counter1`, `amount1`, `counter2`, `amount2`, `counter3`, `amount3` (the set's goals in order).
- `goals_met` (D-77) — PK (`game_key`, `set_no`, `idx`), `INSERT OR IGNORE`; `player_id`, `signed_in`, `counter`, `amount`,
  `turn`, `unix_seconds`. Both are new tables, so rerunning the schema adds them (`just d1-local`; production's
  at the designer's go, before a Worker that writes them is deployed: a batch's write is one D1 batch, and a
  missing table would lose all of it).
- `rungs` (D-80) — PK (`player_id`, `counter`, `rung`), `INSERT OR IGNORE`: each player reaches each rung once, the
  first record kept (a resend, or the same rung announced again on another device or after a sign-in); `signed_in`,
  `game_key` (the game it was reached in), `unix_seconds`. A new table, added by rerunning the schema as the goal tables.
- Every row carries `player_id` and `signed_in`; no foreign keys; no IP column. Indexes: games by
  start time, events by time (only: each index on events is another written row per event, D-64),
  crashes by time and by version.

### Telemetry report — `just telemetry-report` / `just telemetry-local` (tools/telemetry_report.js) [D-66]
*Serves:* tuning §6 from what the tables hold, as plain text a designer reads in a terminal.
Plain Node, no npm: `tools/telemetry_report.js` (the CLI) and `tools/telemetry_report/`
(`records.js` rows → records, `figures.js` pure sums, `render.js` tables, `volume.js` the Volume section's figures, size and free-plan numbers). It reads and never writes.
```
just telemetry-report [days]                     # node tools/telemetry_report.js wrangler.jsonc …, WRANGLER = yuwakisacloud's
  a local-d1 argument → "telemetry-report reads production only; … just telemetry-local [days]", exit 1, the tool never run
just telemetry-local [days]                      # the same with local-d1 passed
tool args (after the config):
  args: at most one local-d1 and one whole number ≥ 1, in either order; anything else → the usage, exit 1
  source: no name → production: refused (exit 1, wrangler never run) while wrangler.jsonc holds
            PUT-THE-DATABASE-ID-HERE; else wrangler d1 execute ttdat-telemetry --remote --env production --json
          local-d1 → the same with --local (wrangler dev's database under .wrangler/)
  read:   seven SELECTs, one per table: every game (so an older game's events in the period drop with it,
          not as left out); events, milestones, crashes, goal_sets, goals_met, rungs with unix_seconds ≥ since
          (since = now − days × 86400, or 0); rows → records (camelCase, signedIn bool, an event's args
          = its non-NULL arg columns + rest.args, deliveredByColor = the four delivered_<color> columns,
          a goal set's goals = its counterN/amountN columns, a goal met's index = idx, a rung's columns as they are)
  period: the games started ≥ since, their events, milestones, goal sets, goals met and rungs; events and milestones whose game has
          no games row are left out (counted in the heading), goal sets, goals met and rungs with no games row
          too (not counted); crashes by their own time
  print:  heading (source, period, counts of games / events / milestones / crashes, versions and
          rules versions seen with their game counts, signed-in games), then the sections; with
          several rules versions every section once per rules version, lowest first (a crash goes
          with its game; crashes with no game in the report get a last block of their own); then
          Volume once, last (it is about the database, not a rules version)
  size:   wrangler d1 info ttdat-telemetry --config … --json (production: + --env production), after the
          SELECTs; its database_size in bytes; no size or a failure → "unknown (local)" for local-d1
          (wrangler's d1 info asks Cloudflare's API, so it never knows the local database),
          "unknown (wrangler d1 info gave no size)" for production — the report still prints
```
Sections, in order (a table with no rows prints `(none)`):
- **Games** — started per UTC day; by board size (`MAP_SIZES` order, read from artifacts.js); by version (games, first and last day).
- **Milestones** — per board size, per milestone count reached: games, share of that size's games, the turn reached (least, median, mean, most), and the median delivered / lost / ex-gremlins / trapped then.
- **Commands** — per command, count and refused, most first; place and discard by card kind; discards by `how` (`pick` / `slot`).
- **Bomb** — accepted bombs by hexes per bomb.
- **Sessions** — games per random `player_id` (a page load: `signed_in` 0 games rows); a game's real length, first to last record (its start, events, milestones), and the same without gaps of `LONG_PAUSE_SECONDS` or more, with the count of those long pauses; turns at its last record (games with no event or milestone counted apart).
- **Clients** — per game: the User-Agent bucketed to "browser / OS" by a small regex table (Edge, Opera, Samsung Internet, Firefox, Chrome, Safari; Windows, iOS, Android, ChromeOS, macOS, Linux; else "other", none "unknown"); window sizes rounded down to `WINDOW_BUCKET_PX`; device pixel ratios.
- **Crashes** — per version; messages with numbers as N, most first, with distinct games hit; crashes with no game, and with a game not in the report.
- **Players** — distinct signed-in `player_id`s (rows of any table with `signed_in` 1: identity is per batch) and those seen on more than one UTC day, or "no signed-in games"; games whose rows carry more than one identity (switched mid-game).
- **Goals** (D-77) — "Goals: N sets dealt (how n, …), M done" (sets done: every goal of a recorded set met), then per goal counter, most dealt first: times dealt, re-rolled away (unmet in a set that a `reroll` set followed), met, and the median turns from its set's deal to the goal met (goals met whose set record is known; "-" with none).
- **Achievements** (D-80) — "Achievements: N rungs reached by M players" (rung records and distinct `player_id`s), then per counter, most players first (ties by name): the distinct players who reached any of its rungs, the highest rung seen, and the distinct players per rung, rising ("10: 3, 20: 2, 50: 1").
- **Volume** (figures in tools/telemetry_report/volume.js, printed by render.js, D-72; printed once, last) — rows written per UTC day over the period, per table (games, events, milestones, crashes, goal sets, goals met, rungs; the goal tables D-77, rungs D-80) and in total, each row on the day of its own time column (`started_unix_seconds` for games, `unix_seconds` for the others), every row read in the period whether or not its game is in the report; each day's share of `D1_FREE_ROWS_WRITTEN_PER_DAY`, marked `*` at or over `WARN_SHARE`; then `busiest day <day> N rows = P% of the free plan's daily writes` (`WARNING: ` before it at or over `WARN_SHARE`; "busiest day: none" with no rows); a note that index writes and the Worker's requests aren't in the tables, so aren't counted; then `size: <bytes> = P% of the free plan's <D1_FREE_DB_BYTES> per database` (`WARNING: ` at or over `WARN_SHARE` of `D1_FREE_DB_BYTES`) or `size: unknown (…)`.

### Numbers [T]
| Name | Value | Meaning |
|---|---|---|
| `LONG_PAUSE_SECONDS` | 300 | the report: a gap this long or longer between a game's records is a long pause, left out of its active length (D-66) |
| `WINDOW_BUCKET_PX` | 100 | the report: window sizes are rounded down to this many px each way (D-66) |
| `D1_FREE_ROWS_WRITTEN_PER_DAY` | 100000 | [P] the report's Volume section: D1's free-plan rows written per day, from https://developers.cloudflare.com/d1/platform/pricing/, checked 2026-11-21 (tools/telemetry_report/volume.js, D-72) |
| `D1_FREE_DB_BYTES` | 500 MB (500 000 000 bytes) | [P] the report's Volume section: D1's free-plan maximum database size, from https://developers.cloudflare.com/d1/platform/limits/, checked 2026-11-21; read as decimal MB (D-72) |
| `WARN_SHARE` | 0.5 | the report's Volume section: a day's writes, or the database's size, at or over this share of its free limit is marked and its line starts `WARNING:` (D-72) |
| `TELEMETRY_FORMAT` | 1 | the batch format this build sends and reads |
| `MAX_BODY_BYTES` | 64 KB | the largest batch body |
| `MAX_RECORDS` | 200 | records per batch, all seven lists together (the goal lists too, D-77, and rungs, D-80) |
| `GOAL_COUNTERS`, `GOALS_PER_SET` | the 14 goal counter keys / 3 | worker/telemetry.js's twins of `COUNTERS`' goal keys and `GOALS_PER_GAME` (R-97 checks them equal, D-77) |
| `CRASH_MESSAGE_CHARS` | 500 | a crash's message is cut to this |
| `CRASH_STACK_CHARS` | 2000 | a crash's stack is cut to this (its first lines) |
| `TELEMETRY_FLUSH_MS` | 30000 | ms the recorder waits before sending what it has queued (`GameDisplayArtifacts`, D-65) |
| `TELEMETRY_FLUSH_RECORDS` | 50 | queued records that send at once, before the timer (D-65) |
| `TELEMETRY_ENDPOINT` | https://ttdat.yuwakisa.com/t | where batches go from anywhere but localhost (D-65) |
| `TELEMETRY_RATE_LIMIT` | 1000 per 10 s | `POST /t` requests per `CF-Connecting-IP` before 429: about 100 a second, a flood tripwire (worker/telemetry.js, enforced by wrangler.jsonc's `TELEMETRY_LIMIT` binding in both environments; the period must be 10 or 60, D-70) |
| `TELEMETRY_ORIGINS` | ttdat.yuwakisa.com, html-classic.itch.zone, uploads.ungrounded.net (https) | the Origins a browser may post from; others 403 (worker/telemetry.js; wrangler dev adds http://localhost:8787 by `TELEMETRY_DEV_ORIGINS`, D-70) |
| `TELEMETRY_BACKOFF_MS` | 300000 | after a 429 or 403 the recorder records and sends nothing for this long (`GameDisplayArtifacts`, D-70) |
| `RULES_VERSION` | 1 | `GameArtifacts`: the rules a game ran under, on its game record. Hardly ever changes: only for a drastic, breaking rules change, at the designer's call; ordinary rule and tuning changes keep it (the commit hash tells builds apart) (D-65) |

---

## §9 Sign-in [D; D-68]
*Serves:* knowing a returning player across page loads in telemetry, without making anyone sign
in; later, saves and achievements build on it. Playing never needs it. For now a sign-in changes
telemetry's identity and, through the achievements client (D-79), where a player's lifetime totals live (the Worker's achievements endpoint, D-78). Thing Factory is a public OAuth client of yuwakisacloud's auth/ (its
`/authorize` page offers "Sign in with Bluesky" through bskyoidc): authorization code with PKCE,
run in the browser (`signin.js`, `GameSignIn`), with two small server halves in the ttdat Worker
(`worker/auth.js`). auth/ is reached from the Worker only through the `AUTH_SERVICE` service
binding; its issuer is `AUTH_ISSUER` and this game's client row `TTDAT_CLIENT_ID` (wrangler.jsonc
vars, per environment). The client row lives in auth/'s D1, another repo: README "Deploy" has its
seed SQL. Signing out (the bar's Sign out, D-69) only forgets the sign-in locally.

### Browser — `GameSignIn` (signin.js) and GameUI's spots
```
offered: location's origin ∈ SIGNIN_SITES (http(s) only)    # the live site, wrangler dev on :8787
         else nothing at all: no button, label or About line (portal iframes, file://, the dev page)

current(): localStorage[AUTH_KEY] = { token, handle (or null), expiresAt (unix s) }
           missing → signed out; unreadable, tokenless or expiresAt ≤ now → removed, signed out
           # no refresh token: an expired sign-in silently counts as signed out

spots (the top-left bar by Help, About and Sound; the intro, beside About; New Game, under Keep playing):
  signed out → a "Sign in" button, title "Sign in with Bluesky (optional)"
  signed in  → a plain label in its place: "@" + handle, or "Signed in" with no handle;
               in the bar only, a "Sign out" button right after it (D-69)
  About's credits page, one line: "Not signed in. Signing in with Bluesky is optional." /
  "Signed in with Bluesky as @handle." / "Signed in with Bluesky."

Sign in from the bar (signInFromGame):
  under an overlay, not offered, or signed in → nothing
  the picked card goes back and the selection goes (in the view only, no command sent)
  a board: saveForRedirect() (D-67); refused → REASONS.signInSave, nothing else
  Go off; begin()
Sign out from the bar (signOut, D-69):            # no tick: works mid-animation, like Sound
  under an overlay, or signed out → nothing
  GameTelemetry.switchIdentity(null)   # the queue goes under the signed-in identity (with the token),
                                       # then a fresh random player, no token, for the next batches
  localStorage[AUTH_KEY] removed (GameSignIn.signOut, try/catch)   # no revoke call to auth/
  the spots and About's line show signed out
  no confirm, no reload: the game in play, Go and the animation carry on; its later rows carry the
  random ID, signed_in 0 (identity is per batch, D-64)
Sign in from the intro or New Game (signInFromPanel):
  no save (no game, or New Game ends it); Go off; begin()       # the return lands on the intro
begin():
  verifier ← 32 random bytes, base64url (43 chars); state ← SIGNIN_STATE_PREFIX + 16 random bytes, base64url
  sessionStorage[SIGNIN_FLOW_KEY] ← { state, verifier }         # refused → false, nothing else
  location.assign(issuer + '/authorize?' + response_type=code, client_id, redirect_uri = origin + '/',
                  scope = SIGNIN_SCOPE, state, code_challenge = base64url(SHA-256(verifier)), S256)
  any failure → false: the save is dropped and REASONS.signInFailed shows

boot (GameUI.start, after restoreSaved, D-67):
  a stored sign-in → GameTelemetry.switchIdentity(token); the spots show it
  a return (the URL's state starts with SIGNIN_STATE_PREFIX, with code or error) → finish():
    flow ← sessionStorage[SIGNIN_FLOW_KEY], removed; code, state, error, error_description, iss
    stripped from the URL (history.replaceState)
    not offered, no code, no flow, or flow.state ≠ state → signed out, silently
    POST SIGNIN_TOKEN_PATH (form: code, code_verifier, redirect_uri), credentials omitted
    200 with access_token and expires_in → localStorage[AUTH_KEY] ← { token, handle, now + expires_in }
      (refused storage: signed in for this page load only); GameTelemetry.switchIdentity(token)
      (what was queued goes under the random ID first); the spots show it
    anything else → signed out, silently
```

### Worker — `worker/auth.js`
```
POST /auth/token (exchangeCode):                 # auth/'s /token has no CORS (auth/ D-38)
  sign-in not configured (no AUTH_SERVICE, AUTH_ISSUER or TTDAT_CLIENT_ID) → 404 {error: sign_in_unavailable}
  body > MAX_EXCHANGE_BYTES, or no code, code_verifier or redirect_uri → 400 {error: invalid_request}
  AUTH_SERVICE.fetch(AUTH_ISSUER + '/token', POST form: grant_type=authorization_code, code,
                     redirect_uri, client_id = TTDAT_CLIENT_ID, code_verifier)
  unreadable → 502 {error: server_error}
  not ok or no access_token → 400 {error: auth/'s error code, else server_error}
  else → 200 {access_token, expires_in, handle: the ID token's preferred_username (≤ MAX_HANDLE_CHARS) or null}, no-store

identityFor(token) (a telemetry batch's, inside its ctx.waitUntil write):
  not a non-empty string ≤ MAX_TOKEN_CHARS, or sign-in not configured → null
  verifyAccessToken(token, issuer AUTH_ISSUER, audience TTDAT_CLIENT_ID, keys via AUTH_SERVICE,
                    CLOCK_SKEW_S)                 # the vendored auth-client (worker/vendor/auth-client)
  invalid, scope without PLAY_SCOPE, or any error → null (console.error with the reason only)
  else → { playerId: hex(SHA-256(PLAYER_SALT + sub)), signedIn: 1 }
  null → the batch's random player, signed_in 0             # a batch is never refused over auth
```
Nothing in the Worker logs or stores a token, code, verifier, handle or `sub`; only the hash is
written. worker/index.js imports the vendored auth-client (TypeScript, bundled by wrangler with
`cbor-x` from `worker/node_modules`) lazily, on the first token it must check.

### Numbers [T]
| Name | Value | Meaning |
|---|---|---|
| `SIGNIN_SITES` | the live site → auth.yuwakisa.com; http://localhost:8787 → http://localhost:8788 | where sign-in is offered, with auth/'s issuer and this game's client id there (`GameDisplayArtifacts`; wrangler.jsonc's `AUTH_ISSUER`/`TTDAT_CLIENT_ID` match) |
| `SIGNIN_SCOPE` | `'openid profile ttdat:play'` | what the browser asks for: an ID token with the handle, and the play scope |
| `PLAY_SCOPE` | `'ttdat:play'` | the scope a telemetry token must carry (worker/auth.js) |
| `PLAYER_SALT` | `'ttdat-player-v1:'` | hashed with `sub` into a signed-in player_id; changing it splits every signed-in player |
| `AUTH_KEY` | `'thingfactory.auth'` | localStorage: the sign-in |
| `SIGNIN_FLOW_KEY` | `'thingfactory.signin'` | sessionStorage: the state and verifier, across the redirect only |
| `SIGNIN_TOKEN_PATH` | `'/auth/token'` | the Worker's code exchange, on the page's own origin |
| `CLOCK_SKEW_S` | 60 | seconds of clock skew a token's iat/exp may have (auth/'s consumer contract) |
| `MAX_TOKEN_CHARS` | 4096 | a longer telemetry token isn't verified |
| `MAX_EXCHANGE_BYTES` | 4096 | the code exchange's largest form body |
| `MAX_HANDLE_CHARS` | 253 | a longer `preferred_username` gives no handle (a Bluesky handle is a DNS name) |

## §10 Achievements server [D; D-78]
*Serves:* achievements (lifetime totals of the counters, measured on the ladder, D-74) that follow
a signed-in player across devices; accumulation. The server half only: a signed-in player's
lifetime total per counter lives in the ttdat Worker, one Durable Object per player. No client
calls it but the achievements client (Achievements client section, D-79), which decides who adds
what, and when (Counters rule: `rungsReached` is counted there). Signed-out players have no server
totals.

### PlayerTotals — the Durable Object (worker/player_totals.js), bound as `PLAYER_TOTALS`
```
one object per player, named by identityFor's playerId (hex SHA-256 of PLAYER_SALT + sub)
SQLite-backed (wrangler.jsonc migration tag v1, new_sqlite_classes ['PlayerTotals']; top level and env.production)
storage: ctx.storage.kv, a key per counter → its lifetime total (a whole number > 0); no key = no total
totals()        → {totals: {key: n for every key}}
add(increments) → for each key, n: n > 0 → kv.put(key, (kv.get(key) ?? 0) + n); then totals()
                  # synchronous, no await: nothing runs between an add's reads and writes, no count lost
```

### Endpoint — `POST /achievements` (worker/index.js → worker/achievements.js)
```
body: {token: string, add?: {counterKey: whole number}}        # JSON, sent as text/plain like /t
Origin set and not allowed (as /t: TELEMETRY_ORIGINS, TELEMETRY_DEV_ORIGINS) → 403, body never read
TELEMETRY_LIMIT.limit({key: CF-Connecting-IP}) says no → 429, body never read   # /t's limiter and numbers
body > MAX_BODY_BYTES, not a JSON object → 400
add present and: not an object, > MAX_ADD_KEYS keys, a key not in ACHIEVEMENT_COUNTERS,
  a value not a whole number in 0 … MAX_ADD_VALUE → 400
identityFor(token) (Sign-in section: issuer, audience TTDAT_CLIENT_ID, PLAY_SCOPE) null → 401
  # a missing token too
no PLAYER_TOTALS binding, or the object throws → 503
stub = PLAYER_TOTALS.get(idFromName(playerId))
add has keys → stub.add(add), else stub.totals()
→ 200 {totals}
every answer: Access-Control-Allow-Origin *, Cache-Control no-store
```
`ACHIEVEMENT_COUNTERS` is every `GameArtifacts.COUNTERS` key (perGame or not) in table order,
restated in the Worker (worker/counters.js, which /t's rung check reads too, D-80). Nothing here stores or logs the IP (only the limiter's key), the token or
the `sub`; it writes no telemetry rows. Refusals are logged with the field only.

### Numbers [T]
| Name | Value | Meaning |
|---|---|---|
| `MAX_ADD_KEYS` | 64 | most counter keys one add may carry |
| `MAX_ADD_VALUE` | 100000 | largest increment one add may carry for a counter |

The body limit is /t's `MAX_BODY_BYTES` (Telemetry numbers), shared.

## §11 Achievements client [D; D-79]
*Serves:* achievements (a counter's lifetime total passing each rung of its ladder, D-74) seen as
they're reached and listed while they're active; accumulation across games. The browser half:
`GameAchievements` (achievements.js, loaded after signin.js) keeps the totals and announces rungs;
GameUI hands it each command's counters and shows what it announces. Client only: the engine never
sees it, and it never calls `Rando` (wordings by `Math.random`).

### Store — `GameAchievements.configure(token | null)`
```
GameUI calls it at boot (the stored sign-in's token, or null), on a sign-in (its token), on sign-out (null)
leaving a server copy → flush() first (what's unsent goes); then everything is reset:
location file:                      → 'local':  totals = localStorage[ACHIEVEMENTS_KEY] ({key: n}; unreadable → {})
http(s) with a token                → 'server': totals = null; POST {token} → /achievements
anything else (signed out, portals, the dev page) → none: status 'off', nothing counted
# Global Privacy Control doesn't stop it (the player's own service); the D-70 backoff does
```
`/achievements` is beside `TELEMETRY_ENDPOINT` (its `/t` replaced), or a localhost page's own
origin. Play before a sign-in isn't added to the account (no merge).

### Counting — `counted(before, after)` [D]
```
GameUI.commit: before = engine.counters(); an accepted command; counted(before, engine.counters())
none here, or backing off → nothing
inc = {key: after − before for every COUNTERS key that rose}       # a fall or no change adds nothing
totals null ('server', not in yet) → early += inc; return           # announced when they come
apply(inc):
  pass = inc
  loop:
    rungs = 0
    for c in COUNTERS (table order) with pass[c] > 0:
      before = totals[c] ?? 0; totals[c] += pass[c]
      for r in rungsCrossed(c.scale, before, totals[c]) (rising):
        announce {counter, label, amount: r, negative, line}; rungs += 1
    rungs == 0 → stop; else pass = {rungsReached: rungs}             # can cross a rung of its own
  line = (c.negative ? MESSAGES.rungNotoriety : MESSAGES.rungReached)[floor(Math.random() · 3)],
         {amount} and {label} filled
'local' → localStorage[ACHIEVEMENTS_KEY] = totals; 'server' → unsent += every increment applied
the listener (GameUI) hears the announcements
```
A new game starts its counters at 0 and a restored save carries them (D-67), so the differences
never count anything twice.

### Server sync [D]
```
POST {token} answered 200 {totals} → totals = them; apply(early); early = {}
  (any other answer, or a failed fetch: asked again TELEMETRY_FLUSH_MS later, the queue waiting)
every TELEMETRY_FLUSH_MS with something unsent, and on pagehide: POST {token, add: unsent}; unsent = {}
  # fetch, keepalive, credentials omit, the body JSON as text/plain (no preflight, as /t)
any answer 429 or 403 → early = unsent = {}; nothing counted or sent for TELEMETRY_BACKOFF_MS
any answer 401 → none here until the next configure
an answer to an earlier configure is ignored
```
The running copy isn't replaced by an add's answer (it would count again what was added since).

### On screen — GameUI [D]
```
the listener: announcements → GameTelemetry.rungs (a rung record each, under telemetry's rules, D-80) and the achievement banner, after the tick animating (anim.rungs), else now;
              the Achievements page redrawn if it's showing
achievement banner (#rung-banner, under the goal banner; doesn't stop play):
  one line per announcement, at most RUNG_BANNER_LINES at once, each up MILESTONE_MS; the rest wait
  their turn; a negative counter's line marked 'negative'
Goals view page 1, Achievements (drawn as it's shown, and as the totals change while it's shown):
  rows: counters with total > 0, by toward = (total − reached) / (next − reached), highest first
        (reached 0 below the first rung; ties in COUNTERS order); standing(scale, total) gives reached, next
  row: capitalized label, total, "Reached n" or "No mark yet", "· Next n", a bar of toward
  a row whose reached differs from the page's last drawing with totals known → class 'flash' (once)
  'on', no rows → "Nothing counted yet. …"
  'loading' → "Fetching your achievements…"
  'off', sign-in offered → "Achievements are kept while you are signed in." + Sign in
                           (closes the view, then the bar's Sign in, D-68)
  'off', not offered → "Achievements are kept only on the game's own site, while signed in."
```

### Numbers [T]
| Name | Value | Meaning |
|---|---|---|
| `ACHIEVEMENTS_KEY` | `'thingfactory.totals'` | a file:// copy's totals in localStorage (displayartifacts.js) |
| `RUNG_BANNER_LINES` | 3 | achievement banner lines showing at once |

The banner time is `MILESTONE_MS`; the flush interval and backoff are telemetry's
`TELEMETRY_FLUSH_MS` and `TELEMETRY_BACKOFF_MS`.

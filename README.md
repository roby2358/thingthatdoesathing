# Thing Factory

A thing that does a thing. Build a contraption on a hex board, one Thing at a time,
while it runs. Pick the board at New Game: 16 × 10 fits the screen; 20 × 20, 30 × 30 and
60 × 60 pan. Crates come out of the source; get them to the target. Milestones at 10, 20, 50, 100, 200,
500, 1000, and on; the factory never ends. On bigger boards each milestone opens a new
crate color (up to 2 on 20 × 20, 3 on 30 × 30, 4 on 60 × 60), with its own target: usually
from a new source of its own, about one time in six from one already running, so a line has
to split. A new source or target takes its hex whatever stands there: a Thing on it is gone, and so is a
gremlin or a crate (counted as an ex-gremlin, or lost). A target takes only its color; other colors can't get onto it, though a Rocket flies over.
Crates keep coming from a fixed cycle of the four colors, one slot a tick: an open color's slot
makes a crate at its source and a closed color's slot makes nothing, so one color gets a crate
every 4 ticks and four colors one every tick. That goes on until the board holds its
cap (more on bigger boards, one more per milestone). Now and then one comes out as a big
crate, drawn bigger and worth 10 delivered (or 10 lost): 1 in 100 at the start, 1 in 20 by the
fifth milestone, and commoner with each milestone after that, toward nearly all of them.
Every Thing does exactly one thing, every tick.

It needs a mouse and a keyboard (hover, right-click, the wheel, a few letter keys), so it plays
on a computer, touchscreen laptops included. A phone or tablet (no mouse attached) gets a short sorry page
instead of the game, with a "Try it anyway" button and a "Copy link" button for opening it on a computer.

Forked from the author's Hex & Counters base. See [DYNAMICS.md](DYNAMICS.md)
for why it works and [ONTOLOGY.md](ONTOLOGY.md) for the rules.

## The Things

| Thing | Does |
|---|---|
| Belt | moves what's on it 1 hex in its facing |
| Spring | flings what's on it 3 hexes, over lakes and up to 2 mountains (it can't land on a mountain, so it comes down short of one; a Wall stops it); it skids on if it lands on ice |
| Rocket | blasts what's on it up to 8 hexes, stopping early at something solid or the outer sea, and delivering if it crosses its color's target (it flies over lakes); a crate that lands on ice skids on (unless it splatted a gremlin, then it stops there); splats any gremlin it hits, and any gremlin riding it |
| Cannon | lobs what's on it over the next 4 hexes, whatever is on them (water, mountains, Walls, crates, gremlins: it touches none of them), then moves it into the 5th like a Belt would (it can sink, deliver, slide on ice or bump a line there); if the 5th is blocked it comes down on the 4th, and if the 4th can't take it either the Cannon doesn't fire |
| Pusher | pushes whatever is on the hex in front of it 1 hex on |
| Puller | reaches across the hex in front and pulls whatever's beyond it into that hex |
| Wall | nothing gets in (never on a source: the crates must flow) |
| Trap | a gremlin that comes onto it is caught (a new one climbs out on the shore); crates are safe |
| Bridge | built on water; carries what's on it 1 hex in its facing, like a Belt over water |
| Slide | ice you can build, on plains or water (not on ice, which already slides): what comes onto it keeps sliding the same way (a Spring or Rocket that lands on it skids on) |
| Mover | not a Thing but a card: pick up a Thing you've placed and put it down somewhere else (same kind, same color); back out after picking it up and the Thing is scrapped |
| Bomb | not a Thing but a card: clear up to 5 hexes of whatever is on them (Things, crates, gremlins); a bombed crate counts as lost, a gremlin as an ex-gremlin; sources and targets stay |

A new game deals only Belts, Bridges, Walls and Traps. Each milestone unlocks the next card
and the milestone banner shows it: Pushers and Pullers (with the second color; a 16 × 10 board skips
them), then the Slide, the Spring, the Mover, the Cannon, the Rocket, and the Bomb last. Cards already in your hand stay.
The Mover and the Bomb are rare cards, like the Pusher and Puller.

Pushers and Pullers always work in one crate color: a red one moves only red crates, and every
gremlin. That's how you split a mixed line, so they're only dealt once a second color opens.
The card comes plain; when you place it, a little square of swatches pops up beside the hex
and you pick its color (click a swatch or press its number). The color is for good: to change
it, place another one over it.
They're rare cards; about one per color is all a factory needs.

Terrain: water sinks pieces, ice makes them slide (over at most 4 ice hexes in a row, then they stop), mountains block. A piece that runs into
another standing on ice (or a Slide), on the ground or out of the air, shoves it and the
pieces right behind it two hexes on, and comes to rest right behind them. Gremlins wander and
ride your belts, and a gremlin that steps onto a crate wrecks it (one pushed into a crate
is just stopped, or bumps it on if the crate is on ice). A gremlin next to a crate may also
pounce on it (16% a tick, before anything moves, even from a Belt that was carrying it) and
smash it. A gremlin
that comes onto a target dies there, so they can't camp it.

## UI

- Each crate color has its own shape, so colors tell apart without the hue: plain cubes, drums, cubes bound with dark straps, tied sacks; which color gets which is shuffled at each new game (the same seed, the same shapes), but within a game every color keeps one; a big crate is the same shape, bigger
- A source fills its hex with the color of the crates it makes, with a light plus across it; a source that makes several colors is split into equal wedges, one per color, under a pale plus. A target fills its hex with its color, with two light rings. Both have a dark outline so they stand out from the land and water around them
- `1` `2` `3` or click a card to pick it; legal hexes tint yellow
- `R` / `Shift+R` / mouse wheel turn the Thing before placing
- A Pusher or Puller asks for its crate color after you click its hex: click a swatch or press `1`–`4`; Esc, right-click or a click elsewhere backs out with the card still picked
- The Mover: pick it, then click a Thing on the board (they tint yellow) to pick it up; the card becomes that Thing, and you place it like any card (one tick for the whole move). Esc or right-click before picking up puts the card back; after, it scraps the Thing (one tick), as `X` / Discard all does. A click on a bare hex does nothing
- The Bomb: pick it, then click hexes with something on them (they tint yellow): each click blows its hex up on the spot, Thing, crate and gremlin, with no tick. Esc or right-click before the first boom puts the card back. The first boom spends the card; the fifth, or Esc / right-click / `X` / Discard all after fewer, ends the bomb and the world ticks once. A click on a bare hex does nothing
- Click a yellow hex to place it; the world ticks once and animates. A yellow hex with a dashed ring holds a Thing: placing there replaces it (the old Thing's card is gone)
- With no card picked, click a hex to select it: it lights up, a mover shows a white arrow, and Go holds. Click it again to turn a Belt/Spring/Rocket/Cannon/Pusher/Puller clockwise (free: no tick); click anywhere else (or Esc) to let go. While a hex is selected, a banner at the top says what you can do with it ("Click to turn, click outside to deselect, D to delete", or the parts of that which fit)
- `D` removes the Thing on the selected hex (click it first), leaving the hex bare and letting go of it; the card is gone and the world ticks once. With nothing selected, `D` does nothing
- Ten ticks in a row without placing or discarding a card redraws one card at random (it glows)
- `B` blows up the crate under the cursor (a stuck line); it counts as lost and the world ticks once
- Pick a card, then press `X` to throw it away; the world ticks once
- Click Discard all (right of the cards) to throw away all three cards at once and draw three new ones; the world ticks once for the lot (a picked card goes back first; while the Mover carries a Thing it scraps it, and after a Bomb's first boom it ends the bomb, as `X` does)
- Or throw a card away in one go: click the small red × in its corner, or press `Shift+1` / `Shift+2` / `Shift+3`; the world ticks once (not while the Mover carries a Thing or a Bomb has gone off)
- Space: one tick, then stop. With Go running, Space finishes the tick in flight and turns Go off
- Wait: let it run one tick
- Enter / Go (top centre): keep ticking until Pause (Enter again finishes the tick in flight and stops); picking a card or selecting a hex holds the run
- Esc or right-click puts the card back; left-drag pans (the board can't be dragged off the screen)
- Map `1` `2` `∞` (buttons under the top-left bar): the board at full or half size, or the whole board in the space above the hand; zooming keeps the middle of the screen where it is, and every new game starts at `1`. Buttons only: the number keys pick cards and the wheel turns the Thing
- Top right: crates delivered toward the next milestone (and per color, once there are two), Ex-gremlins (gremlins done in), Trapped (gremlins a Trap caught), and crates lost
- Goals (under the tally): three goals per game, each a thing to do so many times ("Crates delivered 12 / 50"), counted from when they were dealt; a met goal turns green with a ✓ and a banner says so (play goes on). New goals deals three fresh ones at once, no tick (works mid-tick, not under a panel); ⤢ opens the Goals view, the goals with progress bars and its own New goals, then (→) Achievements, your lifetime marks nearest the next first, while signed in or in a file copy (ticks hold while it's open; any key or a click off its buttons closes it). Meeting all three stops Go and asks: New game (the board-size picker), New goals, or Keep playing (Esc; the met goals stay up until New goals)
- `M` / Sound (top left, by Help): turn all sound on or off; remembered in this browser, works any time (not while an overlay is open)
- Help (top left): six pages, the keys legend in two (B and on is the second), then the special cards (picking a Pusher's or Puller's crate color, the Mover, the Bomb), then every Thing and tool card (its picture, name and what it does, the same line its card shows on hover), then the world (crates, big crates, gremlins, ice, open water, milestones), then goals and achievements (how they work); `<` `>` or ← → turn the pages, any other key or a click closes it. It opens on the keys, also once when the first game opens; ticks hold while it's open
- About (top left, by Help; also a link on the intro): who made it, how it was made (with AI), the version and the board's seed (selectable, for bug reports), and a privacy page that lists what the game sends and says Global Privacy Control turns it off (achievement totals, kept for you while signed in, aren't stopped by it); `<` `>` or ← → turn the pages, any other key or a click closes it; ticks hold while it's open
- If the game hits a bug, a card says so over everything, with the error and the version and seed (selectable, for a bug report), Reload, and Start fresh (drops any saved game, in case it's what broke, and reloads; the sound setting stays). A ship build also reports the error once to the telemetry endpoint (the message, the first lines of the stack, version, seed, board size, turn and browser type), under the same rules as the rest of telemetry: never from the dev page or `file://`, never under Global Privacy Control
- New Game: pick a board size (click or `1`–`4`); Esc keeps the current game
- Sign in (optional; top left by Help, About and Sound, and on the intro and New Game): "Sign in with Bluesky" through yuwakisa's sign-in page and back. Playing never needs it; for now it only lets the game's telemetry recognize you across visits (a hashed form of your account; your handle stays in your browser). Signed in, the button shows your handle, with a Sign out button after it in the top-left bar: it signs out at once, without a reload, and the game keeps going; About says whether you're signed in. A sign-in lasts a few hours, then you're quietly signed out. Only on ttdat.yuwakisa.com (and `just dev-worker`): the itch.io and Newgrounds builds and `file://` don't show it
- Signing in keeps your game: just before the sign-in page the game is saved in this browser, and when you come back (signed in or not) it picks up where it was, map zoom included, with Go off; a save more than 30 minutes old is dropped. From the intro or New Game nothing is saved and you come back to the intro. Any other reload still starts at the intro

## Deploy

Three places run the game, all from the same ship build (`just ship`, see CLAUDE.md):

| Target | Patch it with |
|---|---|
| https://ttdat.yuwakisa.com | `just deploy` |
| itch.io | `just ship`, then upload `dist/ttdat-<commit>.zip` on the game's edit page |
| Newgrounds | `just ship`, then upload the same zip |

`just deploy` builds and runs `wrangler deploy --env production` (the `ttdat` Cloudflare Worker,
`wrangler.jsonc`: the build as static assets, plus `worker/`, which takes telemetry batches at
`POST /t` into a D1 database, passes the sign-in's code exchange on to auth/ at
`POST /auth/token`, and keeps a signed-in player's lifetime counter totals at `POST /achievements`
in the `PlayerTotals` Durable Object, one per player). The Worker's one npm dependency (`cbor-x`, for the vendored auth-client in
`worker/vendor/`) installs into `worker/node_modules` with `just worker-deps`
(`npm ci --ignore-scripts`), which `deploy`, `dev-worker` and `preview` run on their own when it's
missing. It uses yuwakisacloud's wrangler, so that repo sits next to this
one. It refuses while production's D1 id is still the placeholder (see below); `just deploy
--dry-run` checks the bundle without uploading. `just preview` serves the build locally first.
Commit before you ship: the build's version is the commit hash, marked `-dirty` when there are
uncommitted changes.

By hand, once:

1. In `../yuwakisacloud`: `just bootstrap` (installs wrangler), then `just login` (or
   `just whoami` to see you're already logged in to the account that holds yuwakisa.com).
2. Make sure no DNS record for `ttdat.yuwakisa.com` exists in the yuwakisa.com zone.
3. The telemetry database: `just d1-production` creates `ttdat-telemetry` on the account and
   prints its `database_id`. Paste it over `PUT-THE-DATABASE-ID-HERE` in `wrangler.jsonc`'s
   `env.production`, then run `just d1-production` again: it gives the database its tables
   (`worker/telemetry_schema.sql`; every statement is safe to rerun). Commit the id.
4. The sign-in's client row in auth/ (yuwakisacloud's `auth` D1, not this repo; see "Sign-in"
   below): run the production SQL there once, and deploy auth/ before ttdat if it isn't live.
5. Here: `just deploy`. The first deploy creates the `ttdat` Worker, the DNS record and the
   certificate (`custom_domain` in `wrangler.jsonc`); give the certificate a few minutes. It also
   applies `wrangler.jsonc`'s Durable Object migration (tag `v1`, `new_sqlite_classes`
   `PlayerTotals`), which creates the class the achievements totals live in (D-78); wrangler runs a
   migration once per tag, and undoing it (renaming or deleting the class) takes a new tag, so the
   first deploy of a Worker carrying it waits for the designer's go.
6. Check https://ttdat.yuwakisa.com in a clean browser profile, then sign in with Bluesky once.
7. When you're ready, retire the old copy at yuwakisa.com/thingthatdoesathing/: remove it from
   yuwakisaweb, or replace it with a redirect page to https://ttdat.yuwakisa.com/.

### Telemetry

Once a board is picked, the game records each game (seed, board size, version, rules version,
browser type and window size) and every command but waits and rotations (with whether it was
accepted and the tally after its tick), plus each milestone, each goal set dealt, each goal met and each achievement rung reached, and sends them in batches to
`POST /t` on ttdat.yuwakisa.com, the portal builds included, under a random ID made fresh for
each page load; a player signed in with Bluesky sends the sign-in's token with each batch, and
the Worker stamps those rows with a salted hash of the account instead (`signed_in` 1). Only ship builds served over http(s) send (`<html data-version>` set: not the
dev page, not `file://`), a browser with Global Privacy Control on sends nothing, and a send
that fails is dropped silently. The Worker checks each batch and writes it to the
`ttdat-telemetry` D1 database (tables `games`, `events`, `milestones`, `crashes`, `goal_sets`, `goals_met`, `rungs`;
`worker/telemetry_schema.sql`), never storing or logging an IP (it is read only as the key of a
rate limit, 1000 requests per 10 s per IP, and requests from other websites' pages are refused;
a browser told 429 or 403 sends nothing for 5 minutes). The About panel's privacy page
says this to players. CLAUDE.md (`telemetry.js`, `worker/`) has the details.

Locally, telemetry goes to a D1 database in `.wrangler/`: `just d1-local` once (safe to run
again) gives it its tables, then `just dev-worker` serves the build with the Worker at
http://localhost:8787, and `../yuwakisacloud/node_modules/.bin/wrangler d1 execute ttdat-telemetry
--local --command "SELECT * FROM games"` shows what arrived. Rerunning `just d1-local` never changes
a table that already exists: `just local-d1-clear` empties the local database (it deletes
`.wrangler/state/v3/d1` and makes the tables again), which also recreates one made before a table
changed; stop `just dev-worker` first. Production's database is made
once with `just d1-production` (step 3 above); rerunning it adds a new table (the goal tables, D-77; `rungs`, D-80)
and must come before deploying a Worker that writes it.

`just telemetry-report` prints what players do as plain-text tables, for tuning: games per day,
board size and version; per board size, the turn each milestone was reached; commands and
refusals, places and discards by card; bomb sizes; sessions and game lengths; browsers, window
sizes and pixel ratios; crashes; signed-in players; goals (per goal counter: dealt, re-rolled away, met, median turns
to meet; sets done); achievements (per counter: players reaching each rung, the highest rung seen); and last, Volume: rows written per UTC day
against D1's free-plan daily write limit and the database's size against its size limit, with a
WARNING line once either reaches half. It reads production's database (and refuses
while the placeholder id is still in `wrangler.jsonc`); `just telemetry-local` reads
the local one, and a number limits it to games started in that many days
(`just telemetry-local 7`). It only reads.

### Achievements

`POST /achievements` (D-78) takes `{token, add?}`, sent as text/plain like `/t`: the sign-in's
token (missing or not verifying: 401) and an optional `{counterKey: n}` of increments (keys from
`ACHIEVEMENT_COUNTERS` in `worker/counters.js`, every `COUNTERS` key; each 0 to 100000; at most
64; anything else: 400). It adds them in that player's `PlayerTotals` object (named by the salted
hash of the account, never the account itself) and answers `{totals}`. The same Origin check and
rate limit as `/t` come first; no IP or account is stored or logged, and it writes no telemetry
rows. Under `just dev-worker` the object lives in `.wrangler/` (U-42).

In the browser (D-79), `achievements.js` (`GameAchievements`) adds what each command counted (the
rise in the game's counters) to the player's lifetime totals: a signed-in player's on the server
(fetched at sign-in, increments sent every 30 s and on leaving the page, whatever Global Privacy
Control says; sign-out sends the rest and stops), a file:// copy's in `localStorage`
(`thingfactory.totals`); signed out, or on a portal, nothing is counted. Each mark a total passes
(10, 20, 50, 100, … by its scale) shows a banner line under the goal banner (three at a time,
wry for the bad counters), and the Goals view's second page lists the active achievements, nearest
their next mark first.

### Sign-in

The optional "Sign in with Bluesky" (D-68) runs through yuwakisacloud's auth/: Thing Factory is a
public OAuth client there (authorization code with PKCE in the browser, scope `ttdat:play`), and
the Worker reaches auth/ through the `AUTH_SERVICE` service binding, verifying tokens offline with
its keys. Each environment needs one client row in auth/'s D1, with the id that
`wrangler.jsonc`'s `TTDAT_CLIENT_ID` and `displayartifacts.js`'s `SIGNIN_SITES` already carry.
That database belongs to yuwakisacloud, so these steps run there, by hand; nothing in this repo
writes to it.

Production, once (in `../yuwakisacloud/auth`, logged in to the account):

```bash
npx wrangler d1 execute auth --remote --command "INSERT OR IGNORE INTO clients (client_id, client_name, client_secret_hash, redirect_uris, allowed_scopes, token_auth_method, status, quota_monthly, created_at, updated_at) VALUES ('Bxcoy3Lb3sgm8Bus', 'Thing Factory', NULL, '[\"https://ttdat.yuwakisa.com/\"]', '[\"openid\",\"profile\",\"ttdat:play\"]', 'none', 'active', NULL, unixepoch(), unixepoch());"
```

Locally (auth/'s emulated D1, after `just install-dev` there; run again after its `just reset`):

```bash
npx wrangler d1 execute auth --local --command "INSERT OR IGNORE INTO clients (client_id, client_name, client_secret_hash, redirect_uris, allowed_scopes, token_auth_method, status, quota_monthly, created_at, updated_at) VALUES ('Jy9UmAa94JbLcMCa', 'Thing Factory', NULL, '[\"http://localhost:8787/\"]', '[\"openid\",\"profile\",\"ttdat:play\"]', 'none', 'active', NULL, unixepoch(), unixepoch());"
```

The row is a public client (no secret, PKCE only) whose redirect URI is the site's root; the
access token's audience is the client id, so no resource row is needed. To try it locally: in
`../yuwakisacloud/auth`, `just dev-up` (auth on :8788, bskyoidc on :8791; not the meta-repo's
`just dev-up`, which also puts jsonsolver on :8787); here, `just d1-local` and `just dev-worker`;
open http://localhost:8787 and Sign in. auth/'s local page also takes its dev password user,
which has no handle (the button then says "Signed in"). U-37 in CRITERIA.md is the full walk.


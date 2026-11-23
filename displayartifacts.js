// displayartifacts.js — GameDisplayArtifacts
//
// Client-only display attributes: hex/counter geometry, colors, names, and the one-line
// "what it does" text for each Thing. None of this affects adjudication; only GameUI (and
// the pixel helpers in hex.js) read it. Keyed off GameArtifacts, so it loads after it.
const GameDisplayArtifacts = (function () {
    const T = GameArtifacts.TERRAIN;

    // Mixes a '#rrggbb' color toward white by t (0 = unchanged, 1 = white).
    const lighten = (hex, t) => '#' + [1, 3, 5].map(i => {
        const v = parseInt(hex.slice(i, i + 2), 16);
        return Math.round(v + (255 - v) * t).toString(16).padStart(2, '0');
    }).join('');

    // Crate shades per CRATE_COLORS name, whatever its shape (D-84): lit top, mid left, dark right. Each also
    // gets `light`, its mid face mixed toward white: the marks over a source or target filled
    // with that color (D-42). Derived here, never picked per color.
    const PORT_MARK_LIGHTEN = 0.6;
    const CRATE_SHADES = {
        red:    { top: '#ff7a6b', left: '#d83a2e', right: '#8e1f18' },
        green:  { top: '#8ff08a', left: '#3fbf45', right: '#22762a' },
        blue:   { top: '#8ec4ff', left: '#3d7fe0', right: '#204a8e' },
        yellow: { top: '#fff08a', left: '#e8c230', right: '#9a7a12' },
    };
    for (const shades of Object.values(CRATE_SHADES)) shades.light = lighten(shades.left, PORT_MARK_LIGHTEN);

    return {
        HEX_SIZE: 34,
        COUNTER_SIZE: 30,
        HOP_MS: 140,                 // ms per animated hop in a tick
        RUN_GAP_MS: 250,             // Go: pause between ticks
        NOTICE_MS: 2500,             // how long a refusal's reason stays in the hover bar (D-55)
        // Why a click or key did nothing, for the hover bar (D-55). One place for the wording.
        REASONS: {
            buildWater: "Can't build on water",
            buildMountain: "Can't build on a mountain",
            buildEndpoint: "Can't build on a source or target",
            buildThere: "Can't build there",
            pickMover: 'Pick a Thing to move',
            pickBomb: 'Pick a Thing or a piece to clear',
            putDown: "Can't put it down there",
            bombHex: 'Pick a Thing or a piece to clear, or Esc to finish',
            selectFirst: 'Select a Thing first, then D',
            nothingToRemove: 'Nothing to remove there',
            noCrate: 'Point at a crate first, then B',
            carrying: 'Put the Thing down or Esc first',
            bombing: 'Finish the bomb or Esc first',
            signInSave: "Can't keep the game while you sign in",   // D-68: the save before the redirect was refused
            signInFailed: "Can't start the sign-in",
        },
        // The selection hint (D-82): a steady banner while a hex is selected, saying what can be
        // done to it. turns: a Thing whose template aims (a mover with a facing); fixed: any
        // other Thing; empty: a hex with no Thing.
        SELECT_HINTS: {
            turns: 'Click to turn, click outside to deselect, D to delete',
            fixed: 'Click outside to deselect, D to delete',
            empty: 'Click outside to deselect',
        },
        MILESTONE_MS: 3500,          // how long the milestone banner (and the goal banner, D-76) stays up
        // Messages the game shows, by occasion: each a list of whole sentences, one picked with
        // Math.random (never Rando) each time (D-76). goalMet: a goal of the set was met;
        // {amount} is its amount and {label} its counter's label ("50 crates delivered").
        MESSAGES: {
            goalMet: [
                'Goal met: {amount} {label}!',
                '{amount} {label}. That goal is done.',
                'There it is: {amount} {label}. Goal met.',
            ],
            // An achievement (D-79): a counter's lifetime total reached a rung of its ladder;
            // {amount} is the rung, {label} the counter's label. rungNotoriety is for a negative
            // counter (crates lost, cards discarded): wry, not congratulatory.
            rungReached: [
                'Achievement: {amount} {label}!',
                '{amount} {label}, all told. Well done.',
                'A new mark: {amount} {label}.',
            ],
            rungNotoriety: [
                '{amount} {label}. Someone is keeping count.',
                'Notorious: {amount} {label}.',
                '{amount} {label} so far. Not that anyone minds.',
            ],
        },
        RUNG_BANNER_LINES: 3,        // achievement lines showing at once (D-79); more wait their turn, each up MILESTONE_MS
        // Map-scale buttons (D-40): each divisor is a button showing the board at 1/d size;
        // a last "∞" button fits the whole board to the canvas (never above 1x).
        ZOOM_DIVISORS: [1, 2],
        MIN_TEXT_PX: 8,              // on-map text that would draw smaller than this is skipped
        // A phone or tablet: the primary pointer is coarse and can't hover, and no fine pointer
        // (a mouse) is attached either (D-41). The game needs a mouse and keyboard, so it shows
        // the sorry page, with a way past it, instead of the intro.
        TOUCH_ONLY_QUERY: '(pointer: coarse) and (hover: none) and (not (any-pointer: fine))',
        SORRY_PICTURE_PX: 64,        // the Belt drawn on the sorry page
        // The localStorage key of this game's saved run: written only just before the sign-in
        // redirect and removed on the next boot (D-67). The crash screen's Start fresh removes
        // only this key (D-63), never the mute setting ('thingfactory.muted', sound.js) or
        // anything else; crash.js keeps a copy of the key for a crash before this file loads.
        SAVE_KEY: 'thingfactory.run',
        SAVE_VERSION: 1,                 // the save's shape; a save with any other version is dropped (D-67)
        SAVE_REDIRECT_MAX_AGE_S: 1800,   // a save older than this (seconds) is dropped, not restored (D-67)
        // A return from the sign-in redirect, the only boot that restores a save (D-67): the
        // page URL's OAuth `state` starts with this. signin.js makes every state it sends to
        // auth/ as this prefix and a random part (D-68).
        SIGNIN_STATE_PREFIX: 'signin.',
        // The optional Bluesky sign-in (D-68), offered only on these page origins: the live site
        // and wrangler dev (`just dev-worker`). The portal builds (itch.io, Newgrounds iframes),
        // file:// and any other origin show no Sign in button. Each names auth/'s issuer and this
        // game's client row there (wrangler.jsonc's TTDAT_CLIENT_ID for the same environment);
        // the redirect URI is the origin + '/'.
        SIGNIN_SITES: {
            'https://ttdat.yuwakisa.com': { issuer: 'https://auth.yuwakisa.com', clientId: 'Bxcoy3Lb3sgm8Bus' },
            'http://localhost:8787': { issuer: 'http://localhost:8788', clientId: 'Jy9UmAa94JbLcMCa' },
        },
        SIGNIN_SCOPE: 'openid profile ttdat:play',   // the handle (profile) and the play scope (worker/auth.js PLAY_SCOPE)
        SIGNIN_TOKEN_PATH: '/auth/token',             // the Worker's code exchange, on the page's own origin
        AUTH_KEY: 'thingfactory.auth',                // localStorage: { token, handle, expiresAt } while signed in
        SIGNIN_FLOW_KEY: 'thingfactory.signin',       // sessionStorage: { state, verifier } across the redirect only
        // A file:// copy's lifetime totals for achievements (D-79): localStorage {counterKey: n}.
        // A signed-in player's live on the server (D-78) instead; anyone else has none.
        ACHIEVEMENTS_KEY: 'thingfactory.totals',
        HELP_CARD_PX: 32,            // each card's tile on Help's Things page (D-60)
        HELP_PIECE_SCALE: 1.4,       // a piece in a World picture, times its board size against the hex, so a gremlin's label still draws (D-61)
        HELP_LADDER_SHOWN: 7,        // milestones Help's World page lists before "and on" (D-61)
        // New Game menu note per GameArtifacts.MAP_SIZES key.
        MAP_SIZE_NOTES: {
            small:  'fits the screen',
            medium: 'drag to pan',
            large:  'drag to pan',
            huge:   'drag to pan',
        },
        TERRAIN_COLORS: {
            [T.WATER]: '#2a6faa',
            [T.PLAINS]: '#7db344',
            [T.MOUNTAIN]: '#7a7a7a',
            [T.ICE]: '#cfeaf2',
        },
        TERRAIN_NAMES: {
            [T.WATER]: 'Water — pieces sink',
            [T.PLAINS]: 'Plains',
            [T.MOUNTAIN]: 'Mountain — blocks',
            [T.ICE]: 'Ice — pieces slide across',
        },
        // Per-Thing look: name, short verb line (the card's hover text and Help's Things page,
        // D-60; every number in it must match the rules data, test/integration/doesnumbers.js;
        // gremlins only in the Trap's), base fill, accent, and how much of the hex
        // its tile covers. A colored kind (THINGS.colored) draws its accent in its Thing's color
        // instead (COLOR_INK); its card, not yet colored, uses COLOR_INK.white.
        THING_LOOK: {
            BELT:    { name: 'Belt',    does: 'moves what is on it 1 hex',                fill: '#3a3f47', ink: '#ffd633', inset: 0.84 },
            SPRING:  { name: 'Spring',  does: 'flings what is on it up to 3 hexes, leaping over lakes and mountains in between', fill: '#4a3a2a', ink: '#ff9a3c', inset: 0.84 },
            ROCKET:  { name: 'Rocket',  does: 'blasts what is on it up to 8 hexes, leaping over lakes in between', fill: '#4a2234', ink: '#ff5c8a', inset: 0.84 },
            PUSHER:  { name: 'Pusher',  does: 'pushes what is in front of it 1 hex on',   fill: '#2c2f4a', ink: '#ffffff', inset: 0.84 },
            PULLER:  { name: 'Puller',  does: 'pulls what is 2 hexes ahead 1 hex closer', fill: '#1f4a4a', ink: '#ffffff', inset: 0.84 },
            WALL:    { name: 'Wall',    does: 'nothing gets in',                          fill: '#8a5a3c', ink: '#5c3a24', inset: 1 },
            TRAP:    { name: 'Trap',    does: 'a gremlin that comes onto it is caught (crates are safe)', fill: '#3d3a33', ink: '#d9d4c7', inset: 0.84 },
            BRIDGE:  { name: 'Bridge',  does: 'carries what is on it 1 hex over water (build on water)', fill: '#a07a4a', ink: '#3d2812', inset: 0.84 },
            SLIDE:   { name: 'Slide',   does: 'what comes onto it slides on, like ice (build on plains or water)', fill: '#9fd3e6', ink: '#ffffff', inset: 0.84 },
            CANNON:  { name: 'Cannon',  does: 'lobs what is on it 5 hexes, leaping over the 4 in between, whatever is on them', fill: '#33383f', ink: '#c9d1d9', inset: 0.84 },
            // A tool card (D-47): drawn in the hand only, never on the board.
            MOVER:   { name: 'Mover',   does: 'pick up a placed Thing and put it down somewhere else (Esc after the pick-up scraps it)', fill: '#3b4a2c', ink: '#c8f07a', inset: 0.84 },
            BOMB:    { name: 'Bomb',    does: 'blow up to 5 hexes of Things and pieces, one click each (Esc after the first ends it)', fill: '#4a2620', ink: '#ff8a4c', inset: 0.84 },
        },
        // Help's World page (D-61): one row per part of the world, a picture, a name and a short
        // line in the Things page's style. `picture` is the spots gameui.js `worldPicture` draws
        // with the board's own code (a terrain, plus a Thing or a piece and its color); Milestones
        // has none. `says` gets the rules' numbers (gameui.js `worldNumbers`), so no
        // number is typed in here; test/integration/uiboot.js checks every number in each line
        // against GameArtifacts, and that gremlins are named only in the GREMLIN row.
        WORLD_LOOK: [
            { id: 'CRATE',     name: 'Crate',          picture: [{ terrain: T.PLAINS, piece: 'crate', color: 'red' }],
              says: () => "comes out of a source and is delivered on the target of its own color; another color's target blocks it (a flight passes over)" },
            { id: 'BIG_CRATE', name: 'Big crate',      picture: [{ terrain: T.PLAINS, piece: 'bigcrate', color: 'red' }],
              says: n => `counts as ${n.bigValue} crates delivered` },
            { id: 'GREMLIN',   name: 'Gremlin',        picture: [{ terrain: T.PLAINS, piece: 'gremlin', color: '#b05cd6' }],
              says: n => `wanders, smashes crates it walks into, and gets caught in Traps; next to a crate it may pounce on it and smash it (${n.lungePct}% a tick), even off a moving Belt` },
            { id: 'SLICK',     name: 'Ice',            picture: [{ terrain: T.ICE }],
              says: n => `what comes onto it slides on, up to ${n.maxSlide} more slick hexes; a piece standing still on it gets bumped along` },
            { id: 'WATER',     name: 'Open water',     picture: [{ terrain: T.WATER }],
              says: () => 'sinks whatever goes in' },
            { id: 'MILESTONE', name: 'Milestones',     says: n => `${n.ladder.join(', ')}, and on: each unlocks new cards until every card is unlocked, and on bigger boards the first ones also open a new crate color (up to ${n.colors} in all), with its own target and sometimes its own source` },
        ],
        // Accent per color for colored kinds: white (a card), or the crate color's lit face.
        COLOR_PICKER_PX: 84,   // the color picker's width and height (D-32), for placing it beside the hex
        COLOR_INK: { white: '#ffffff', red: '#ff7a6b', green: '#8ff08a', blue: '#8ec4ff', yellow: '#fff08a' },
        // Per-piece hover name. Gremlins carry their own counter color in state.
        PIECE_LOOK: {
            crate:   { name: 'Crate' },
            bigcrate: { name: 'Big crate' },   // the hover adds " — worth N" from PIECES' value
            gremlin: { name: 'Gremlin — wanders, pounces on crates' },
        },
        // The About panel (D-59): who made it and where the way back goes. feedbackUrl stays
        // empty until the game's GitHub Issues page is up (it'll point there); the feedback
        // line isn't shown while it's empty.
        ABOUT: {
            author: 'Yuwakisa',
            credits: [['Wrangler', 'Rob Young']],   // [role, name] rows under Credits
            homeUrl: 'https://yuwakisa.com',
            homeLabel: 'yuwakisa.com',
            feedbackUrl: '',
        },
        CRATE_SHADES,                // built above: top / left / right faces, plus `light`
        BIG_CRATE_SCALE: 1.5,        // a big crate is drawn this much bigger than a crate (D-34)
        // The crate shapes (D-84), so colors are told apart by shape as well as hue: each a key
        // into gameui.js's CRATE_DRAW. Each game deals them out over CRATE_COLORS once, shuffled
        // from its seed (GameUI.crateShapesFor, salted with CRATE_SHAPE_SALT), so within a game
        // every color has one shape, all different; CRATE_SHAPES_DEFAULT is the pairing used
        // while there's no game (the intro).
        CRATE_SHAPES: ['cube', 'cylinder', 'strapped', 'bag'],
        CRATE_SHAPES_DEFAULT: { red: 'cube', green: 'cylinder', blue: 'strapped', yellow: 'bag' },
        CRATE_SHAPE_SALT: 0x5AFE5EED,  // mixed into the seed for the shape shuffle's own stream
        // The non-color parts of the shapes: every shape's outline, the strapped cube's bands and
        // buckles, the bag's tie, the hoop and fold lines.
        CRATE_TRIM: { outline: '#000', strap: '#2a1f16', buckle: '#d8d8d0', cord: '#3a2814', line: 'rgba(0, 0, 0, 0.45)' },
        SPLAT_BLOTS: 8,              // drops in a splat burst
        // Sources and targets (D-42): a fill with light marks and a dark outline, since
        // several crate colors sit close to the terrain they border.
        SOURCE_COLOR: '#4ce08a',               // a source with no open color yet
        PORT_NEUTRAL_MARK: '#f2f2f2',          // the plus over a source that makes several colors
        PORT_OUTLINE: 'rgba(0, 0, 0, 0.7)',
        PORT_OUTLINE_WIDTH: 2,
        PORT_MARK_WIDTH: 4.5,                  // rings and plus, world px (2.25 on screen at 1/2)
        PORT_RING_RADII: [0.68, 0.34],         // a target's rings, as fractions of the hex's inner radius
        PORT_PLUS_REACH: 0.86,                 // how far the plus's arms reach toward the hex's rim
        // Canvas chrome — mirror --bg and --font in index.css.
        BG_COLOR: '#0e1116',
        UI_FONT: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        REACH_COLOR: '255, 214, 51',   // rgb of --accent
        // The telemetry batch format the browser sends (D-64); worker/telemetry.js's TELEMETRY_FORMAT,
        // bumped with it whenever a batch field is renamed, removed or retyped.
        TELEMETRY_FORMAT: 1,
        // The browser recorder (telemetry.js, D-65): where batches go from a ship build (a page on
        // localhost posts to its own origin instead), and how often: every TELEMETRY_FLUSH_MS, or
        // once TELEMETRY_FLUSH_RECORDS records are queued, whichever comes first.
        TELEMETRY_ENDPOINT: 'https://ttdat.yuwakisa.com/t',
        TELEMETRY_FLUSH_MS: 30000,
        TELEMETRY_FLUSH_RECORDS: 50,
        // After the Worker answers 429 (rate limit) or 403 (Origin not allowed), the recorder drops
        // that batch and records and sends nothing for this long (D-70).
        TELEMETRY_BACKOFF_MS: 300000,
        // The unlisted screencap key (P, D-58): beside the window-sized shot, one PNG per entry,
        // same center and zoom as the screen; the name goes in the file name.
        CAPTURE_SIZES: [
            { name: 'og', w: 1200, h: 630 },        // link preview (og:image, saved as og.png)
            { name: 'capsule', w: 630, h: 500 },    // itch.io cover image
            { name: 'shot', w: 1280, h: 720 },      // listing screenshot
        ],
    };
})();

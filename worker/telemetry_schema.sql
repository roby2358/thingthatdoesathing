-- The ttdat Worker's telemetry database (D-64): the tables of the D1 database bound as
-- TELEMETRY (ttdat-telemetry), written by worker/telemetry.js from POST /t batches. The fields that
-- are asked about most are columns; `rest` holds the others as JSON, and what has a column is not
-- also in `rest`. Every row carries player_id and signed_in, the identity of the batch that wrote
-- it (a random per-load ID, signed_in 0, until sign-in lands). No column holds an IP address.
--
-- `just d1-local` and `just d1-production` apply this file, and test/R-68 applies it to its own
-- database. Every statement is safe to run again. There is no migration history: a change to a
-- table that exists is made by hand, and said to the designer. A local database made before a
-- table changed is recreated instead: delete .wrangler/state/v3/d1, then run just d1-local. No
-- foreign keys: a game's events, milestones and crashes are kept whether or not its games row arrived.

-- One row per game, from the first batch that carries its game record (the browser resends the
-- record in every batch of that game; INSERT OR IGNORE keeps the first): who started it.
CREATE TABLE IF NOT EXISTS games (
  game_key TEXT PRIMARY KEY,               -- a random ID per game
  player_id TEXT NOT NULL,
  signed_in INTEGER NOT NULL,              -- 1 or 0
  format INTEGER NOT NULL,                 -- the batch format its build sent (TELEMETRY_FORMAT)
  started_unix_seconds INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  size TEXT NOT NULL,                      -- a MAP_SIZES key
  version TEXT NOT NULL,                   -- the build's commit hash, from <html data-version>
  rules_version INTEGER NOT NULL,
  user_agent TEXT,
  screen TEXT                              -- innerWidth x innerHeight @ devicePixelRatio
);

-- Games per day.
CREATE INDEX IF NOT EXISTS games_by_start ON games (started_unix_seconds);

-- One row per event record: a command on a game, with the board's counts after its tick. The
-- primary key is also the index that joins a game's events to its games row, in seq order.
-- INSERT OR IGNORE: an event sent twice (same game_key and seq) is kept once.
CREATE TABLE IF NOT EXISTS events (
  game_key TEXT NOT NULL,
  seq INTEGER NOT NULL,                    -- from 0 per game, numbered by the browser as it queued them
  player_id TEXT NOT NULL,
  signed_in INTEGER NOT NULL,
  unix_seconds INTEGER NOT NULL,
  command TEXT NOT NULL,                   -- an engine command: place, remove, discard, …
  accepted INTEGER NOT NULL,               -- 1 or 0
  turn INTEGER NOT NULL,
  delivered INTEGER NOT NULL,
  lost INTEGER NOT NULL,
  ex_gremlins INTEGER NOT NULL,
  trapped INTEGER NOT NULL,
  things INTEGER NOT NULL,                 -- Things on the board
  crates INTEGER NOT NULL,                 -- pieces that aren't gremlins
  delivered_red INTEGER NOT NULL,          -- crates delivered to each color's target (GameArtifacts.CRATE_COLORS
  delivered_green INTEGER NOT NULL,        -- order), 0 for a color not open
  delivered_blue INTEGER NOT NULL,
  delivered_yellow INTEGER NOT NULL,
  kind TEXT,                               -- the command's args, NULL where it has none
  q INTEGER,
  r INTEGER,
  facing INTEGER,
  color TEXT,
  rest TEXT,                               -- JSON {"args": the args without a column}, NULL when there are none
  PRIMARY KEY (game_key, seq)
);

-- Events by time, the report's period filter. No other index on events: each one is another row
-- D1 counts as written per event. The DROP takes events_by_command out of a database made before
-- it went.
CREATE INDEX IF NOT EXISTS events_by_time ON events (unix_seconds);
DROP INDEX IF EXISTS events_by_command;

-- One row per milestone a game reached (10, 20, 50, …), with the board's counts then.
-- INSERT OR IGNORE: a milestone sent twice is kept once.
CREATE TABLE IF NOT EXISTS milestones (
  game_key TEXT NOT NULL,
  milestone INTEGER NOT NULL,              -- the count reached
  player_id TEXT NOT NULL,
  signed_in INTEGER NOT NULL,
  turn INTEGER NOT NULL,
  unix_seconds INTEGER NOT NULL,
  delivered INTEGER NOT NULL,
  lost INTEGER NOT NULL,
  ex_gremlins INTEGER NOT NULL,
  trapped INTEGER NOT NULL,
  things INTEGER NOT NULL,
  crates INTEGER NOT NULL,
  delivered_red INTEGER NOT NULL,          -- as on events
  delivered_green INTEGER NOT NULL,
  delivered_blue INTEGER NOT NULL,
  delivered_yellow INTEGER NOT NULL,
  rest TEXT,                               -- JSON of fields without a column: none yet, so NULL
  PRIMARY KEY (game_key, milestone)
);

-- One row per crash record (the crash screen, D-63). Plain INSERT, no dedupe.
CREATE TABLE IF NOT EXISTS crashes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unix_seconds INTEGER NOT NULL,
  format INTEGER NOT NULL,
  version TEXT,
  game_key TEXT,                           -- NULL if no game had started
  player_id TEXT NOT NULL,
  signed_in INTEGER NOT NULL,
  seed INTEGER,                            -- seed, size and turn: each NULL if unknown
  size TEXT,
  turn INTEGER,
  message TEXT NOT NULL,                   -- cut to 500 characters
  stack TEXT,                              -- the first lines, cut to 2000 characters
  user_agent TEXT
);

-- Crashes per day, and per build.
CREATE INDEX IF NOT EXISTS crashes_by_time ON crashes (unix_seconds);
CREATE INDEX IF NOT EXISTS crashes_by_version ON crashes (version);

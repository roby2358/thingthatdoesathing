# wrangler comes from yuwakisacloud's pinned install (`just bootstrap` there). The game has no npm;
# the Worker's one dependency (cbor-x, for the vendored auth-client, D-68) is worker/package.json
wrangler := justfile_directory() + "/../yuwakisacloud/node_modules/.bin/wrangler"

# List available commands
default:
    @just --list

# Run every test: R-n rules, integration walkthroughs, coverage (pass -v for every check)
cc-test *flags:
    node test/run.js {{flags}}

# Tuning harness: the greedy builder bot plays N games on one board size (small, medium,
# large, huge) and prints how many reach the first milestone and the turn spread
cc-sim games size:
    node test/sim.js {{games}} {{size}} 1

# The same bot played on to the Nth milestone: turns to each milestone, big crates spawned (D-34)
cc-sim-to games size milestones:
    node test/sim.js {{games}} {{size}} {{milestones}}

# Ship build: the page's files stamped ?v=<commit> into dist/web/, plus dist/ttdat-<commit>.zip
ship:
    node tools/ship.js

# Serve the ship build locally the way Cloudflare will (http://localhost:8794)
preview: ship _wrangler _worker-deps
    {{wrangler}} dev --port 8794

# The ship build under wrangler dev with the Worker and its local D1, for checking POST /t
# (http://localhost:8787; run `just d1-local` once first)
dev-worker: ship _wrangler _worker-deps
    {{wrangler}} dev --port 8787

# Give wrangler dev's local telemetry database its tables (D-64); safe to run again
d1-local: _wrangler
    WRANGLER={{wrangler}} bash tools/telemetry_db.sh local wrangler.jsonc worker/telemetry_schema.sql

# Delete .wrangler/state/v3/d1, then make the empty tables again. Local only; stop dev-worker first.
# Empty wrangler dev's local telemetry database, and recreate an outdated one (D-64)
local-d1-clear: _wrangler
    rm -rf .wrangler/state/v3/d1
    WRANGLER={{wrangler}} bash tools/telemetry_db.sh local wrangler.jsonc worker/telemetry_schema.sql

# The telemetry report (D-66): plain-text tables of what players do, for tuning, from production's
# database (refused while wrangler.jsonc holds the placeholder id); a number limits it to games
# started in that many days. Reads only. `just telemetry-local` reads wrangler dev's database.
telemetry-report *args: _wrangler
    @for a in {{args}}; do [ "$a" != local-d1 ] || { echo "telemetry-report reads production only; for wrangler dev's local D1 run: just telemetry-local [days]" >&2; exit 1; }; done
    @WRANGLER={{wrangler}} node tools/telemetry_report.js wrangler.jsonc {{args}}

# The same report from wrangler dev's local D1 (run `just d1-local` first); a number limits it
# to games started in that many days. Reads only.
telemetry-local *args: _wrangler
    @WRANGLER={{wrangler}} node tools/telemetry_report.js wrangler.jsonc local-d1 {{args}}

# Production's telemetry database: run once to create it and print the id to paste into
# wrangler.jsonc's env.production, then again to give it its tables (needs a wrangler login)
d1-production: _wrangler
    WRANGLER={{wrangler}} bash tools/telemetry_db.sh production wrangler.jsonc worker/telemetry_schema.sql

# Build and deploy to https://ttdat.yuwakisa.com (needs a wrangler login); refused while
# production's D1 id is the placeholder (`just deploy --dry-run` passes)
deploy *args: _wrangler _worker-deps
    bash tools/telemetry_db.sh deploy-check wrangler.jsonc {{args}}
    just ship
    {{wrangler}} deploy --env production {{args}}

# Install the Worker's pinned npm dependency (cbor-x) into worker/node_modules, scripts off (D-68)
worker-deps:
    cd worker && npm ci --ignore-scripts

_worker-deps:
    @test -d worker/node_modules/cbor-x || just worker-deps

_wrangler:
    @test -x {{wrangler}} || { echo "no wrangler at {{wrangler}}: run 'just bootstrap' in ../yuwakisacloud"; exit 1; }

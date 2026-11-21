# wrangler comes from yuwakisacloud's pinned install (`just bootstrap` there); this repo has no npm
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
preview: ship _wrangler
    {{wrangler}} dev --port 8794

# The ship build under wrangler dev with the Worker and its local D1, for checking POST /t
# (http://localhost:8787; run `just d1-local` once first)
dev-worker: ship _wrangler
    {{wrangler}} dev --port 8787

# Give wrangler dev's local telemetry database its tables (D-64); safe to run again
d1-local: _wrangler
    WRANGLER={{wrangler}} bash tools/telemetry_db.sh local wrangler.jsonc worker/telemetry_schema.sql

# Production's telemetry database: run once to create it and print the id to paste into
# wrangler.jsonc's env.production, then again to give it its tables (needs a wrangler login)
d1-production: _wrangler
    WRANGLER={{wrangler}} bash tools/telemetry_db.sh production wrangler.jsonc worker/telemetry_schema.sql

# Build and deploy to https://ttdat.yuwakisa.com (needs a wrangler login); refused while
# production's D1 id is the placeholder (`just deploy --dry-run` passes)
deploy *args: _wrangler
    bash tools/telemetry_db.sh deploy-check wrangler.jsonc {{args}}
    just ship
    {{wrangler}} deploy --env production {{args}}

_wrangler:
    @test -x {{wrangler}} || { echo "no wrangler at {{wrangler}}: run 'just bootstrap' in ../yuwakisacloud"; exit 1; }

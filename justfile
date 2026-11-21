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

# Build and deploy to https://ttdat.yuwakisa.com (needs a wrangler login)
deploy: ship _wrangler
    {{wrangler}} deploy --env production

_wrangler:
    @test -x {{wrangler}} || { echo "no wrangler at {{wrangler}}: run 'just bootstrap' in ../yuwakisacloud"; exit 1; }

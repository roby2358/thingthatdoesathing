// tools/telemetry_report.js — `just telemetry-report [local-d1] [days]`: prints the telemetry
// report (ONTOLOGY "Telemetry report", D-66) as plain text, for tuning. It reads the ttdat-telemetry
// D1 database (D-64) through wrangler, with four read-only SELECTs, and never writes: production's
// when no source is named (refused before wrangler runs while wrangler.jsonc still holds the
// placeholder id), wrangler dev's local one with `local-d1`. A number limits it to games started
// in that many days. Plain Node, no npm packages. WRANGLER names the wrangler to run (the
// justfile passes yuwakisacloud's pinned one).
//
//   node tools/telemetry_report.js <wrangler config> [local-d1] [days]
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFile } = require('child_process');

const { SECONDS_PER_DAY } = require('./telemetry_report/figures');
const { D1_TARGETS, ReportRefusal, playFromD1 } = require('./telemetry_report/records');
const { report } = require('./telemetry_report/render');

const USAGE = 'usage: just telemetry-report [local-d1] [days]   (production when no source is named; every day when no number is given)';

/** The sources a name picks, and the one read when none is named. */
const SOURCES = {
    'local-d1': "wrangler dev's local D1 database",
    production: 'the production D1 database',
};
const UNNAMED_SOURCE = 'production';

/** wrangler prints every row to stdout; this is far above what the tables hold for years. */
const WRANGLER_OUTPUT_LIMIT = 1024 * 1024 * 1024;

/** The source and the days among the arguments, each at most once, in either order. Only
 *  `local-d1` names a source: production is the one read when none is named. */
function chosen(args) {
    const sources = args.filter(a => a === 'local-d1');
    const days = args.filter(a => /^[1-9]\d*$/.test(a));
    if (sources.length > 1 || days.length > 1 || sources.length + days.length !== args.length) throw new ReportRefusal(USAGE);
    return { source: sources.length === 1 ? sources[0] : UNNAMED_SOURCE, days: days.length === 1 ? Number(days[0]) : null };
}

function runWrangler(args) {
    const wrangler = process.env.WRANGLER;
    if (!wrangler) return Promise.reject(new ReportRefusal('WRANGLER is not set: run the report with just telemetry-report, which names yuwakisacloud\'s wrangler'));
    return new Promise((resolve, reject) => {
        execFile(wrangler, args, { maxBuffer: WRANGLER_OUTPUT_LIMIT }, (error, stdout, stderr) => {
            if (error === null) { resolve(stdout); return; }
            reject(new ReportRefusal(`wrangler failed (${args.slice(0, 4).join(' ')} …):\n${stdout}${stderr}`.trimEnd()));
        });
    });
}

/** MAP_SIZES's keys in order, from the rules data, so the report lists board sizes as the game does. */
function sizeOrder() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'artifacts.js'), 'utf8');
    return Object.keys(vm.runInNewContext(source + '\n;GameArtifacts').MAP_SIZES);
}

async function main(argv) {
    if (argv.length < 1) throw new ReportRefusal(USAGE);
    const [configPath, ...rest] = argv;
    const { source, days } = chosen(rest);
    const since = days === null ? 0 : Math.floor(Date.now() / 1000) - days * SECONDS_PER_DAY;
    const config = { path: configPath, text: fs.readFileSync(configPath, 'utf8') };
    const play = await playFromD1(runWrangler, source, config, since);
    const period = days === null ? 'all time' : `games started in the last ${days} day${days === 1 ? '' : 's'}`;
    const label = `${SOURCES[source]} (wrangler d1 execute ${D1_TARGETS[source].join(' ')}, ${configPath})`;
    process.stdout.write(report(play, { source: label, period, since }, sizeOrder()));
}

main(process.argv.slice(2)).catch(error => {
    if (!(error instanceof ReportRefusal)) throw error;
    console.error(error.message);
    process.exitCode = 1;
});

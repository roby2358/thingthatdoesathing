// R-101 — the achievements server's config (D-78):
//   - worker ACHIEVEMENT_COUNTERS equals GameArtifacts.COUNTERS' keys, every one (perGame or not), in order
//   - wrangler.jsonc binds PLAYER_TOTALS to class PlayerTotals at top level and in env.production,
//     each with a migration tagged v1 whose new_sqlite_classes is ['PlayerTotals']
//   - worker/index.js exports PlayerTotals by name and the fetch handler as its default
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { check, done } = require('../helpers/check');
const { load } = require('../helpers/load');
require('../helpers/cloudflare');

const ROOT = path.join(__dirname, '..', '..');

(async () => {
    const { ACHIEVEMENT_COUNTERS } = await import(pathToFileURL(path.join(ROOT, 'worker', 'achievements.js')).href);
    const { GameArtifacts } = load();
    check('ACHIEVEMENT_COUNTERS is every GameArtifacts.COUNTERS key, in order',
        JSON.stringify(ACHIEVEMENT_COUNTERS) === JSON.stringify(GameArtifacts.COUNTERS.map(c => c.key)));

    // wrangler.jsonc: strip // comments (none inside its strings has "//" but URLs, kept by the lookbehind).
    const text = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8').replace(/(^|[^:"])\/\/.*$/gm, '$1');
    const config = JSON.parse(text);
    const bound = c => !!c.durable_objects && Array.isArray(c.durable_objects.bindings) &&
        c.durable_objects.bindings.some(b => b.name === 'PLAYER_TOTALS' && b.class_name === 'PlayerTotals');
    const migrated = c => Array.isArray(c.migrations) &&
        c.migrations.some(m => m.tag === 'v1' && JSON.stringify(m.new_sqlite_classes) === '["PlayerTotals"]');
    check('top level binds PLAYER_TOTALS → PlayerTotals', bound(config));
    check('… with migration v1, new_sqlite_classes [PlayerTotals]', migrated(config));
    check('env.production binds PLAYER_TOTALS → PlayerTotals', bound(config.env.production));
    check('… with migration v1, new_sqlite_classes [PlayerTotals]', migrated(config.env.production));

    const worker = await import(pathToFileURL(path.join(ROOT, 'worker', 'index.js')).href);
    check('worker/index.js: PlayerTotals named, fetch the default', typeof worker.PlayerTotals === 'function' &&
        typeof worker.default.fetch === 'function' && Object.keys(worker).sort().join() === 'PlayerTotals,default');
    done();
})().catch(e => { process.stdout.write('FAIL threw: ' + (e && e.stack) + '\n'); process.exit(1); });

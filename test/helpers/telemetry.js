// test/helpers/telemetry.js — stand-ins the telemetry rows share (R-96, R-97, R-109, R-110).
//
// recorderPage(opts): telemetry.js alone in a vm with stubbed document, location, navigator,
//   fetch, crypto, window and timers. opts: version null (no data-version), protocol, gpc, status
//   (every fetch's answer). It returns { T (GameTelemetry), GameDisplayArtifacts, sent (fetch
//   bodies), beacons (sendBeacon bodies), timers, fire() (runs every live timer, returns how many) }.
// sqliteD1(): a fake D1 that is a real SQLite database (node:sqlite) with
//   worker/telemetry_schema.sql applied: prepare/bind/batch as D1 (a batch is one transaction),
//   binds (statements bound), rows(table, order), count(table), total() (rows in every table).
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { DatabaseSync } = require('node:sqlite');
const { ROOT, source } = require('./load');

const SCHEMA = fs.readFileSync(path.join(ROOT, 'worker', 'telemetry_schema.sql'), 'utf8');

function recorderPage(opts) {
    const p = { sent: [], beacons: [], timers: [] };
    let ids = 0;
    const ctx = vm.createContext({
        console,
        document: { documentElement: { dataset: opts.version === null ? {} : { version: 'abc1234' } }, visibilityState: 'visible', addEventListener() {} },
        location: { protocol: opts.protocol || 'https:', hostname: 'ttdat.yuwakisa.com', origin: 'https://ttdat.yuwakisa.com' },
        navigator: { userAgent: 'TestBrowser/1.0', globalPrivacyControl: !!opts.gpc,
            sendBeacon: (url, body) => { p.beacons.push(JSON.parse(body)); return true; } },
        fetch: (url, init) => { p.sent.push(JSON.parse(init.body)); return Promise.resolve({ status: opts.status || 204 }); },
        crypto: { randomUUID: () => 'uuid-' + (++ids) },
        window: { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} },
        setTimeout: (fn, ms) => { p.timers.push({ fn, ms, live: true }); return p.timers.length; },
        clearTimeout: id => { if (id && p.timers[id - 1]) p.timers[id - 1].live = false; },
    });
    vm.runInContext(['artifacts.js', 'displayartifacts.js', 'telemetry.js'].map(source).join('\n;\n') +
        '\n;globalThis.__x = { GameTelemetry, GameDisplayArtifacts };', ctx);
    Object.assign(p, ctx.__x);
    p.T = p.GameTelemetry;
    p.fire = () => { const due = p.timers.filter(t => t.live); due.forEach(t => { t.live = false; t.fn(); }); return due.length; };
    return p;
}

function sqliteD1() {
    const db = new DatabaseSync(':memory:');
    db.exec(SCHEMA);
    let binds = 0;
    const count = table => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    const tables = () => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(t => t.name);
    return {
        db, get binds() { return binds; },
        prepare(sql) { return { bind(...args) { binds++; return { sql, args }; } }; },
        async batch(statements) {
            db.exec('BEGIN');
            try {
                for (const s of statements) db.prepare(s.sql).run(...s.args.map(v => v === undefined ? null : v));
                db.exec('COMMIT');
            } catch (e) { db.exec('ROLLBACK'); throw e; }
        },
        rows(table, order) { return db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all().map(r => ({ ...r })); },
        count,
        total: () => tables().reduce((n, t) => n + count(t), 0),
    };
}

module.exports = { SCHEMA, recorderPage, sqliteD1 };

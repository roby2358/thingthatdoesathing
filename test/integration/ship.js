// test/integration/ship.js — the ship build (tools/ship.js, `just ship`).
//
// Runs the build into a temp dir and reads the zip back: index.html at the zip root, only
// the files the page loads (no docs, tests or backlog), every local script and stylesheet
// URL stamped with the version, the version on <html data-version>, and web/ holding the
// same files as the zip. Not a game rule, so it lives outside the test/R-n/ directories.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const { check, done } = require('../helpers/check');

const root = path.join(__dirname, '..', '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ttdat-ship-'));

// Reads a zip's central directory: name -> uncompressed contents.
function unzip(buf) {
    const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const count = buf.readUInt16LE(end + 10);
    let p = buf.readUInt32LE(end + 16);
    const files = new Map();
    for (let i = 0; i < count; i++) {
        const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32);
        const local = buf.readUInt32LE(p + 42);
        const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
        const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        const body = buf.subarray(start, start + csize);
        files.set(name, method === 8 ? zlib.inflateRawSync(body) : body);
        p += 46 + nameLen + extra + comment;
    }
    return files;
}

try {
    const res = spawnSync(process.execPath, [path.join(root, 'tools', 'ship.js'), out], { encoding: 'utf8' });
    check('the build exits 0', res.status === 0);
    if (res.status !== 0) process.stdout.write(res.stdout + res.stderr);

    const zips = fs.readdirSync(out).filter(f => /^ttdat-.+\.zip$/.test(f));
    check('one ttdat-<version>.zip', zips.length === 1);
    const version = zips[0].slice('ttdat-'.length, -'.zip'.length);
    const files = unzip(fs.readFileSync(path.join(out, zips[0])));
    const names = [...files.keys()];

    check('index.html at the zip root', files.has('index.html'));
    check('no .md, test/ or pjpd/ in the zip', !names.some(n => /\.md$|^test\/|^pjpd\/|^tools\//.test(n)));
    check('every path relative', names.every(n => !n.startsWith('/') && !n.includes('..')));

    const html = files.get('index.html').toString('utf8');
    const refs = [...html.matchAll(/\b(?:src|href)="(?![a-z]+:|\/\/|#)([^"]+)"/g)].map(m => m[1]);
    check('the page names its scripts and stylesheet', refs.some(r => r.startsWith('index.css')) && refs.some(r => r.startsWith('gameengine.js')));
    check('every local URL carries ?v=<version>', refs.every(r => r.endsWith('?v=' + version)));
    check('every file the page names is in the zip, exact case', refs.every(r => files.has(r.split('?')[0])));
    check('the zip holds nothing the page does not load', names.length === refs.length + 1);
    check('<html data-version> carries the version', html.includes(`data-version="${version}"`));
    check('the zip contents match the source files', refs.every(r => {
        const f = r.split('?')[0];
        return files.get(f).equals(fs.readFileSync(path.join(root, f)));
    }));

    const web = fs.readdirSync(path.join(out, 'web')).sort();
    check('web/ holds the same files as the zip', JSON.stringify(web) === JSON.stringify([...names].sort()));
} finally {
    fs.rmSync(out, { recursive: true, force: true });
}
done();

// tools/ship.js — the ship build:  node tools/ship.js [outDir]   (just ship)
//
// Copies only what the page loads (index.html plus every local script and stylesheet it
// names) into <outDir>/web/, stamps each of those URLs with ?v=<version> so a returning
// player never runs new HTML against cached old JS, puts the version on <html data-version>
// for the game to show, and zips web/ as <outDir>/ttdat-<version>.zip with index.html at the
// zip root (the itch.io / Newgrounds upload). <outDir> defaults to dist/ (git-ignored);
// web/ is what `just deploy` serves. The version is the short commit hash, with -dirty when
// the working tree has uncommitted changes. og.png (the link-preview image, named only in a
// <meta content>) joins web/ when it exists; the zip doesn't need it. Plain Node, no npm packages.
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const outDir = path.resolve(process.argv[2] || path.join(root, 'dist'));
const webDir = path.join(outDir, 'web');

function git(cmd) {
    try { return execSync('git ' + cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch (e) { return null; }
}

const hash = git('rev-parse --short HEAD');
const version = hash ? hash + (git('status --porcelain') ? '-dirty' : '') : 'dev';
const commitTime = Number(git('log -1 --format=%ct')) || Math.floor(Date.now() / 1000);

// Local src/href URLs in index.html: the page's scripts and stylesheets. data: and
// absolute URLs (the favicon, og: tags) stay as they are.
const LOCAL_REF = /\b(src|href)="(?![a-z]+:|\/\/|#)([^"?#]+)"/g;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const refs = [...new Set([...html.matchAll(LOCAL_REF)].map(m => m[2]))];
for (const f of refs)
    if (!fs.existsSync(path.join(root, f))) throw new Error('index.html names a missing file: ' + f);

const stamped = html
    .replace(LOCAL_REF, (m, attr, url) => `${attr}="${url}?v=${version}"`)
    .replace(/<html\b/, `<html data-version="${version}"`);

// Clear only what this script writes, so an outDir that holds anything else keeps it.
fs.rmSync(webDir, { recursive: true, force: true });
fs.mkdirSync(webDir, { recursive: true });
for (const f of fs.readdirSync(outDir))
    if (/^ttdat-.*\.zip$/.test(f)) fs.rmSync(path.join(outDir, f));

const files = [['index.html', Buffer.from(stamped, 'utf8')],
    ...refs.map(f => [f, fs.readFileSync(path.join(root, f))])];
const WEB_ONLY = ['og.png'].filter(f => fs.existsSync(path.join(root, f)));
for (const [name, data] of [...files, ...WEB_ONLY.map(f => [f, fs.readFileSync(path.join(root, f))])]) {
    fs.mkdirSync(path.dirname(path.join(webDir, name)), { recursive: true });
    fs.writeFileSync(path.join(webDir, name), data);
}

// A minimal zip writer (deflate, UTF-8 names), every entry dated at the commit time.
function zip(entries, unixSeconds) {
    const d = new Date(unixSeconds * 1000);
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const locals = [], centrals = [];
    let offset = 0;
    for (const [name, data] of entries) {
        const nameBuf = Buffer.from(name, 'utf8');
        const body = zlib.deflateRawSync(data, { level: 9 });
        const crc = zlib.crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(8, 8); local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12);
        local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(dosTime, 12);
        central.writeUInt16LE(dosDate, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20);
        central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt32LE(offset, 42);
        locals.push(local, nameBuf, body);
        centrals.push(central, nameBuf);
        offset += local.length + nameBuf.length + body.length;
    }
    const cd = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, cd, end]);
}

const zipName = `ttdat-${version}.zip`;
fs.writeFileSync(path.join(outDir, zipName), zip(files, commitTime));
console.log(`ship ${version}: ${files.length + WEB_ONLY.length} files in ${path.relative(root, webDir) || webDir}, ${path.relative(root, path.join(outDir, zipName))}`);

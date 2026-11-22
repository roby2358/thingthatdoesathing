// test/helpers/cloudflare.js — require this before importing worker/index.js (or anything that
// imports 'cloudflare:workers'). Node has no such module; this resolves it to a stub whose
// DurableObject keeps (ctx, env) as the Workers runtime's base class does. Nothing else changes.
// fakeKv() is a SQLite-backed object's ctx.storage.kv stand-in: synchronous get/put/list over a
// Map (`map`, for the tests to look into).
'use strict';

const { registerHooks } = require('node:module');

const STUB = 'data:text/javascript,' + encodeURIComponent(
    'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }');

function fakeKv() {
    const map = new Map();
    return { map, get: k => map.get(k), put: (k, v) => { map.set(k, v); }, list: () => map.entries() };
}

registerHooks({
    resolve(specifier, context, next) {
        if (specifier === 'cloudflare:workers') return { url: STUB, shortCircuit: true };
        return next(specifier, context);
    },
});

module.exports = { fakeKv };

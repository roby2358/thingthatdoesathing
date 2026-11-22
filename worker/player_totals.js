// worker/player_totals.js — PlayerTotals, the Durable Object that holds one signed-in player's
// lifetime totals (D-78). One object per player, named by the player hash auth.js identityFor
// makes (SHA-256 hex of PLAYER_SALT + sub; never the sub itself). SQLite-backed (wrangler.jsonc's
// migration v1, new_sqlite_classes), it keeps a key per counter in its key-value storage
// (ctx.storage.kv), the value that counter's lifetime total; a counter never added to has no key.
//
// Its methods are called over RPC from worker/achievements.js (POST /achievements). They are
// synchronous: the kv calls are, and nothing in them awaits, so an add reads and writes every key
// with no other call in between, and concurrent adds never lose a count. Plain JavaScript; the
// Node tests stand in a stub for 'cloudflare:workers' (test/helpers/cloudflare.js).
import { DurableObject } from 'cloudflare:workers';

export class PlayerTotals extends DurableObject {
    /** Every counter with a total: {totals: {key: n}}. */
    totals() {
        return { totals: Object.fromEntries(this.ctx.storage.kv.list()) };
    }

    /** Adds each increment ({key: whole number ≥ 0}, checked by the caller) to its total; a 0
     *  makes no key. Answers the totals after, as totals() does. */
    add(increments) {
        const kv = this.ctx.storage.kv;
        for (const [key, n] of Object.entries(increments)) {
            if (n > 0) kv.put(key, (kv.get(key) ?? 0) + n);
        }
        return this.totals();
    }
}

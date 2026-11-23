// Random Number Utilities
//
// All randomness routes through a single pluggable source so a game can be made
// reproducible from a stored seed (the server-authoritative model: same seed ->
// same map + spawns + AI). `Rando.seed(n)` installs a deterministic mulberry32
// generator; until seeded, the source is Math.random. The seed itself lives in
// GameState, and GameEngine re-seeds at the start of each new game.
const Rando = (function () {
    // A mulberry32 generator seeded with n: a function returning floats in [0, 1), its
    // position in its own `a` field (a uint32 after >>> 0).
    function mulberry32(n) {
        const next = function () {
            next.a = (next.a + 0x6D2B79F5) | 0;
            let t = Math.imul(next.a ^ (next.a >>> 15), 1 | next.a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        next.a = n >>> 0;
        return next;
    }

    let _rng = Math.random;
    let _seeded = null;   // the shared mulberry32 generator while seeded; null while the source is Math.random

    class Rando {
        // Install a deterministic PRNG (mulberry32) driven by an integer seed.
        static seed(n) {
            _seeded = mulberry32(n);
            _rng = _seeded;
        }

        // The seeded stream's position, as a uint32 (null while unseeded): a saved game carries
        // it so the restored world draws exactly what the original would have (D-67).
        static state() {
            return _seeded === null ? null : _seeded.a >>> 0;
        }

        // Put the seeded stream back at a position state() gave.
        static setState(a) {
            Rando.seed(a);
        }

        // A 32-bit mix of a seed and a salt (murmur3's finalizer over seed ^ salt): the seed of a
        // side stream (stream) that draws differently per salt (the goals' D-75, the crate shapes' D-84).
        static mix(seed, salt) {
            let h = (seed ^ salt) >>> 0;
            h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B);
            h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
            return (h ^ (h >>> 16)) >>> 0;
        }

        // An independent mulberry32 generator seeded with n: a function returning floats in
        // [0, 1). It never reads or moves the shared stream (the goals' side stream, D-75).
        static stream(n) {
            return mulberry32(n);
        }

        // A raw float in [0, 1) from the current source (seeded or Math.random).
        static random() {
            return _rng();
        }

        static shuffle(array) {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(_rng() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
            return array;
        }

        static choice(array) {
            if (array.length === 0) return null;
            return array[Math.floor(_rng() * array.length)];
        }

        static int(min, max) {
            return min + Math.floor(_rng() * (max - min + 1));
        }

        static gaussian() {
            const u1 = _rng();
            const u2 = _rng();
            return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        }

        static float(min, max) {
            return min + _rng() * (max - min);
        }

        static bool(probability = 0.5) {
            return _rng() < probability;
        }

        static weighted(weighted) {
            if (weighted.length === 0) return null;
            const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
            let roll = _rng() * totalWeight;
            for (const { item, weight } of weighted) {
                roll -= weight;
                if (roll <= 0) return item;
            }
            return weighted[weighted.length - 1].item;
        }
    }

    return Rando;
})();

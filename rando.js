// Random Number Utilities
//
// All randomness routes through a single pluggable source so a game can be made
// reproducible from a stored seed (the server-authoritative model: same seed ->
// same map + spawns + AI). `Rando.seed(n)` installs a deterministic mulberry32
// generator; until seeded, the source is Math.random. The seed itself lives in
// GameState, and GameEngine re-seeds at the start of each new game.
const Rando = (function () {
    let _rng = Math.random;
    let _a = null;   // mulberry32's state while seeded; null while the source is Math.random

    class Rando {
        // Install a deterministic PRNG (mulberry32) driven by an integer seed.
        static seed(n) {
            _a = n >>> 0;
            _rng = function () {
                _a = (_a + 0x6D2B79F5) | 0;
                let t = Math.imul(_a ^ (_a >>> 15), 1 | _a);
                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        }

        // The seeded stream's position, as a uint32 (null while unseeded): a saved game carries
        // it so the restored world draws exactly what the original would have (D-67).
        static state() {
            return _a === null ? null : _a >>> 0;
        }

        // Put the seeded stream back at a position state() gave.
        static setState(a) {
            Rando.seed(a);
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

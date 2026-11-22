// R-83: the ladder (D-74). rung(scale, i) = scale × [1, 2, 5][i mod 3] × 10^floor(i / 3);
// "level n" is rung(scale, n − 1). rungsCrossed(scale, before, after) is every rung r with
// before < r ≤ after, rising. standing(scale, total) is {reached: the last rung ≤ total, or
// null below the first; next: the first rung > total}.
'use strict';
const { check, done } = require('../helpers/check');
const { flatGame } = require('../helpers/load');

const { g } = flatGame();
const { rung, rungsCrossed, standing } = g.GameArtifacts;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
check('scale 10: 10, 20, 50, 100, 200, 500, 1000', same([0, 1, 2, 3, 4, 5, 6].map(i => rung(10, i)), [10, 20, 50, 100, 200, 500, 1000]));
check('scale 1: 1, 2, 5, 10, 20, 50', same([0, 1, 2, 3, 4, 5].map(i => rung(1, i)), [1, 2, 5, 10, 20, 50]));
check('scale 1000: 1000, 2000, 5000, 10000', same([0, 1, 2, 3].map(i => rung(1000, i)), [1000, 2000, 5000, 10000]));
check('scale 100 at i = 9: 100000', rung(100, 9) === 100000);
check('rungs are whole numbers, strictly rising', [...Array(30).keys()].every(i => Number.isInteger(rung(10, i)) && (i === 0 || rung(10, i) > rung(10, i - 1))));
check('crossing 15 → 120 at scale 10: 20, 50, 100', same(rungsCrossed(10, 15, 120), [20, 50, 100]));
check('a rung equal to before isn\'t crossed; one equal to after is', same(rungsCrossed(10, 20, 50), [50]));
check('no rise crosses nothing', same(rungsCrossed(10, 50, 50), []) && same(rungsCrossed(1, 3, 4), []));
check('from 0 to 1 at scale 1: [1]', same(rungsCrossed(1, 0, 1), [1]));
check('standing below the first rung: reached null, next the first', same(standing(10, 0), { reached: null, next: 10 }) && same(standing(10, 9), { reached: null, next: 10 }));
check('standing on a rung: reached it, next the one above', same(standing(10, 10), { reached: 10, next: 20 }));
check('standing between rungs', same(standing(10, 250), { reached: 200, next: 500 }) && same(standing(1, 7), { reached: 5, next: 10 }));
done();

// R-104: a negative counter's rung (D-79: crates lost, cards discarded) is worded from
// MESSAGES.rungNotoriety, wry rather than congratulatory, never from rungReached; its banner line
// is marked negative. It still counts toward rungsReached, which is worded as any other.
'use strict';
const { check, done } = require('../helpers/check');
const { achGame, counts, el } = require('../helpers/achievements');

const p = achGame();
const wry = p.run('GameDisplayArtifacts.MESSAGES.rungNotoriety'), cheer = p.run('GameDisplayArtifacts.MESSAGES.rungReached');
check('MESSAGES.rungNotoriety: 3 distinct whole sentences with {amount} and {label}', wry.length === 3 && new Set(wry).size === 3 &&
    wry.every(w => w.includes('{amount}') && w.includes('{label}') && /^[A-Z{]/.test(w) && /[.!]$/.test(w)));
check('none of them a rungReached wording', wry.every(w => !cheer.includes(w)));
const fill = (w, amount, label) => w.replace('{amount}', amount).replace('{label}', label);

const heard = [];
p.run('GameAchievements.listen')(list => { heard.push(...list); p.ui.achievementsChanged(list); });
// crates sunk 0 → 1 → 2 → 5: one rung each time.
for (const [i, r, add] of [[0, 0, 1], [1, 0.5, 1], [2, 0.99, 3]]) {
    heard.length = 0;
    p.run(`Math.random = () => ${r}`);
    p.run(`GameAchievements.counted(${JSON.stringify(counts(p, {}))}, ${JSON.stringify(counts(p, { cratesSunk: add }))})`);
    const line = heard.find(a => a.counter === 'cratesSunk');
    check(`Math.random ${r}: crates sunk's rung in rungNotoriety[${i}]`, line && line.negative && line.line === fill(wry[i], line.amount, 'crates sunk'));
    const own = heard.find(a => a.counter === 'rungsReached');
    if (own) check('its rungsReached rung is worded from rungReached', !own.negative && cheer.some(w => own.line === fill(w, own.amount, 'achievements reached')));
}
heard.length = 0;
p.run('Math.random = () => 0');
p.run(`GameAchievements.counted(${JSON.stringify(counts(p, {}))}, ${JSON.stringify(counts(p, { discards: 10 }))})`);
check('cards discarded 10: wry too', heard[0].counter === 'discards' && heard[0].line === fill(wry[0], 10, 'cards discarded'));
const lines = el(p, 'rung-banner-lines').children;
check('a negative line on the banner is marked negative, the others not',
    lines.some(c => c.className === 'negative') && lines.some(c => c.className !== 'negative'));
done();

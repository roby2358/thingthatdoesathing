// test/helpers/goals.js — the goal UI rows' shared setup (D-76, R-90..R-95): a live page
// (test/helpers/page.js) with a game in play and first-time Help closed, and ways to read and
// steer it.
'use strict';
const { bootPage } = require('./page');

// A live page with a game of the given MAP_SIZES key in play, first-time Help closed.
function liveGame(size) {
    const p = bootPage({ live: true });
    p.ui.startGame(size);
    p.ui.dismissOverlay();
    return p;
}

// Whether the page's element with this id is showing (no hidden class).
const shown = (p, id) => !p.els[id].classList.set.has('hidden');

// Goal i's count, as goalStates will give it, set to `count` (by moving its base).
function setCount(p, i, count) {
    const g = p.state.goals.list[i];
    p.state.goals.base[g.counter] = p.engine.counters()[g.counter] - count;
}

// One Wait through the UI, its animation played out.
function waitTick(p) { p.ui.primaryAction(); p.settle(); }

module.exports = { liveGame, shown, setCount, waitTick };

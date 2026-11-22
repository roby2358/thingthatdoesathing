// R-90: the goals side panel (D-76). Hidden before a board; with a game, one line per goal:
// its counter's label (first letter up) and "count / amount", the count capped at the amount;
// a met goal's line green (class met) with a check; it follows goalStates after every tick.
'use strict';
const { check, done } = require('../helpers/check');
const { bootPage } = require('../helpers/page');
const { liveGame, shown, setCount, waitTick } = require('../helpers/goals');

const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
check('the page starts with the goals panel hidden', /<div id="goals-side" class="panel hidden">/.test(html));
const p0 = bootPage();
check('the intro leaves it hidden (never touched)', !('goals-side' in p0.els));

const p = liveGame('small');
const lines = () => p.ui.goalLines;
const goals = p.engine.goalStates();
check('a game: the goals panel shows', shown(p, 'goals-side'));
check('three lines, built once into the panel', lines().length === 3 && p.els['goals-side-list'].children.length === 3);
goals.forEach((g, i) => {
    const l = lines()[i];
    check(`line ${i}: "${l.label.textContent}" is the counter's label, first letter up`, l.label.textContent === g.label.charAt(0).toUpperCase() + g.label.slice(1));
    check(`line ${i}: "${l.count.textContent}" is 0 / its amount`, l.count.textContent === '0 / ' + g.amount);
    check(`line ${i}: not met, no check`, !l.line.classList.set.has('met') && l.check.textContent === '');
});
setCount(p, 1, 2);
p.ui.render();
check('a count since the deal shows: 2 / amount', lines()[1].count.textContent === '2 / ' + goals[1].amount);
setCount(p, 2, goals[2].amount + 7);
p.ui.render();
check('a count past the amount shows capped at the amount', lines()[2].count.textContent === goals[2].amount + ' / ' + goals[2].amount);
check('not green before the tick that meets it', !lines()[2].line.classList.set.has('met'));
const turn = p.state.turn;
waitTick(p);
check('the tick met it', p.state.turn === turn + 1 && p.state.goals.list[2].met);
check('its line is green with a check', lines()[2].line.classList.set.has('met') && lines()[2].check.textContent === '✓');
check('the others stay unmet', !lines()[0].line.classList.set.has('met') && !lines()[1].line.classList.set.has('met'));
check('a met goal still reads amount / amount', lines()[2].count.textContent === goals[2].amount + ' / ' + goals[2].amount);
done();

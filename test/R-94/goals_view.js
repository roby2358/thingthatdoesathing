// R-94: the expand button opens the Goals view (D-76), a pager like Help: its first page is
// Goals, one row per goal (label, count / amount, a bar; met: green, check, full) and New goals,
// which deals the next set and keeps it open; it holds Go; a button click keeps it open, ← →
// turn (one page: stays), Esc, any other key or a click off closes it and Go picks up again;
// under another overlay the button does nothing.
'use strict';
const { check, done } = require('../helpers/check');
const { liveGame, shown, setCount, waitTick } = require('../helpers/goals');

const p = liveGame('small');
setCount(p, 0, p.state.goals.list[0].amount);
waitTick(p);
setCount(p, 1, 1);
p.els.go.fire('click');
p.advance(1000);
p.settle();
p.els['goals-side-expand'].fire('click');
check('it opens the Goals view on Goals', p.ui.overlay === 'goals' && shown(p, 'goals-panel') && shown(p, 'goals-page-0'));
check('"1 / 1", both page buttons disabled', p.els['goals-count'].textContent === '1 / 1' && p.els['goals-prev'].disabled && p.els['goals-next'].disabled);
const rows = p.ui.goalRows, g = p.engine.goalStates();
check('three rows, built once into the view', rows.length === 3 && p.els['goals-view'].children.length === 3);
check('each row: the label and count / amount the side panel shows', rows.every((r, i) =>
    r.label.textContent.replace('✓ ', '') === p.ui.goalLines[i].label.textContent && r.count.textContent === p.ui.goalLines[i].count.textContent));
check('the met goal: green, a check, a full bar', rows[0].row.classList.set.has('met') && rows[0].label.textContent.startsWith('✓ ') && rows[0].fill.style.width === '100%');
check('a part-way goal: its share of the bar', rows[1].fill.style.width === (Math.min(1, g[1].count / g[1].amount) * 100) + '%' && !rows[1].row.classList.set.has('met'));
const held = p.state.turn;
p.advance(2000);
check('it holds Go', p.state.turn === held && p.ui.running);
p.els['goals-view-new'].fire('click');
check('New goals: the next set, still open, no tick', p.state.goals.set === 1 && p.ui.overlay === 'goals' && p.state.turn === held);
check('the rows show it from 0, unmet', rows.every((r, i) => r.count.textContent === '0 / ' + p.state.goals.list[i].amount && !r.row.classList.set.has('met') && r.fill.style.width === '0%'));
p.els['goals-panel'].fire('click', { target: { closest: () => p.els['goals-view-new'] } });
p.key('ArrowRight'); p.key('ArrowLeft');
check('a button click and ← → keep it open', p.ui.overlay === 'goals');
p.key('q');
check('another key closes it', p.ui.overlay === null && !shown(p, 'goals-panel'));
p.advance(1000);
check('Go picks up again', p.state.turn > held);
p.settle();
p.els['goals-side-expand'].fire('click');
p.els['goals-panel'].fire('click');
check('a click off the buttons closes it', p.ui.overlay === null);
p.settle();
p.els['goals-side-expand'].fire('click');
p.key('Escape');
check('Esc closes it', p.ui.overlay === null);
p.els.go.fire('click');
p.settle();
p.ui.showHelp();
p.els['goals-side-expand'].fire('click');
check('under Help the button does nothing', p.ui.overlay === 'help');
done();

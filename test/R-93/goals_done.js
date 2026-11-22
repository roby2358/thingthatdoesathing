// R-93: the tick that meets a set's last goal (goalsDone, D-76) turns Go off and opens goals
// met: "Goals met!" and New game (the New Game size panel), New goals (the next set, closes),
// Keep playing (closes, the met set stays shown); it eats every other key and click, Esc is
// Keep playing; behind a news panel it waits until that closes; a set re-rolled while the tick
// played shows nothing.
'use strict';
const { check, done } = require('../helpers/check');
const { liveGame, shown, setCount, waitTick } = require('../helpers/goals');

const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const doneHtml = html.slice(html.indexOf('<div id="goals-done-panel"'), html.indexOf('<!-- The color picker'));
check('the panel says Goals met! and has the three buttons', /<h1>Goals met!<\/h1>/.test(doneHtml) &&
    [/id="done-new-game"[^>]*>New game</, /id="done-new-goals"[^>]*>New goals</, /id="done-keep"[^>]*>Keep playing/].every(re => re.test(doneHtml)));

const p = liveGame('small');
const meetAll = () => p.state.goals.list.forEach((g, i) => setCount(p, i, g.amount));
meetAll();
p.els.go.fire('click');
p.advance(1000);
p.settle();
check('the set met: Go off', !p.ui.running && p.els.go.textContent === 'Go');
check('goals met is open', p.ui.overlay === 'goalsDone' && shown(p, 'goals-done-panel'));
const t = p.state.turn, set = p.state.goals.set;
p.key('q'); p.key(' '); p.key('Enter'); p.key('1');
p.advance(2000);
check('other keys are eaten: still open, no tick, nothing picked, Go off', p.ui.overlay === 'goalsDone' && p.state.turn === t && !p.ui.picked && !p.ui.running);
p.els['goals-done-panel'].fire('click');
check('a click off the buttons does nothing', p.ui.overlay === 'goalsDone');
p.key('Escape');
check('Esc is Keep playing: closed, same set', p.ui.overlay === null && !shown(p, 'goals-done-panel') && p.state.goals.set === set);
check('the met set stays shown, every line green', p.ui.goalLines.every(l => l.line.classList.set.has('met')));
p.advance(2000);
check('Go stays off', p.state.turn === t);

const again = () => { p.engine.newGoals(); meetAll(); waitTick(p); };
again();
p.els['done-keep'].fire('click');
check('Keep playing closes it', p.ui.overlay === null && p.state.turn === t + 1);

again();
const s2 = p.state.goals.set, t2 = p.state.turn;
p.els['done-new-goals'].fire('click');
check('New goals: the next set, closed, no tick', p.ui.overlay === null && p.state.goals.set === s2 + 1 && p.state.turn === t2);
check('the new set shows unmet from 0', p.ui.goalLines.every((l, i) => !l.line.classList.set.has('met') && l.count.textContent === '0 / ' + p.state.goals.list[i].amount));

again();
const seed = p.state.seed;
p.els['done-new-game'].fire('click');
check('New game opens the New Game size panel', p.ui.overlay === 'size' && shown(p, 'size-panel') && !shown(p, 'goals-done-panel'));
p.key('Escape');
check('its Esc goes back to the same game', p.ui.overlay === null && p.state.seed === seed);
again();
p.els['done-new-game'].fire('click');
p.key('1');
check('a size from there starts a new game, its goals unmet', p.ui.overlay === null && p.state.turn === 1 && p.state.goals.set === 0 && p.state.goals.list.every(g => !g.met));

// Behind a news panel: goals met waits for it.
p.engine.newGoals();
p.ui.showNews(['red'], []);
p.ui.showGoalsMet({ goalSet: p.state.goals.set, goalsMet: [], goalsDone: true });
check('under a news panel, the news stays up first', p.ui.overlay === 'news');
p.key('x');
check('closing it opens goals met', p.ui.overlay === 'goalsDone');
p.key('Escape');

// Re-rolled while the meeting tick played: nothing about the old set.
p.engine.newGoals();
meetAll();
p.els.go.fire('click');   // Go's first tick starts at once
check('a tick is animating', !!p.ui.anim);
const s3 = p.state.goals.set;
p.els['goals-side-new'].fire('click');
p.settle();
check('the old set\'s done shows nothing: no panel, no banner, Go still on', p.state.goals.set === s3 + 1 && p.ui.overlay === null && !shown(p, 'goal-banner') && p.ui.running);
p.els.go.fire('click');
done();

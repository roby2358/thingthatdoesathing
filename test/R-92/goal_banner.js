// R-92: a goal met shows a banner that doesn't stop play (D-76): one line per goal met that
// tick, each one of GameDisplayArtifacts.MESSAGES.goalMet (three whole sentences with {amount}
// and {label}) filled in, picked with Math.random; it hides after MILESTONE_MS; Go keeps going.
// The met green (index.css --met, the banner's color) is SOURCE_COLOR's, not a var() of itself.
'use strict';
const fs = require('fs');
const path = require('path');
const { check, done } = require('../helpers/check');
const { liveGame, shown, setCount, waitTick } = require('../helpers/goals');

const p = liveGame('small');
const words = p.run('GameDisplayArtifacts.MESSAGES.goalMet');
const met = /--met:\s*([^;]+);/.exec(fs.readFileSync(path.join(__dirname, '../../index.css'), 'utf8'));
check('index.css --met is SOURCE_COLOR\'s green', met && met[1].trim() === p.run('GameDisplayArtifacts.SOURCE_COLOR'));
check('MESSAGES.goalMet has 3 wordings', Array.isArray(words) && words.length === 3 && new Set(words).size === 3);
words.forEach((w, i) => check(`wording ${i} "${w}" is a whole sentence with {amount} and {label}`,
    w.includes('{amount}') && w.includes('{label}') && /^[A-Z{]/.test(w) && /[.!]$/.test(w)));
const fill = (w, g) => w.replace('{amount}', g.amount).replace('{label}', g.label);
const lines = () => p.els['goal-banner-lines'].children.map(c => c.textContent);

check('no banner before', !shown(p, 'goal-banner'));
p.run('Math.random = () => 0.5');
p.els.go.fire('click');
setCount(p, 0, p.state.goals.list[0].amount);
p.advance(1000);
p.settle();
const g0 = p.engine.goalStates()[0];
check('a goal met: the banner shows', shown(p, 'goal-banner') && p.state.goals.list[0].met);
check(`its line "${lines()[0]}" is the wording Math.random picked, filled`, lines().length === 1 && lines()[0] === fill(words[1], g0));
check('play goes on: no overlay, Go still on', p.ui.overlay === null && p.ui.running);
const t = p.state.turn;
p.advance(1000);
check('Go keeps ticking under the banner', p.state.turn > t);
p.els.go.fire('click');
p.settle();
p.advance(p.run('GameDisplayArtifacts.MILESTONE_MS'));
check('it hides on its own', !shown(p, 'goal-banner'));

// Two goals of a fresh set in one tick (the third left unmet, so the set isn't done).
p.run('Math.random = () => 0.99');
p.engine.newGoals();
setCount(p, 1, p.state.goals.list[1].amount);
setCount(p, 2, p.state.goals.list[2].amount + 1);
waitTick(p);
const gs = p.engine.goalStates();
check('two goals met in one tick: two lines, in order', lines().length === 2 && lines()[0] === fill(words[2], gs[1]) && lines()[1] === fill(words[2], gs[2]));
p.run('Math.random = () => 0');
p.engine.newGoals();
setCount(p, 0, p.state.goals.list[0].amount);
waitTick(p);
check('Math.random 0 picks the first wording', lines()[0] === fill(words[0], p.engine.goalStates()[0]));
done();

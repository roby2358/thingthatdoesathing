// R-91: the side panel's New goals (D-76): engine.newGoals(), no tick; the lines show the new
// set from 0; it works mid-animation (like rotate) and the tick plays on; under an overlay it
// does nothing; telemetry gets the new set as a goal-set record (D-77, R-96), no event record.
'use strict';
const { check, done } = require('../helpers/check');
const { liveGame, setCount } = require('../helpers/goals');

const p = liveGame('small');
const turn = p.state.turn, rng = p.run('Rando.state()'), queued = JSON.stringify(p.run('GameTelemetry.pending()'));
setCount(p, 0, 1);
p.els['goals-side-new'].fire('click');
const g = p.engine.goalStates();
check('the next set is dealt', p.state.goals.set === 1);
check('no tick: turn and Rando unchanged', p.state.turn === turn && p.run('Rando.state()') === rng);
{
    const before = JSON.parse(queued), now = p.run('GameTelemetry.pending()');
    check('telemetry: no event record, one goal-set record for set 1 (reroll)', now.events.length === before.events.length &&
        now.goalSets.length === before.goalSets.length + 1 && now.goalSets.at(-1).set === 1 && now.goalSets.at(-1).how === 'reroll');
}
check('the lines show the new set, every count 0',
    p.ui.goalLines.every((l, i) => l.label.textContent.toLowerCase() === g[i].label.toLowerCase() && l.count.textContent === '0 / ' + g[i].amount));

p.ui.primaryAction();
check('a tick is animating', !!p.ui.anim);
const after = p.state.turn;
p.els['goals-side-new'].fire('click');
check('mid-animation: dealt at once, no tick', p.state.goals.set === 2 && p.state.turn === after && !!p.ui.anim);
p.settle();
check('the animation plays out', !p.ui.anim && p.state.turn === after);

p.ui.showHelp();
p.els['goals-side-new'].fire('click');
check('under Help: nothing', p.state.goals.set === 2 && p.ui.overlay === 'help');
p.ui.dismissOverlay();
done();

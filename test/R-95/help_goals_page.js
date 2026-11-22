// R-95: Help's last page is Goals and achievements (D-76): the mechanic only (three goals a
// game sized for a session, counted from the deal; New goals; the done panel; achievements as
// lifetime totals passing marks, kept only signed in or in a file copy's browser; goals met and
// achievements reached count too), never a goal counter's label or an amount.
'use strict';
const { check, done } = require('../helpers/check');
const { liveGame, shown } = require('../helpers/goals');

const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const page = html.slice(html.indexOf('<div id="help-page-5"'), html.indexOf('<div class="pager-nav">', html.indexOf('<div id="help-page-5"')));
const text = page.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
check('page 6 is headed Goals and achievements', /<h1>Goals and achievements<\/h1>/.test(page));
for (const [what, re] of [['three goals a game', /three goals/], ['sized for a session', /session/], ['counted from the deal', /counted from when the goals are dealt/],
    ['New goals re-rolls', /New goals deals three fresh ones/], ['the done panel', /new game, new goals, or to keep playing/],
    ['achievements are lifetime totals', /lifetime totals/], ['the marks', /10, 20, 50, 100, and on/], ['kept only signed in', /only while you're signed in/],
    ['a file copy keeps them in the browser', /from a file, in this browser/], ['goals met and achievements reached count', /Goals met and achievements reached are achievements too/]])
    check(`it says ${what}`, re.test(text));
const p = liveGame('small');
const labels = p.run('GameArtifacts.COUNTERS').filter(c => c.goal).map(c => c.label.toLowerCase());
check('no goal counter is named', labels.every(l => !text.toLowerCase().includes(l)));
check('no number but the marks', (text.match(/\d+/g) || []).every(n => ['10', '20', '50', '100'].includes(n)));
p.els.help.fire('click');
for (let i = 0; i < 5; i++) p.key('ArrowRight');
check('the pager reaches it last: "6 / 6", → disabled', shown(p, 'help-page-5') && p.els['help-count'].textContent === '6 / 6' && p.els['help-next'].disabled);
p.key('Escape');
done();

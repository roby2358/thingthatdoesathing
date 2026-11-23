// R-113: the selection hint (D-82). While a hex is selected (no card picked), the steady
// banner #select-hint shows SELECT_HINTS' line for it: a Thing that aims "turns", any other
// Thing "fixed", a bare hex "empty"; it hides the moment the selection clears (a click
// elsewhere, Esc, D removing the Thing, a card picked) and comes back on the next selection.
'use strict';
const { check, done } = require('../helpers/check');
const { liveGame, shown } = require('../helpers/goals');

const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const bannersAt = html.indexOf('<div id="banners">');
const hintAt = html.indexOf('<div id="select-hint" class="panel hidden">');
check('the page holds #select-hint, hidden, in the #banners column', bannersAt >= 0 && hintAt > bannersAt && hintAt < html.indexOf('<div id="hand"'));

const p = liveGame('small');
const HINTS = p.run('GameDisplayArtifacts.SELECT_HINTS');
check('three whole-sentence hints', HINTS.turns === 'Click to turn, click outside to deselect, D to delete'
    && HINTS.fixed === 'Click outside to deselect, D to delete' && HINTS.empty === 'Click outside to deselect');
const hint = () => (shown(p, 'select-hint') ? p.els['select-hint'].textContent : null);
p.ui.render();
check('nothing selected: hidden', hint() === null);

// Three plains hexes with no Thing, no piece and no port.
const ports = [...p.state.sources, ...p.state.targets];
const free = [...p.state.hexes.values()].filter(h => h.terrain === p.run('GameArtifacts.TERRAIN.PLAINS')
    && !ports.some(o => o.q === h.q && o.r === h.r) && !p.state.pieces.some(o => o.q === h.q && o.r === h.r)
    && !p.state.things.some(o => o.q === h.q && o.r === h.r));
const [belt, wall, bare, other] = free;
p.state.things.push({ kind: 'BELT', color: p.run('GameArtifacts.WHITE'), q: belt.q, r: belt.r, facing: 0 });
p.state.things.push({ kind: 'WALL', color: p.run('GameArtifacts.WHITE'), q: wall.q, r: wall.r, facing: 0 });
check('setup: a Belt aims, a Wall does not', p.run("GameArtifacts.aims('BELT')") && !p.run("GameArtifacts.aims('WALL')"));

const clickHex = h => { const { x, y } = p.ui.hexToScreen(h.q, h.r); p.ui.handleClick({ clientX: x, clientY: y }); };
clickHex(belt);
check('a selected Belt: the turns line', p.ui.selected && hint() === HINTS.turns);
clickHex(belt);
check('a click on it turns it; the hint stays', p.state.things.find(t => t.q === belt.q && t.r === belt.r).facing !== 0 && hint() === HINTS.turns);
clickHex(other);
check('a click elsewhere deselects: hidden', !p.ui.selected && hint() === null);
clickHex(wall);
check('a selected Wall: the fixed line', hint() === HINTS.fixed);
p.key('Escape');
check('Esc deselects: hidden', !p.ui.selected && hint() === null);
clickHex(bare);
check('a selected bare hex: the empty line', hint() === HINTS.empty);
p.key('1');
check('picking a card clears the selection: hidden', p.ui.picked && !p.ui.selected && hint() === null);
p.key('Escape');
check('the card back, still hidden', !p.ui.picked && hint() === null);
clickHex(wall);
check('selected again: back with the fixed line', hint() === HINTS.fixed);
p.key('d');
p.settle();
check('D removes the Wall and deselects: hidden', !p.state.things.some(t => t.q === wall.q && t.r === wall.r) && !p.ui.selected && hint() === null);
check('the hint never eats input (the #banners column takes no pointer events)',
    /#banners \{[^}]*pointer-events: none/.test(fs.readFileSync(path.join(__dirname, '..', '..', 'index.css'), 'utf8')));
done();

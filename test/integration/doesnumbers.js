// test/integration/doesnumbers.js — the Things' verb lines can't drift from the rules (D-60).
//
// Every THING_LOOK.does line is a card's hover text and its row on Help's Things page. Each
// number in it, in order, must be the rules data's: a mover's push, the Cannon's clears and
// push, the Pusher's shove, the Puller's reach and pull, the Bomb's wipes. A kind with no
// number in its line expects none. Also: every card has a look, gremlins are named only in
// the Trap's line, the Special cards page's Bomb count (filled from the rules) defaults to the same,
// and no piece hover name has a number typed in.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT } = require('../helpers/load');
const { check, done } = require('../helpers/check');

const src = ['artifacts.js', 'displayartifacts.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
const ctx = vm.createContext({ __out: {} });
vm.runInContext(src + '\n;Object.assign(__out, { GameArtifacts, GameDisplayArtifacts });', ctx);
const { THINGS, TOOLS, CARDS } = ctx.__out.GameArtifacts;
const { THING_LOOK, PIECE_LOOK } = ctx.__out.GameDisplayArtifacts;

// The numbers each line must say, in order. The Puller's 2 is the engine's fixed reach (the
// far hex two ahead, actionOf); its pull is how far it brings the piece back.
const PULLER_REACH = 2;
const EXPECT = {
    BELT: [THINGS.BELT.push],
    SPRING: [THINGS.SPRING.push],
    ROCKET: [THINGS.ROCKET.push],
    CANNON: [THINGS.CANNON.push, THINGS.CANNON.clears],
    PUSHER: [THINGS.PUSHER.shove],
    PULLER: [PULLER_REACH, THINGS.PULLER.pull],
    WALL: [],
    TRAP: [],
    BRIDGE: [THINGS.BRIDGE.push],
    SLIDE: [],
    MOVER: [],
    BOMB: [TOOLS.BOMB.wipes],
};

for (const kind of CARDS) {
    const look = THING_LOOK[kind];
    check(`${kind} has a THING_LOOK with a does line`, !!look && typeof look.does === 'string');
    if (!look) continue;
    check(`${kind}'s expected numbers are listed in this test`, kind in EXPECT);
    const said = (look.does.match(/\d+/g) || []).map(Number);
    check(`${kind}: "${look.does}" says [${said}], rules say [${EXPECT[kind]}]`, JSON.stringify(said) === JSON.stringify(EXPECT[kind]));
    check(`${kind}: gremlins named only in the Trap's line`, /gremlin/i.test(look.does) === (kind === 'TRAP'));
}

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const m = html.match(/<span id="bomb-wipes">(\d+)<\/span>/);
check('the Special cards page\'s Bomb count defaults to TOOLS.BOMB.wipes', !!m && Number(m[1]) === TOOLS.BOMB.wipes);
// Piece hover names carry no typed-in numbers: a big crate's "worth N" comes from PIECES at runtime.
for (const [kind, look] of Object.entries(PIECE_LOOK)) check(`PIECE_LOOK.${kind}'s name has no typed-in number`, !/\d/.test(look.name));

done();

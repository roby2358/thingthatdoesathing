// worker/counters.js — the achievement counters, the one list both routes check against (D-78,
// D-80): POST /achievements takes increments for them (achievements.js) and POST /t takes rung
// records naming them (telemetry.js). Its own module so neither route imports the other's for it
// (achievements.js already imports telemetry.js's request guards). Plain JavaScript, no build.

/** The counters a total may be kept for: every GameArtifacts.COUNTERS key, perGame or not, in
 *  table order, restated here (the Worker can't load the game's scripts; R-101 checks they match). */
export const ACHIEVEMENT_COUNTERS = ['cratesDelivered', 'bigDelivered', 'exGremlins', 'trapped', 'placed', 'springThrows',
    'rocketFlights', 'cannonLobs', 'moved', 'bombs', 'slides', 'mountainsFlown', 'pushes', 'pulls', 'pushesPulls',
    'milestones', 'goalsMet', 'rungsReached', 'cratesSunk', 'cratesSmashed', 'cratesLostOther', 'discards'];

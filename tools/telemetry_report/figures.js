// tools/telemetry_report/figures.js — the telemetry report's sums (ONTOLOGY "Telemetry report",
// D-66): every figure the report prints, worked out from plain records alone (records.js's
// shapes: games, events, milestones, crashes, goal sets, goals met and rungs). Pure functions: nothing here knows where the
// records came from or how a figure is printed, so the tests feed fixtures.
'use strict';

/** A gap between two records of a game this long or longer is a long pause: the player went away. */
const LONG_PAUSE_SECONDS = 300;

const SECONDS_PER_DAY = 86400;

/** User-Agent buckets: the first pattern that matches names the browser family or the OS. */
const BROWSERS = [
    ['Edge', /Edg(e|A|iOS)?\//],
    ['Opera', /OPR\/|Opera/],
    ['Samsung Internet', /SamsungBrowser\//],
    ['Firefox', /Firefox\/|FxiOS\//],
    ['Chrome', /Chrome\/|CriOS\//],
    ['Safari', /Safari\//],
];
const OSES = [
    ['Windows', /Windows/],
    ['iOS', /iPhone|iPad|iPod/],
    ['Android', /Android/],
    ['ChromeOS', /CrOS/],
    ['macOS', /Macintosh|Mac OS X/],
    ['Linux', /Linux/],
];

/** Window sizes are bucketed down to this many px each way. */
const WINDOW_BUCKET_PX = 100;

/** How a set of numbers lies. With none, count is 0 and the rest are 0 and mean nothing. */
function summarize(values) {
    if (values.length === 0) return { count: 0, total: 0, min: 0, median: 0, mean: 0, max: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    const total = sum(sorted);
    return {
        count: sorted.length, total, min: sorted[0],
        median: sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
        mean: total / sorted.length, max: sorted[sorted.length - 1],
    };
}

function median(values) { return summarize(values).median; }

function sum(values) { return values.reduce((t, v) => t + v, 0); }

function groupBy(items, keyOf) {
    const groups = new Map();
    for (const item of items) {
        const key = keyOf(item);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    }
    return groups;
}

/** [key, items] pairs, the largest group first, equal ones by key. */
function largestFirst(groups) {
    return [...groups].sort(([a, as], [b, bs]) => bs.length - as.length || String(a).localeCompare(String(b)));
}

/** [key, items] pairs in rising order of a numeric key. */
function rising(groups) {
    return [...groups].sort(([a], [b]) => a - b);
}

/** Rows {key: count} for the groups, largest first. */
function counted(groups, key, count) {
    return largestFirst(groups).map(([k, items]) => ({ [key]: k, [count]: items.length }));
}

/** The UTC day of a time, as yyyy-mm-dd. */
function utcDay(unixSeconds) {
    return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

/** A User-Agent as "browser / OS", each "other" when no pattern matches; "unknown" with none. */
function clientOf(userAgent) {
    if (!userAgent) return 'unknown';
    const pick = table => (table.find(([, re]) => re.test(userAgent)) || ['other'])[0];
    return pick(BROWSERS) + ' / ' + pick(OSES);
}

/** A screen "WxH@dpr" as its window bucket ("1900x1000": rounded down to WINDOW_BUCKET_PX) and its ratio. */
function screenOf(screen) {
    const m = /^(\d+)x(\d+)@([\d.]+)$/.exec(screen || '');
    if (!m) return { window: 'unknown', ratio: 'unknown' };
    const down = n => Math.floor(Number(n) / WINDOW_BUCKET_PX) * WINDOW_BUCKET_PX;
    return { window: down(m[1]) + 'x' + down(m[2]), ratio: String(Math.round(Number(m[3]) * 100) / 100) };
}

/** A crash message with its numbers taken out, so crashes of one kind count together. */
function messageKind(message) {
    return String(message).replace(/\d+(\.\d+)?/g, 'N');
}

/** The play of the period: games started at or after `since` with their events and milestones,
 *  and the crashes of the period (the queries already chose them by time). Events and
 *  milestones whose game has no games row at all are counted as left out. */
function inPeriod(play, since) {
    const known = new Set(play.games.map(g => g.gameKey));
    const games = play.games.filter(g => g.startedUnixSeconds >= since);
    const kept = new Set(games.map(g => g.gameKey));
    return {
        play: {
            games,
            events: play.events.filter(e => kept.has(e.gameKey)),
            milestones: play.milestones.filter(m => kept.has(m.gameKey)),
            crashes: play.crashes.filter(c => c.unixSeconds >= since),
            goalSets: play.goalSets.filter(s => kept.has(s.gameKey)),
            goalsMet: play.goalsMet.filter(m => kept.has(m.gameKey)),
            rungs: play.rungs.filter(r => kept.has(r.gameKey)),
        },
        leftOut: {
            events: play.events.filter(e => !known.has(e.gameKey)).length,
            milestones: play.milestones.filter(m => !known.has(m.gameKey)).length,
        },
    };
}

/** The play split by rules version, lowest first; a crash goes with its game. `unattached` are
 *  the crashes with no game of the play (none, or one not in it). */
function byRulesVersion(play) {
    const keysOf = games => new Set(games.map(g => g.gameKey));
    const all = keysOf(play.games);
    const versions = rising(groupBy(play.games, g => g.rulesVersion)).map(([rulesVersion, games]) => {
        const keys = keysOf(games);
        const mine = r => keys.has(r.gameKey);
        return {
            rulesVersion,
            play: { games, events: play.events.filter(mine), milestones: play.milestones.filter(mine), crashes: play.crashes.filter(mine),
                goalSets: play.goalSets.filter(mine), goalsMet: play.goalsMet.filter(mine), rungs: play.rungs.filter(mine) },
        };
    });
    return { versions, unattached: play.crashes.filter(c => !all.has(c.gameKey)) };
}

/** Each game with its events (seq order) and milestones. */
function gamePlays(play) {
    const events = groupBy(play.events, e => e.gameKey);
    const milestones = groupBy(play.milestones, m => m.gameKey);
    return play.games.map(game => ({
        game,
        events: [...(events.get(game.gameKey) || [])].sort((a, b) => a.seq - b.seq),
        milestones: [...(milestones.get(game.gameKey) || [])].sort((a, b) => a.milestone - b.milestone),
    }));
}

function gamesFigures(play, sizeOrder) {
    const versions = largestFirst(groupBy(play.games, g => g.version)).map(([version, games]) => {
        const starts = games.map(g => g.startedUnixSeconds);
        return { version, games: games.length, first: utcDay(Math.min(...starts)), last: utcDay(Math.max(...starts)) };
    });
    return {
        perDay: [...groupBy(play.games, g => utcDay(g.startedUnixSeconds))].sort(([a], [b]) => a.localeCompare(b))
            .map(([day, games]) => ({ day, games: games.length })),
        bySize: inSizeOrder(groupBy(play.games, g => g.size), sizeOrder).map(([size, games]) => ({ size, games: games.length })),
        byVersion: versions,
    };
}

/** [size, items] pairs in sizeOrder (MAP_SIZES order), sizes it doesn't name after, by name. */
function inSizeOrder(groups, sizeOrder) {
    const rank = s => { const i = sizeOrder.indexOf(s); return i < 0 ? sizeOrder.length : i; };
    return [...groups].sort(([a], [b]) => rank(a) - rank(b) || String(a).localeCompare(String(b)));
}

function milestoneFigures(play, sizeOrder) {
    const sizeOf = new Map(play.games.map(g => [g.gameKey, g.size]));
    const gamesPerSize = groupBy(play.games, g => g.size);
    return inSizeOrder(gamesPerSize, sizeOrder).map(([size, games]) => {
        const reached = play.milestones.filter(m => sizeOf.get(m.gameKey) === size);
        return {
            size, games: games.length,
            rows: rising(groupBy(reached, m => m.milestone)).map(([milestone, ms]) => ({
                milestone, games: ms.length, turn: summarize(ms.map(m => m.turn)),
                delivered: median(ms.map(m => m.delivered)), lost: median(ms.map(m => m.lost)),
                exGremlins: median(ms.map(m => m.exGremlins)), trapped: median(ms.map(m => m.trapped)),
            })),
        };
    });
}

function commandFigures(play) {
    const tally = events => {
        const refused = events.filter(e => !e.accepted).length;
        return { count: events.length, refused };
    };
    const ofCommand = command => play.events.filter(e => e.command === command);
    const byKind = command => largestFirst(groupBy(ofCommand(command), e => e.args.kind ?? '(none)'))
        .map(([kind, events]) => ({ kind, ...tally(events) }));
    return {
        perCommand: largestFirst(groupBy(play.events, e => e.command)).map(([command, events]) => ({ command, ...tally(events) })),
        placeByKind: byKind('place'),
        discardByKind: byKind('discard'),
        discardByHow: counted(groupBy(ofCommand('discard'), e => e.args.how ?? '(none)'), 'how', 'discards'),
    };
}

function bombFigures(play) {
    const bombs = play.events.filter(e => e.command === 'bomb' && e.accepted && Array.isArray(e.args.hexes));
    return { bombs: bombs.length, perHexes: rising(groupBy(bombs, e => e.args.hexes.length)).map(([hexes, es]) => ({ hexes, bombs: es.length })) };
}

/** A game's record times, in order: its start, then its events and milestones. */
function timesOf({ game, events, milestones }) {
    return [game.startedUnixSeconds, ...events.map(e => e.unixSeconds), ...milestones.map(m => m.unixSeconds)].sort((a, b) => a - b);
}

function sessionFigures(play) {
    const loads = groupBy(play.games.filter(g => !g.signedIn), g => g.playerId);
    const plays = gamePlays(play);
    const recorded = plays.filter(p => p.events.length + p.milestones.length > 0);
    const gaps = recorded.map(p => { const t = timesOf(p); return t.slice(1).map((v, i) => v - t[i]); });
    return {
        pageLoads: loads.size,
        gamesPerLoad: rising(groupBy([...loads.values()], games => games.length)).map(([games, ls]) => ({ games, loads: ls.length })),
        gamesPerLoadSummary: summarize([...loads.values()].map(games => games.length)),
        realLength: summarize(gaps.map(sum)),
        activeLength: summarize(gaps.map(own => sum(own.filter(g => g < LONG_PAUSE_SECONDS)))),
        longPauses: gaps.flat().filter(g => g >= LONG_PAUSE_SECONDS).length,
        turns: summarize(recorded.map(p => Math.max(...p.events.map(e => e.turn), ...p.milestones.map(m => m.turn)))),
        unrecorded: plays.length - recorded.length,
    };
}

function clientFigures(play) {
    return {
        clients: counted(groupBy(play.games, g => clientOf(g.userAgent)), 'client', 'games'),
        windows: counted(groupBy(play.games, g => screenOf(g.screen).window), 'window', 'games'),
        ratios: counted(groupBy(play.games, g => screenOf(g.screen).ratio), 'ratio', 'games'),
    };
}

function crashFigures(crashes, knownGames) {
    return {
        count: crashes.length,
        perVersion: counted(groupBy(crashes, c => c.version ?? '(none)'), 'version', 'crashes'),
        messages: largestFirst(groupBy(crashes, c => messageKind(c.message))).map(([message, cs]) => ({
            message, crashes: cs.length, games: new Set(cs.filter(c => c.gameKey !== null).map(c => c.gameKey)).size,
        })),
        noGame: crashes.filter(c => c.gameKey === null).length,
        gameNotInReport: crashes.filter(c => c.gameKey !== null && !knownGames.has(c.gameKey)).length,
    };
}

function playerFigures(play) {
    const rows = [
        ...play.games.map(g => ({ ...g, unixSeconds: g.startedUnixSeconds })),
        ...play.events, ...play.milestones, ...play.crashes,
    ];
    const signed = groupBy(rows.filter(r => r.signedIn), r => r.playerId);
    const players = [...signed.values()];
    const identities = groupBy(rows.filter(r => r.gameKey !== null), r => r.gameKey);
    return {
        signedIn: players.length,
        severalDays: players.filter(rs => new Set(rs.map(r => utcDay(r.unixSeconds))).size > 1).length,
        switched: [...identities.values()].filter(rs => new Set(rs.map(r => r.playerId + '|' + r.signedIn)).size > 1).length,
    };
}

/** Goals (D-77), per goal counter: times dealt, times re-rolled away (unmet in a set that a
 *  'reroll' set followed), times met, and the median turns from its set's deal to the goal met
 *  (goals met whose set record is known). Most dealt first. Then the sets dealt, by how, and the
 *  sets done (every goal of a known set met). */
function goalFigures(play) {
    const sets = play.goalSets, met = play.goalsMet;
    const setKey = (gameKey, set) => gameKey + '|' + set;
    const setOf = new Map(sets.map(s => [setKey(s.gameKey, s.set), s]));
    const metKeys = new Set(met.map(m => setKey(m.gameKey, m.set) + '|' + m.index));
    const rows = new Map();
    const row = counter => {
        if (!rows.has(counter)) rows.set(counter, { counter, dealt: 0, rerolled: 0, met: 0, turns: [] });
        return rows.get(counter);
    };
    let done = 0;
    for (const s of sets) {
        const next = setOf.get(setKey(s.gameKey, s.set + 1));
        const unmet = s.goals.filter((g, i) => !metKeys.has(setKey(s.gameKey, s.set) + '|' + i));
        for (const g of s.goals) row(g.counter).dealt++;
        if (next && next.how === 'reroll') for (const g of unmet) row(g.counter).rerolled++;
        if (unmet.length === 0) done++;
    }
    for (const m of met) {
        const r = row(m.counter);
        r.met++;
        const s = setOf.get(setKey(m.gameKey, m.set));
        if (s) r.turns.push(m.turn - s.turn);
    }
    return {
        perCounter: [...rows.values()].sort((a, b) => b.dealt - a.dealt || a.counter.localeCompare(b.counter))
            .map(({ turns, ...r }) => ({ ...r, medianTurns: turns.length === 0 ? null : median(turns) })),
        sets: sets.length,
        byHow: counted(groupBy(sets, s => s.how), 'how', 'sets'),
        done,
    };
}

/** Achievements (D-80), per counter: the distinct players who reached each of its rungs (rising),
 *  the players who reached any, and the highest rung seen. Most players first, ties by name. Then
 *  the rung records and the distinct players among them. */
function achievementFigures(play) {
    const perCounter = [...groupBy(play.rungs, r => r.counter)].map(([counter, rs]) => ({
        counter,
        players: new Set(rs.map(r => r.playerId)).size,
        highest: Math.max(...rs.map(r => r.rung)),
        perRung: rising(groupBy(rs, r => r.rung)).map(([rung, at]) => ({ rung, players: new Set(at.map(r => r.playerId)).size })),
    }));
    return {
        perCounter: perCounter.sort((a, b) => b.players - a.players || a.counter.localeCompare(b.counter)),
        rungs: play.rungs.length,
        players: new Set(play.rungs.map(r => r.playerId)).size,
    };
}

/** Every figure of one play. `sizeOrder` is the MAP_SIZES keys in order. */
function figures(play, sizeOrder) {
    const knownGames = new Set(play.games.map(g => g.gameKey));
    return {
        games: gamesFigures(play, sizeOrder),
        milestones: milestoneFigures(play, sizeOrder),
        commands: commandFigures(play),
        bomb: bombFigures(play),
        sessions: sessionFigures(play),
        clients: clientFigures(play),
        crashes: crashFigures(play.crashes, knownGames),
        players: playerFigures(play),
        goals: goalFigures(play),
        achievements: achievementFigures(play),
    };
}

module.exports = {
    LONG_PAUSE_SECONDS, SECONDS_PER_DAY, WINDOW_BUCKET_PX, summarize, utcDay, clientOf, screenOf, messageKind,
    inPeriod, byRulesVersion, figures, crashFigures, goalFigures, achievementFigures,
};

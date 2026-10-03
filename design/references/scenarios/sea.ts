/**
 * Gate 18 scenario: one self-planning settlement on Islands at size M, with settling and trade on, for
 * `seconds`. No build calls. Its first colony (a daughter founded across water) is followed: does it
 * last `survive_seconds` with people in it, and do porters cross between it and its mother?
 */
import { start, worldOf, type Scenario } from '../../../src/gates/kit.ts';
import { runFor, villagers } from '../../../src/sim/index.ts';

export const run: Scenario = (content, params) => {
  const { seed, seconds } = params, survive = Number(params.survive_seconds);
  const S = start(content, seed, { planner: true, settlers: true, trade: true, ...worldOf(params) });
  let colony = -1, foundedAt = -1, alive = 0;
  const trips = new Set<number>();
  for (let t = 0; t < seconds; t++) {
    runFor(S, 1);
    if (colony < 0) { const c = S.towns.find(w => w.overseas); if (c) { colony = c.id; foundedAt = S.t; } }
    if (colony < 0) continue;
    const mother = S.towns[colony].mother;
    // a porter's errand between the colony and its mother, either way, counted once a trip
    for (const a of S.agents) if (a.visit?.trade && ((a.visit.from === colony && a.visit.to === mother) || (a.visit.from === mother && a.visit.to === colony))) trips.add(a.id * 100000 + Math.floor(a.visit.from));
    if (S.t - foundedAt <= survive) alive = villagers(S).some(a => a.home?.town === colony) ? Math.min(survive, S.t - foundedAt) : alive;
  }
  return {
    state: S,
    metrics: {
      game_seconds: Math.round(S.t),
      settlements: S.towns.length,
      colonies: S.towns.filter(w => w.overseas).length,
      colony_founded_at: Math.round(foundedAt),
      colony_survived_seconds: Math.round(alive),
      colony_villagers: colony < 0 ? 0 : villagers(S).filter(a => a.home?.town === colony).length,
      porter_trips_with_mother: trips.size,
      trades: S.stats.trades,
    },
  };
};

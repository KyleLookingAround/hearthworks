/**
 * Gate 17 scenario: one self-planning settlement on Landmass at the large size with settling on, for
 * `seconds`. No build calls. Every settlement, the first and each daughter, is watched from five minutes
 * after its founding: how low its share fed goes, and (once fifteen minutes old) how many times its first
 * people it has at the end.
 */
import { start, worldOf, type Scenario } from '../../../src/gates/kit.ts';
import { runFor, villagers } from '../../../src/sim/index.ts';

export const run: Scenario = (content, params) => {
  const { seed, seconds } = params;
  const S = start(content, seed, { planner: true, settlers: true, ...worldOf(params) });
  const born: number[] = [], first: number[] = [], fed: number[] = [];
  const pop = (id: number) => villagers(S).filter(a => a.home?.town === id).length;
  for (let t = 0; t < seconds; t++) {
    runFor(S, 1);
    for (const w of S.towns) {
      if (born[w.id] === undefined) { born[w.id] = S.t; first[w.id] = pop(w.id); fed[w.id] = 1; }
      if (S.t - born[w.id] > 300) fed[w.id] = Math.min(fed[w.id], w.fed);
    }
  }
  // growth, for settlements founded at least fifteen minutes before the end
  const growth = S.towns.filter(w => S.t - born[w.id] >= 900).map(w => pop(w.id) / Math.max(1, first[w.id]));
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return {
    state: S,
    metrics: {
      game_seconds: Math.round(S.t),
      settlements: S.towns.length,
      daughters: S.towns.filter(w => w.mother !== null).length,
      villagers: villagers(S).length,
      growth_min: r(Math.min(...growth)),
      fed_min: r(Math.min(...fed)),
      departures: S.stats.departures,
    },
  };
};

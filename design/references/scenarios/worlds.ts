/**
 * Gate 7 scenario, two parts, no build calls.
 *
 * Scale: the standard map type at `size`, `settlements` self-planning settlements, `seconds` of play.
 * Work counters are reported per game minute so they can carry budgets.
 *
 * Map suite: every map type at every size a player can pick that the type offers on `suite_seeds` seeds (the first is `seed`), each with the
 * size's starting settlements planning for `suite_seconds`. A run fails if a settlement could not be
 * founded, if anyone left, or if any settlement ends hungry (mood under `migrate_min_mood`'s bar, 0.6).
 */
import { runTracked, standardMetrics, start, type Scenario } from '../../../src/gates/kit.ts';
import { runFor, villagers, type State } from '../../../src/sim/index.ts';

const perMinute = (n: number, S: State) => Math.round(n / (S.t / 60));

export const run: Scenario = (content, params) => {
  const { seed, seconds } = params;
  const size = String(params.size ?? 's'), towns = Number(params.settlements ?? 4);
  const suiteSeconds = Number(params.suite_seconds ?? 900), suiteSeeds = Number(params.suite_seeds ?? 3);

  const S = start(content, seed, { planner: true, settlements: towns, size });
  let townMin = 1;
  const { minMood } = runTracked(S, seconds, 300, s => { if (s.t >= 300) for (const t of s.towns) townMin = Math.min(townMin, t.mood); });

  let runs = 0, failures = 0, worst = 1;
  const seeds = [seed, 7, 42, 99, 2026, 31337].slice(0, suiteSeeds);
  for (const map of Object.keys(content.maps).sort()) for (const [sz, z] of Object.entries(content.tuning.map.sizes)) for (const sd of seeds) {
    if (!z.offered || (content.maps[map].sizes && !content.maps[map].sizes!.includes(sz))) continue;
    runs++;
    const T = start(content, sd, { planner: true, settlements: z.settlements, map, size: sz });
    runFor(T, suiteSeconds);
    const fed = Math.min(...T.towns.map(t => t.mood));
    worst = Math.min(worst, fed);
    const ok = T.towns.length === z.settlements && T.stats.departures === 0 && fed >= 0.6 && villagers(T).length > 0;
    if (!ok) { failures++; console.error(`suite: ${map} ${sz} seed ${sd}: ${T.towns.length}/${z.settlements} settlements, ${T.stats.departures} departures, lowest mood ${fed.toFixed(2)}`); }
  }

  const w = S.world.work;
  return {
    state: S,
    metrics: standardMetrics(S, {
      settlements: S.towns.length,
      mood_min: Math.round(minMood * 1000) / 1000,
      town_mood_min: Math.round(townMin * 1000) / 1000,
      departure_share: S.stats.peakVillagers ? Math.round(S.stats.departures / S.stats.peakVillagers * 1000) / 1000 : 0,
      path_nodes_per_min: perMinute(w.pathNodes, S),
      job_pairs_per_min: perMinute(w.jobPairs, S),
      planner_spots_per_min: perMinute(w.plannerSpots, S),
      suite_runs: runs,
      suite_failures: failures,
      suite_mood_min: Math.round(worst * 1000) / 1000,
    }),
  };
};

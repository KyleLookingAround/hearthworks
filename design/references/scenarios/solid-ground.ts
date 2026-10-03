/**
 * Gate 6 scenario: two self-planning settlements on the standard map. One game runs
 * uninterrupted; a second copy is saved halfway, written out as JSON, loaded and played on.
 * No build calls. Passes when both finish identical, nobody is ever inside a building's walls,
 * and the villages thrive as in Gates 4 and 5.
 */
import { runTracked, standardMetrics, start, worldOf, type Scenario } from '../../../src/gates/kit.ts';
import { loadGame, runFor, saveGame, type State } from '../../../src/sim/index.ts';

/** Agents standing on a building tile that is not its door (a bridge is walked on). */
const insideWalls = (S: State) => S.agents.filter(a => {
  const w = S.world, i = Math.floor(a.y) * w.w + Math.floor(a.x);
  return w.bgrid[i] !== -1 && !w.door[i] && !w.bridge[i];
}).length;

export const run: Scenario = (content, params) => {
  const { seed, seconds } = params;
  const opts = { planner: true, settlements: 2, ...worldOf(params) };
  const half = Math.floor(seconds / 2);
  let worst = 0;
  const watch = (s: State) => { worst = Math.max(worst, insideWalls(s)); };

  // the world's share fed averages both villages; each one must also be fed on its own
  let townMin = 1;
  const S = start(content, seed, opts);
  const { minMood, minFed } = runTracked(S, seconds, 300, s => {
    watch(s);
    if (s.t >= 300) for (const t of s.towns) townMin = Math.min(townMin, t.fed);
  });

  const T = start(content, seed, opts);
  runFor(T, half);
  const saved = JSON.stringify(saveGame(T));
  const R = loadGame(content, saved);
  runTracked(R, seconds - half, 0, watch);

  const same = JSON.stringify(saveGame(S)) === JSON.stringify(saveGame(R))
    && JSON.stringify(standardMetrics(S)) === JSON.stringify(standardMetrics(R));
  return {
    state: S,
    metrics: standardMetrics(S, {
      mood_min: minMood,
      fed_min: minFed,
      town_fed_min: Math.round(townMin * 1000) / 1000,
      settlements: S.towns.length,
      save_roundtrip_match: same ? 1 : 0,
      save_bytes: saved.length,
      agents_inside_walls: worst,
    }),
  };
};

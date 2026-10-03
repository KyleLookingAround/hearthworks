/**
 * Gate 2 scenario: a scripted stand-in for the planner. Starts the wood and
 * bread chains, then once a minute adds what a sensible player would: a house
 * when beds run out, a farm and bakery per eight villagers, a second forester
 * and sawmill once the town passes ten. Passes when the town grows and stays
 * fed for the whole run.
 */
import { build, centre, runTracked, standardMetrics, start, storeOf, type Scenario } from '../../../src/gates/kit.ts';
import { bp, countBuilt, villagers, type State } from '../../../src/sim/index.ts';

const queued = (S: State, type: string) => S.buildings.filter(b => b.type === type).length;

export const run: Scenario = (content, { seed, seconds, max_houses = 8 }) => {
  const S = start(content, seed);
  const c = centre(S);
  build(S, 'forester', c);
  build(S, 'sawmill', { x: c.x, y: c.y + 4 });
  build(S, 'farm', { x: c.x + 5, y: c.y + 5 });
  build(S, 'bakery', { x: c.x - 4, y: c.y + 5 });

  const plan = (s: State) => {
    if (Math.floor(s.t) % 60 !== 0) return;
    const pop = villagers(s).length, store = storeOf(s);
    const planks = store.inv.planks || 0;
    const beds = s.buildings.filter(b => bp(s, b).homes && !b.site).reduce((n, b) => n + bp(s, b).homes - b.residents.length, 0);
    const sitesOpen = s.buildings.some(b => b.site);
    if (sitesOpen) return;
    if (pop >= 10 && queued(s, 'forester') < 2 && planks >= 4) { build(s, 'forester', c, 14); return; }
    if (pop >= 10 && queued(s, 'sawmill') < 2 && planks >= 6) { build(s, 'sawmill', { x: c.x + 2, y: c.y + 6 }); return; }
    if (queued(s, 'bakery') * 8 < pop + 2 && planks >= 12) {
      build(s, 'farm', { x: c.x + 6, y: c.y + 7 });
      build(s, 'bakery', { x: c.x - 5, y: c.y + 7 });
      return;
    }
    if (beds === 0 && queued(s, 'house') < max_houses && planks >= 6) build(s, 'house', { x: c.x, y: c.y - 5 });
  };
  const { minMood } = runTracked(S, seconds, 300, plan);
  return { state: S, metrics: standardMetrics(S, { mood_min: minMood, houses: countBuilt(S, 'house'), bakeries: countBuilt(S, 'bakery') }) };
};

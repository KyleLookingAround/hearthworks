/**
 * Gate 3 scenario: start the wood and bread chains, wait until the Sawmill
 * and Bakery are standing, then add a Courier Depot beside the storage yard.
 * Passes when bots carry a real share of the hauling.
 *
 * The depot waits because construction sites have no priority yet: placed
 * together, the depot's 20 planks starved the Sawmill (see /log.md).
 */
import { build, centre, runTracked, standardMetrics, start, worldOf, type Scenario } from '../../../src/gates/kit.ts';
import { hasBuilt, runFor } from '../../../src/sim/index.ts';

export const run: Scenario = (content, params) => {
  const { seed, seconds } = params;
  const S = start(content, seed, worldOf(params));
  const c = centre(S);
  build(S, 'forester', c);
  build(S, 'sawmill', { x: c.x, y: c.y + 4 });
  build(S, 'farm', { x: c.x + 5, y: c.y + 5 });
  build(S, 'bakery', { x: c.x - 4, y: c.y + 5 });
  while (S.t < seconds && !(hasBuilt(S, 'sawmill') && hasBuilt(S, 'bakery'))) runFor(S, 1);
  build(S, 'depot', { x: c.x + 4, y: c.y - 4 });
  const { minMood } = runTracked(S, Math.max(0, seconds - S.t));
  return { state: S, metrics: standardMetrics(S, { mood_min: minMood, depot_built: hasBuilt(S, 'depot') ? 1 : 0 }) };
};

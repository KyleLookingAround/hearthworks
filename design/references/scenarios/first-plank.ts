/**
 * Gate 1 scenario: place a Forester and a Sawmill, then take hands off.
 * Passes when villagers alone build both, fell trees and saw planks.
 */
import { build, centre, runTracked, standardMetrics, start, worldOf, type Scenario } from '../../../src/gates/kit.ts';

export const run: Scenario = (content, params) => {
  const { seed, seconds } = params;
  const S = start(content, seed, worldOf(params));
  const c = centre(S);
  build(S, 'forester', c);
  build(S, 'sawmill', { x: c.x, y: c.y + 4 });
  const { minMood, minFed } = runTracked(S, seconds);
  return { state: S, metrics: standardMetrics(S, { mood_min: minMood, fed_min: minFed }) };
};

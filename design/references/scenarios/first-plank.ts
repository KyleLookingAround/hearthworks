/**
 * Gate 1 scenario: place a Forester and a Sawmill, then take hands off.
 * Passes when villagers alone build both, fell trees and saw planks.
 */
import { build, centre, runTracked, standardMetrics, start, type Scenario } from '../../../src/gates/kit.ts';

export const run: Scenario = (content, { seed, seconds }) => {
  const S = start(content, seed);
  const c = centre(S);
  build(S, 'forester', c);
  build(S, 'sawmill', { x: c.x, y: c.y + 4 });
  const { minMood } = runTracked(S, seconds);
  return { state: S, metrics: standardMetrics(S, { mood_min: minMood }) };
};

/**
 * Gate 19 scenario, two parts.
 * Spread: one self-planning settlement on Landmass at size L with every system a new game has (seasons
 * excepted), for `seconds`; how many settlements end past the first age, and whether what an era unlocks
 * is thought of only by settlements of that age.
 * Regression: one isolated settlement taught the discoveries of the second age by a neighbour (scripted)
 * that never builds them, run for `keep_seconds` without a library and with one: does it fall back an age?
 */
import { centre, findSpot, start, worldOf, type Scenario } from '../../../src/gates/kit.ts';
import { placeBuilding, runFor, villagers } from '../../../src/sim/index.ts';

export const run: Scenario = (content, params) => {
  const { seed, seconds } = params, keep = Number(params.keep_seconds);
  const S = start(content, seed, { planner: true, settlers: true, carts: true, trade: true, people: true, ...worldOf(params) });
  // what an era unlocks: each thought of here (not taught), and whether the settlement had reached its age when it was
  const needed = new Map<string, number>(content.eras.flatMap((E, i) => E.unlocks.map(id => [id, i] as [string, number])));
  const ages = new Map<number, number>(), seen = new Set<string>();
  let unlocked = 0, early = 0;
  runFor(S, seconds, s => {
    for (const t of s.towns) {
      for (const [id, age] of needed) {
        const k = t.knows[id];
        if (!k || k.by !== t.name || k.from || seen.has(`${t.id}:${id}`)) continue;
        seen.add(`${t.id}:${id}`); unlocked++;
        // the age it had when it thought of it: the one it had before this second's knowledge turn
        if ((ages.get(t.id) ?? 0) < age) early++;
      }
      ages.set(t.id, t.age);
    }
  });
  const past = S.towns.filter(t => t.age >= 1).length;

  const fallsBack = (library: boolean) => {
    const T = start(content, seed, { ...worldOf(params) });
    const t = T.towns[0];
    for (const id of content.eras[1].discoveries) t.knows[id] = { by: 'Elsewhere', at: 0, verified: [], from: 'Elsewhere', learned: 0, used: 0 };
    if (library) { const at = findSpot(T, 'library', centre(T), 30)!; placeBuilding(T, 'library', at.x, at.y, true); }
    runFor(T, 2);
    const before = t.age;
    runFor(T, keep);
    return { before, after: t.age };
  };
  const bare = fallsBack(false), kept = fallsBack(true);

  return {
    state: S,
    metrics: {
      game_seconds: Math.round(S.t),
      settlements: S.towns.length,
      villagers: villagers(S).length,
      past_first_age: past,
      age_share: Math.round((past / Math.max(1, S.towns.length)) * 1000) / 1000,
      oldest_age: Math.max(...S.towns.map(t => t.age)),
      unlocked_thought_of: unlocked,
      thought_of_before_age: early,
      age_before_alone: bare.before,
      age_after_alone: bare.after,
      fell_back_without_library: bare.after < bare.before ? 1 : 0,
      fell_back_with_library: kept.after < kept.before ? 1 : 0,
    },
  };
};

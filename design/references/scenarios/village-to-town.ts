/**
 * Gate 9 scenario: one self-planning settlement on the standard map for an hour. No build calls.
 * Passes when it grows from a roomy hamlet into a town: denser homes, old blocks replanned with nobody
 * leaving for it, workplaces pulled down or moved out of the centres, more than one district, everyone fed,
 * planning within its budget.
 */
import { runTracked, standardMetrics, start, worldOf, type Scenario } from '../../../src/gates/kit.ts';
import { bp, type State } from '../../../src/sim/index.ts';
import { centreOf, formOf, hubs } from '../../../src/sim/planner.ts';

/** Beds per tile of housing land: home footprints and the ring of land around them. */
function homeDensity(S: State): number {
  const w = S.world, land = new Uint8Array(w.ground.length);
  let beds = 0;
  for (const b of S.buildings) {
    const B = bp(S, b);
    if (!B.homes || b.site) continue;
    beds += B.homes;
    for (let y = b.y - 1; y <= b.y + b.h; y++) for (let x = b.x - 1; x <= b.x + b.w; x++) if (x >= 0 && y >= 0 && x < w.w && y < w.h) land[y * w.w + x] = 1;
  }
  let tiles = 0;
  for (const t of land) tiles += t;
  return tiles ? beds / tiles : 0;
}

/** Of the finished buildings in the district centres (within `centre_radius` of a district's storage yard), the share that are homes. */
function centreHomes(S: State): number {
  const town = S.towns[0], hearts = new Set(town.districts);
  const inCentre = S.buildings.filter(b => b.town === town.id && !b.site && !hearts.has(b.id) && !bp(S, b).paves && centreOf(S, town, b));
  return inCentre.length ? Math.round((inCentre.filter(b => bp(S, b).homes).length / inCentre.length) * 1000) / 1000 : 0;
}

export const run: Scenario = (content, params) => {
  const { seed, seconds } = params;
  const S = start(content, seed, { planner: true, ...worldOf(params) });
  const hamlet = homeDensity(S);
  const { minMood, minFed } = runTracked(S, seconds, 300);
  const minutes = S.t / 60, town = S.towns[0];
  return {
    state: S,
    metrics: standardMetrics(S, {
      mood_min: minMood,
      fed_min: minFed,
      town_form: ['hamlet', 'village', 'town'].indexOf(formOf(S, town)),
      density_ratio: Math.round((homeDensity(S) / hamlet) * 1000) / 1000,
      blocks_replanned: S.stats.replanned,
      pulled_down: S.stats.pulledDown,
      moved_out: S.stats.movedOut,
      renewed: S.stats.pulledDown + S.stats.movedOut,
      centre_home_share: centreHomes(S),
      mean_delivery_seconds: Math.round((S.stats.deliverySeconds / Math.max(1, S.stats.delivered)) * 100) / 100,
      mean_delivery_tiles: Math.round((S.stats.deliveryTiles / Math.max(1, S.stats.delivered)) * 100) / 100,
      demolition_departures: S.stats.demolitionDepartures,
      districts: hubs(S, town).length,
      terraces: S.buildings.filter(b => b.type === 'terrace' && !b.site).length,
      planner_spots_per_min: Math.round(S.world.work.plannerSpots / minutes),
    }),
  };
};

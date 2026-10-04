/**
 * Gate 21 scenario: one self-planning settlement on the standard map with planned roads on, for `seconds`.
 * No build calls. Watched: the roads it lays (each a straight strip), whether one passes by its first storage
 * yard's door, anyone who left because a road took their home, the pace of deliveries mostly along roads
 * against those mostly along paths, and how many buildings planned after its first road have their door on
 * or looking down to a road.
 */
import { start, worldOf, type Scenario } from '../../../src/gates/kit.ts';
import { door, runFor, villagers } from '../../../src/sim/index.ts';
import { roadByCentre } from '../../../src/sim/roads.ts';

export const run: Scenario = (content, params) => {
  const { seed, seconds } = params;
  const S = start(content, seed, { planner: true, plannedRoads: true, ...worldOf(params) });
  const town = S.towns[0], W = S.world, near = content.tuning.roads.nearTiles;
  let fedMin = 1, after = -1;
  for (let t = 0; t < seconds; t++) {
    runFor(S, 1);
    if (S.t > 300) fedMin = Math.min(fedMin, S.fed);
    if (after < 0 && town.roads.length) after = S.nextId;
  }
  // straight: every tile of every road it laid is road, along one row or one column
  const straight = town.roads.filter(([x0, y0, x1, y1]) => (x0 === x1 || y0 === y1) && Array.from({ length: Math.abs(x1 - x0) + Math.abs(y1 - y0) + 1 }, (_, k) => (y0 + (y1 > y0 ? k : 0)) * W.w + x0 + (x1 > x0 ? k : 0)).every(i => W.road[i] >= 2)).length;
  // built along them: a door onto a road (its front tile on one or beside one), or looking straight down at most `near_tiles` to one
  const onRoad = (b: (typeof S.buildings)[number]) => { const d = door(b), f = (d.y + 1) * W.w + d.x; if (W.road[f - 1] >= 2 || W.road[f + 1] >= 2) return true; for (let k = 1; k <= near + 1 && d.y + k < W.h; k++) { const i = (d.y + k) * W.w + d.x; if (W.road[i] >= 2) return true; if (W.bgrid[i] !== -1) return false; } return false; };
  const later = S.buildings.filter(b => after > 0 && b.id >= after && b.town === town.id && !content.blueprints[b.type].bridge);
  const st = S.stats, r = (v: number) => Math.round(v * 1000) / 1000;
  const roadPace = st.roadDeliveryTiles ? st.roadDeliverySeconds / st.roadDeliveryTiles : 0, pathPace = st.pathDeliveryTiles ? st.pathDeliverySeconds / st.pathDeliveryTiles : 0;
  return {
    state: S,
    metrics: {
      game_seconds: Math.round(S.t),
      villagers: villagers(S).length,
      fed_min: r(fedMin),
      roads_laid: town.roads.length,
      roads_straight: straight,
      road_tiles: st.roadTiles,
      stone_known: 'stone_road' in town.knows ? 1 : 0,
      stone_tiles: S.world.stone,
      road_through_centre: roadByCentre(S, town) ? 1 : 0,
      first_road_at: Math.round(town.roads[0]?.[4] ?? -1),
      buildings_cleared: st.roadCut,
      people_moved: st.roadMoved,
      homeless: st.demolitionDepartures,
      road_deliveries: st.roadDeliveries,
      path_deliveries: st.pathDeliveries,
      road_pace: r(roadPace),
      path_pace: r(pathPace),
      road_pace_ratio: pathPace ? r(roadPace / pathPace) : 1,
      built_along_roads: later.length ? r(later.filter(onRoad).length / later.length) : 0,
      departures: st.departures,
    },
  };
};

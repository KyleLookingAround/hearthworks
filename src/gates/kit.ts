/** Helpers for gate scenarios: scripted building, tracked runs and the standard metrics. Pure; no Node APIs. */
import { createState, type WorldOptions, ctr, findSpot, placeBuilding, runFor, treeSpot, villagers, bp, type Building, type Content, type State } from '../sim/index.ts';

export { findSpot, treeSpot };

export type Metrics = Record<string, number>;
/** Gate parameters: numbers, or words such as the map type and size a gate runs on. */
export interface GateParams { seed: number; seconds: number; [k: string]: number | string }

/** The world a gate's `map` and `size` parameters name; the standard map when they are absent. */
export const worldOf = (p: GateParams) => ({ map: typeof p.map === 'string' ? p.map : undefined, size: typeof p.size === 'string' ? p.size : undefined });
export interface ScenarioResult { state: State; metrics: Metrics }
export type Scenario = (content: Content, params: GateParams) => ScenarioResult;

export const start = (content: Content, seed: number, opts: WorldOptions = {}) => createState(content, seed, opts);
export const storeOf = (S: State) => S.buildings.find(b => bp(S, b).storage)!;
export const centre = (S: State) => ctr(storeOf(S));

export function build(S: State, type: string, near: { x: number; y: number }, maxR = 14): Building {
  const spot = type === 'forester' ? treeSpot(S, type, near) : findSpot(S, type, near, maxR);
  if (!spot) throw new Error(`no room for ${type} near ${near.x},${near.y}`);
  return placeBuilding(S, type, spot.x, spot.y, false)!;
}

/** Run, tracking the lowest mood and the lowest share fed seen after `warmup` seconds. */
export function runTracked(S: State, seconds: number, warmup = 0, every?: (S: State) => void): { minMood: number; minFed: number } {
  let minMood = 1, minFed = 1, last = Math.floor(S.t);
  const until = S.t + warmup;
  runFor(S, seconds, s => {
    if (s.t >= until) { minMood = Math.min(minMood, s.mood); minFed = Math.min(minFed, s.fed); }
    if (every && Math.floor(s.t) !== last) { last = Math.floor(s.t); every(s); }
  });
  return { minMood, minFed };
}

export function standardMetrics(S: State, extra: Metrics = {}): Metrics {
  const d = S.stats.deliveries, total = d.villager + d.bot;
  return {
    game_seconds: Math.round(S.t),
    villagers: villagers(S).length,
    peak_villagers: S.stats.peakVillagers,
    mood_end: round(S.mood),
    fed_end: round(S.fed),
    arrivals: S.stats.arrivals,
    departures: S.stats.departures,
    logs_made: S.stats.made.logs || 0,
    planks_made: S.stats.made.planks || 0,
    wheat_made: S.stats.made.wheat || 0,
    bread_made: S.stats.made.bread || 0,
    deliveries_villager: d.villager,
    deliveries_bot: d.bot,
    bot_share: total ? round(d.bot / total) : 0,
    sites_unfinished: S.buildings.filter(b => b.site).length,
    path_searches: S.world.work.paths,
    path_fails: S.world.work.pathFails,
    path_nodes: S.world.work.pathNodes,
    job_pairs: S.world.work.jobPairs,
    planner_spots: S.world.work.plannerSpots,
    ...extra,
  };
}

export const round = (v: number) => Math.round(v * 1000) / 1000;

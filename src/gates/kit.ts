/** Helpers for gate scenarios: scripted building, tracked runs and the standard metrics. Pure; no Node APIs. */
import { createState, type WorldOptions, ctr, findSpot, placeBuilding, runFor, treeSpot, villagers, bp, type Building, type Content, type State } from '../sim/index.ts';

export { findSpot, treeSpot };

export type Metrics = Record<string, number>;
export interface GateParams { seed: number; seconds: number; [k: string]: number }
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

/** Run, tracking the lowest mood seen after `warmup` seconds. */
export function runTracked(S: State, seconds: number, warmup = 0, every?: (S: State) => void): { minMood: number } {
  let minMood = 1, last = Math.floor(S.t);
  const until = S.t + warmup;
  runFor(S, seconds, s => {
    if (s.t >= until) minMood = Math.min(minMood, s.mood);
    if (every && Math.floor(s.t) !== last) { last = Math.floor(s.t); every(s); }
  });
  return { minMood };
}

export function standardMetrics(S: State, extra: Metrics = {}): Metrics {
  const d = S.stats.deliveries, total = d.villager + d.bot;
  return {
    game_seconds: Math.round(S.t),
    villagers: villagers(S).length,
    peak_villagers: S.stats.peakVillagers,
    mood_end: round(S.mood),
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
    ...extra,
  };
}

export const round = (v: number) => Math.round(v * 1000) / 1000;

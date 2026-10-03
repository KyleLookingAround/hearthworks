/** Helpers for gate scenarios: scripted building, tracked runs and the standard metrics. Pure; no Node APIs. */
import { canPlace, createState, ctr, placeBuilding, runFor, villagers, bp, type Building, type Content, type State } from '../sim/index.ts';

export type Metrics = Record<string, number>;
export interface GateParams { seed: number; seconds: number; [k: string]: number }
export interface ScenarioResult { state: State; metrics: Metrics }
export type Scenario = (content: Content, params: GateParams) => ScenarioResult;

export const start = (content: Content, seed: number) => createState(content, seed);
export const storeOf = (S: State) => S.buildings.find(b => bp(S, b).storage)!;
export const centre = (S: State) => ctr(storeOf(S));

/** First free spot for `type`, spiralling out from `near`. */
export function findSpot(S: State, type: string, near: { x: number; y: number }, maxR = 14): { x: number; y: number } | null {
  const B = S.content.blueprints[type];
  const ox = Math.round(near.x - B.w / 2), oy = Math.round(near.y - B.h / 2);
  for (let r = 0; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = ox + dx, y = oy + dy;
    // keep a one-tile gap so buildings never wall each other in
    if (canPlace(S, type, x, y) && clear(S, x - 1, y - 1, B.w + 2, B.h + 2)) return { x, y };
  }
  return null;
}

/** No buildings or roads in the rectangle (roads are kept, not built over). */
function clear(S: State, x: number, y: number, w: number, h: number): boolean {
  const W = S.world;
  for (let j = y; j < y + h; j++) for (let k = x; k < x + w; k++) {
    if (k < 0 || j < 0 || k >= W.w || j >= W.h) return false;
    const i = j * W.w + k;
    if (W.bgrid[i] !== -1 || W.road[i]) return false;
  }
  return true;
}

/** Spot within `maxDist` of `near` with the most grown trees in harvest range. */
export function treeSpot(S: State, type: string, near: { x: number; y: number }, maxDist = 12): { x: number; y: number } | null {
  const B = S.content.blueprints[type], r = B.harvest?.radius ?? 5, W = S.world;
  let best: { x: number; y: number } | null = null, bc = -1;
  for (let y = 1; y < W.h - B.h; y++) for (let x = 1; x < W.w - B.w; x++) {
    if (Math.hypot(x - near.x, y - near.y) > maxDist) continue;
    if (!canPlace(S, type, x, y) || !clear(S, x - 1, y - 1, B.w + 2, B.h + 2)) continue;
    let c = 0;
    for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
      const yy = y + j, xx = x + k;
      if (yy >= 0 && yy < W.h && xx >= 0 && xx < W.w && W.tree[yy * W.w + xx] === 2) c++;
    }
    if (c > bc) { bc = c; best = { x, y }; }
  }
  return best;
}

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

/** Choosing: the blueprint that answers a shortage best, and the inputs it needs planned first. */
import { foodChainOf, plentyInStore } from '../production.ts';
import type { BlueprintDef, State } from '../types.ts';
import { goodName, article } from './text.ts';
import { clamp01, T, known, basics, homeFor } from './core.ts';
import { type Shortage, type Look, importFrom } from './sense.ts';

export interface Choice { B: BlueprintDef; sev: number; why: string; wait?: string; key?: string }
/** Propose: the best blueprint for a shortage, following a recipe's inputs when they would leave it idle. */
export function propose(S: State, L: Look, sh: Shortage): Choice | null {
  const P = T(S);
  const relief = (B: BlueprintDef): number => {
    if (sh.homes) return B.homes && B === homeFor(S, L.town) ? clamp01(B.homes / Math.max(1, P.growthBeds - L.freeBeds)) : 0;
    if (sh.hauling) return B.couriers && L.uncovered >= P.minSeverity ? L.uncovered : 0;
    if (sh.crossing) return B.shore && !L.hasDock ? 1 : 0;
    if (sh.detours) return B.bridge ? 1 : 0;
    if (sh.carts) return B.carts ? 1 : 0;
    if (sh.oxen) return B.oxen ? 1 : 0;
    if (sh.rite) return B.rite === L.town.custom ? 1 : 0;
    if (sh.learn) return B.learning === sh.learn ? 1 : 0;
    if (sh.hall) return B.hall ? 1 : 0;
    if (sh.mill) return B.id === sh.mill ? 1 : 0;
    if (sh.ships) return B.shipyard ? 1 : 0;
    if (sh.guard) return B.guards?.hazard === sh.guard ? 1 : 0;
    if (sh.clean) return B.sanitation ? 1 : 0;
    if (sh.store) return B.storage && (!B.keeps || B.keeps.includes('wheat')) ? clamp01((B.capacity || T(S).openStoreCapacity) / Math.max(1, L.storeNeed - L.storeRoom)) : 0;
    const add = B.seconds && B.output[sh.good!] ? B.output[sh.good!] / B.seconds : 0;
    const gap = Math.max(1e-6, (L.demand[sh.good!] || 0) - (L.supply[sh.good!] || 0));
    return clamp01(add / gap);
  };
  let best: BlueprintDef | null = null, bs = -Infinity;
  for (const B of known(S, L.town)) {
    const r = relief(B);
    if (r <= 0) continue;
    const cost = Object.values(B.cost).reduce((s, n) => s + n, 0);
    const score = sh.sev * r - P.costWeight * cost;
    if (score > bs) { bs = score; best = B; }
  }
  if (!best) return null;
  return { ...follow(S, L, { B: best, sev: sh.sev, why: sh.why }, 0), key: sh.key };
}

/** If the chosen producer would starve for an input, plan that input's producer first. */
export function follow(S: State, L: Look, c: Choice, depth: number): Choice {
  if (depth > 3) return c;
  // food does not wait on newcomers who are not coming: while the settlement goes hungry or short of food,
  // a workplace in the food chain is built, and a hand moves to it from carrying or from outside the chain
  // (and so are the other basics, building materials and firewood: nothing else can be built without them)
  const outs = Object.keys(c.B.output), chain = foodChainOf(S), basic = basics(S);
  const urgent = !L.coming && L.movable && (outs.some(g => chain.has(g)) ? L.foodShort || L.town.fed < 1 : outs.some(g => basic.has(g)));
  if (c.B.workers && L.spareHands < c.B.workers && !urgent) {
    // nobody free to work it: newcomers will come if there are beds, otherwise build homes
    if (L.freeBeds > 0) return { ...c, wait: L.coming ? `Waiting for newcomers to work ${article(c.B.name)} ${c.B.name}: ${c.why}` : `No hands free for ${article(c.B.name)} ${c.B.name}, and no newcomers coming: ${c.why}` };
    const home = homeFor(S, L.town, true);
    if (home) return { B: home, sev: c.sev, why: `${c.why}, and a new ${c.B.name.toLowerCase()} would need a worker` };
  }
  for (const i in c.B.input) {
    const spare = (L.supply[i] || 0) - (L.demand[i] || 0);
    if (spare >= (c.B.input[i] / c.B.seconds) * T(S).inputCover || plentyInStore(S, L.town, i, L.demand[i] || 0)) continue;
    // an input it trades for, coming in but short: another user of it waits until more comes
    const from = (L.town.trade.imports[i] || 0) > 0 ? importFrom(S, L.town, i, (L.demand[i] || 0) + c.B.input[i] / c.B.seconds) : null;
    if (from) return { ...c, wait: `Waiting for more ${goodName(S, i)} from ${from.name} for ${article(c.B.name)} ${c.B.name}: ${c.why}` };
    const maker = known(S, L.town).find(B => B.seconds && B.output[i]);
    // a maker it has just found no room for doesn't hold this one back: build with the stock there is
    const noRoom = L.town.planner.noRoom[maker?.id ?? ''];
    if (!maker || maker === c.B || (noRoom !== undefined && S.t - noRoom < T(S).noRoomRetrySeconds)) continue;
    const users = c.B.name.toLowerCase();
    return follow(S, L, { B: maker, sev: c.sev, why: `${c.why}, and a new ${users} would need ${goodName(S, i)}` }, depth + 1);
  }
  return c;
}

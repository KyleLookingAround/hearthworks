/** Choosing: the blueprint that answers a shortage best, and the inputs it needs planned first. */
import { foodChainOf, plentyInStore } from '../production.ts';
import { lacking, spareFrom } from '../trade.ts';
import { wantsBoat } from '../ships.ts';
import type { BlueprintDef, ItemId, State, Verdict } from '../types.ts';
import { goodName, article } from './text.ts';
import { clamp01, T, known, basics, homeFor } from './core.ts';
import { type Shortage, type Look, importFrom } from './sense.ts';

export interface Choice { B: BlueprintDef; sev: number; why: string; /** proposed in place of a better one it lately found no room for */ instead?: boolean; wait?: string; /** what it waits for: hands, an input, a trade, room for an input's maker */ hold?: Verdict; key?: string; /** it waits for this input, which the workplaces using it already stand short of */ lacks?: ItemId }
/**
 * Propose: the best blueprint for a shortage, following a recipe's inputs when they would leave it idle. One it lately
 * found no room for (`roomless`) gives way to the next best that answers the need (a warehouse where a yard has no
 * room); with none, it is proposed still, and waits for room.
 */
export function propose(S: State, L: Look, sh: Shortage, roomless: (id: string) => boolean = () => false): Choice | null {
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
    // (the room each store need wants: full stores any store, the winter's grain one that keeps wheat)
    if (sh.store) return B.storage && (sh.key === 'stores_full' ? !B.keeps : !B.keeps || B.keeps.includes('wheat')) ? clamp01((B.capacity || T(S).openStoreCapacity) / sh.store) : 0;
    if (sh.spoils) {
      // the share of what spoils it keeps: a store that keeps it, or a workplace that turns it into food that keeps
      const goods = S.content.goods, saves = (g: ItemId) => B.storage ? !!B.keeps?.includes(g) : !!B.seconds && g in B.input && Object.keys(B.output).every(o => !goods[o]?.spoils);
      let all = 0, kept = 0;
      for (const g in sh.spoils) { all += sh.spoils[g]; if (saves(g)) kept += sh.spoils[g]; }
      return all > 0 ? kept / all : 0;
    }
    const add = B.seconds && B.output[sh.good!] ? B.output[sh.good!] / B.seconds : 0;
    const gap = Math.max(1e-6, (L.demand[sh.good!] || 0) - (L.supply[sh.good!] || 0));
    return clamp01(add / gap);
  };
  let best: BlueprintDef | null = null, bs = -Infinity, free: BlueprintDef | null = null, fs = -Infinity;
  for (const B of known(S, L.town)) {
    const r = relief(B);
    if (r <= 0) continue;
    const cost = Object.values(B.cost).reduce((s, n) => s + n, 0);
    const score = sh.sev * r - P.costWeight * cost;
    if (score > bs) { bs = score; best = B; }
    if (score > fs && !roomless(B.id)) { fs = score; free = B; }
  }
  const instead = !!free && free !== best;
  best = free ?? best;
  if (!best) return null;
  return { ...follow(S, L, { B: best, sev: sh.sev, why: sh.why }, 0), key: sh.key, ...(instead ? { instead } : {}) };
}

/** If the chosen producer would starve for an input, plan that input's producer first. */
export function follow(S: State, L: Look, c: Choice, depth: number): Choice {
  if (depth > 3) return c;
  // food does not wait on newcomers who are not coming: while the settlement goes hungry or short of food,
  // a workplace in the food chain is built, and a hand moves to it from carrying or from outside the chain
  // (and so are the other basics, building materials and firewood: nothing else can be built without them)
  const outs = Object.keys(c.B.output), chain = foodChainOf(S), basic = basics(S);
  // (and a shipyard while its people wait ashore for a boat: a daughter of thirty with two boats once refused sixty trips)
  const urgent = !L.coming && L.movable && (outs.some(g => chain.has(g)) ? L.foodShort || L.town.fed < 1 : outs.some(g => basic.has(g)) || (!!c.B.shipyard && wantsBoat(S, L.town)));
  if (c.B.workers && L.spareHands < c.B.workers && !urgent) {
    // nobody free to work it: newcomers will come if there are beds, otherwise build homes
    if (L.freeBeds > 0) return { ...c, hold: 'hands', wait: L.coming ? `Waiting for newcomers to work ${article(c.B.name)} ${c.B.name}: ${c.why}` : `No hands free for ${article(c.B.name)} ${c.B.name}, and no newcomers coming: ${c.why}` };
    const home = homeFor(S, L.town, true);
    if (home) return { B: home, sev: c.sev, why: `${c.why}, and a new ${c.B.name.toLowerCase()} would need a worker` };
  }
  for (const i in c.B.input) {
    const spare = (L.supply[i] || 0) - (L.demand[i] || 0);
    if (spare >= (c.B.input[i] / c.B.seconds) * T(S).inputCover || plentyInStore(S, L.town, i, L.demand[i] || 0)) continue;
    // an input it trades for, coming in but short: another user of it waits until more comes
    const from = (L.town.trade.imports[i] || 0) > 0 ? importFrom(S, L.town, i, (L.demand[i] || 0) + c.B.input[i] / c.B.seconds) : null;
    if (from) return { ...c, hold: 'trading', wait: `Waiting for more ${goodName(S, i)} from ${from.name} for ${article(c.B.name)} ${c.B.name}: ${c.why}` };
    const maker = known(S, L.town).find(B => B.seconds && B.output[i]);
    // a maker it has just found no room for doesn't hold this one back: build with the stock there is
    const noRoom = L.town.planner.noRoom[maker?.id ?? ''];
    if (!maker || maker === c.B || (noRoom !== undefined && S.t - noRoom < T(S).noRoomRetrySeconds)) {
      // but with workplaces already short of it (made and imported below what they use, and one standing without it),
      // another would only stand beside them needing it: it waits, and the
      // porters go for the input (a town with no room for a mine once built eight smithies that stood needing iron ore)
      if ((L.demand[i] || 0) > 0 && (L.supply[i] || 0) < L.demand[i] && lacking(S, L.town).has(i)) {
        const host = spareFrom(S, L.town, i), name = `${article(c.B.name)} ${c.B.name}`;
        // (with no room for the input's maker, its land is full for what it needs: settling reads "No room")
        const wait = host ? `Trading with ${host.name} for ${goodName(S, i)} before ${name}` : maker && maker !== c.B ? `No room for ${article(maker.name)} ${maker.name}, and no ${goodName(S, i)} to spare for ${name}` : `No ${goodName(S, i)} to spare for ${name}`;
        return { ...c, lacks: i, hold: host ? 'trading' : maker && maker !== c.B ? 'room' : 'input', wait: `${wait}: ${c.why}` };
      }
      continue;
    }
    const users = c.B.name.toLowerCase();
    return follow(S, L, { B: maker, sev: c.sev, why: `${c.why}, and a new ${users} would need ${goodName(S, i)}` }, depth + 1);
  }
  return c;
}

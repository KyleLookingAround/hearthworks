/**
 * What each settlement knows how to build, and how that changes. A settlement's
 * knowledge is a small OKF-style bundle: one record per blueprint with who came up
 * with it, which settlements have verified it in use, and when it was last used.
 *
 *   invent    struggling with a need a blueprint answers, a village may think of it
 *   verify    a building that runs well for `verify_seconds` proves its blueprint here
 *   learn     building something the village doesn't know (the player's hand) teaches it
 *   share     a visitor tells a neighbour what home has learned, with its verifications, and brings news back
 *   forget    discovered knowledge with nothing built from it for `forget_after_seconds` is lost
 *
 * Invention draws from S.krng, never S.rng, so knowledge cannot shift the rest of the sim.
 */
import { rand } from './rng.ts';
import { goToBuilding } from './agents.ts';
import { cancelTask } from './logistics.ts';
import { emit, villagers } from './world.ts';
import type { Agent, Content, Knowledge, State, Town } from './types.ts';

const K = (S: State) => S.content.tuning.knowledge;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const name = (S: State, id: string) => S.content.blueprints[id]?.name ?? id;

/** Everything without a `discovery` block: what every settlement starts out knowing. */
export function foundersKnowledge(content: Content): Record<string, Knowledge> {
  const out: Record<string, Knowledge> = {};
  for (const B of Object.values(content.blueprints)) {
    if (B.discovery) continue;
    out[B.id] = { by: 'founders', at: 0, verified: [{ by: 'founders', at: 0 }], from: null, learned: 0, used: 0 };
  }
  return out;
}

export const knows = (town: Town, id: string) => id in town.knows;

/** How hard a settlement is struggling with a need, 0 to 1. */
export function pressure(S: State, town: Town, need: string): number {
  if (need === 'hauling') { const t = K(S).haulTarget; return clamp01((town.haul - t) / (1 - t)); }
  return 0;
}

export const NEED_TEXT: Record<string, string> = { hauling: 'carriers are run off their feet' };

/** Has this settlement proven the blueprint in use itself? Founders' knowledge counts. */
const provenHere = (town: Town, k: Knowledge) => k.verified.some(v => v.by === town.name || v.by === 'founders');

/** Everything beyond founding knowledge, proven or not: what its visitors talk about. Verifications travel with it. */
function shareable(town: Town): Record<string, Knowledge> {
  const out: Record<string, Knowledge> = {};
  for (const id in town.knows) {
    const k = town.knows[id];
    if (k.by !== 'founders') out[id] = { ...k, verified: k.verified.map(v => ({ ...v })) };
  }
  return out;
}

/** Learn what a visitor brought, keeping the original inventor and every verification. */
function teach(S: State, town: Town, recs: Record<string, Knowledge>, from: string) {
  for (const id in recs) {
    const r = recs[id], mine = town.knows[id];
    if (mine) {
      for (const v of r.verified) if (!mine.verified.some(m => m.by === v.by)) mine.verified.push({ ...v });
      continue;
    }
    town.knows[id] = { by: r.by, at: r.at, verified: r.verified.map(v => ({ ...v })), from, learned: S.t, used: S.t };
    S.stats.taught++;
    emit(S, 'good', `A visitor from ${from} taught ${town.name} the ${name(S, id)}`);
  }
}

/** Once a second: pressures, invention, verification, learning by hand, forgetting and visits. */
export function updateKnowledge(S: State, dt: number) {
  const P = K(S);
  for (const town of S.towns) {
    // hauling strain: share of carriers on deliveries someone asked for (not surplus runs to storage)
    const people = villagers(S).filter(a => a.home?.town === town.id && a.role === 'carrier' && a.state !== 'visit');
    const busy = people.length ? people.filter(a => a.task && !S.content.blueprints[a.task.dst.type].storage).length / people.length : 0;
    town.haul += (busy - town.haul) * Math.min(1, dt / P.haulSmoothingSeconds);

    for (const b of S.buildings) {
      if (b.town !== town.id) continue;
      let k = town.knows[b.type];
      if (!k) {
        if (b.site) continue;
        // built before the village knew how: the player's hand taught it
        k = town.knows[b.type] = { by: 'hand', at: S.t, verified: [], from: null, learned: S.t, used: S.t };
        emit(S, 'info', `${town.name} learned the ${name(S, b.type)} from the one you built`);
      }
      k.used = S.t;
      if (b.site || b.status.l !== 'ok') continue;
      b.used += dt;
      if (b.used >= P.verifySeconds && !k.verified.some(v => v.by === town.name)) {
        k.verified.push({ by: town.name, at: S.t });
        if (k.by !== 'founders') emit(S, 'good', `${town.name} has proven the ${name(S, b.type)} in use`);
      }
    }

    for (const B of Object.values(S.content.blueprints)) {
      if (!B.discovery || knows(town, B.id)) continue;
      if (pressure(S, town, B.discovery.need) < P.struggleSeverity) continue;
      if (rand(S.krng) >= dt / B.discovery.meanSeconds) continue;
      town.knows[B.id] = { by: town.name, at: S.t, verified: [], from: null, learned: S.t, used: S.t };
      S.stats.invented++;
      emit(S, 'good', `${town.name} came up with the ${B.name}: ${NEED_TEXT[B.discovery.need] ?? B.discovery.need}`);
    }

    if (town.planner.want && town.knows[town.planner.want]) town.knows[town.planner.want].used = S.t;
    for (const id of Object.keys(town.knows)) {
      const k = town.knows[id];
      if (k.by === 'founders' || S.t - k.used <= P.forgetAfterSeconds) continue;
      delete town.knows[id];
      S.stats.forgotten++;
      emit(S, 'bad', `${town.name} forgot how to build the ${name(S, id)}: nobody had built one in a long while`);
    }

    town.visitT += dt;
    if (town.visitT >= P.visitEverySeconds && S.towns.length > 1 && sendVisitor(S, town)) town.visitT = 0;
  }
}

/**
 * The nearest other settlement gets a visitor: a carrier with empty hands, never the last one.
 * One on its way to fetch something drops the job (the goods stay where they were).
 * Returns false to try again next second.
 */
function sendVisitor(S: State, town: Town): boolean {
  const home = S.bmap.get(town.store);
  if (!home) return false;
  let host: Town | null = null, hd = Infinity;
  for (const o of S.towns) {
    const s = S.bmap.get(o.store);
    if (o === town || !s) continue;
    const d = Math.hypot(s.x - home.x, s.y - home.y);
    if (d < hd) { hd = d; host = o; }
  }
  if (!host) return false;
  // small or already-visiting settlements keep their people at home
  const people = villagers(S).filter(a => a.home?.town === town.id);
  if (people.length < K(S).visitMinVillagers || people.some(a => a.visit?.from === town.id)) return false;
  const carriers = people.filter(a => a.role === 'carrier' && a.state !== 'visit');
  if (carriers.length < 2) return false;
  const a = carriers.find(c => !c.carry && (c.state === 'idle' || c.state === 'wander' || c.state === 'toSrc'));
  if (!a) return false;
  cancelTask(a);
  a.visit = { from: town.id, to: host.id, back: false, carry: shareable(town) };
  a.state = 'visit';
  if (!goToBuilding(S, a, S.bmap.get(host.store)!)) { a.visit = null; a.state = 'idle'; return false; }
  return true;
}

/** A visitor reached the end of a leg: trade knowledge at the host, or report home. */
export function arrive(S: State, a: Agent) {
  const v = a.visit;
  if (!v) { a.state = 'idle'; return; }
  const from = S.towns[v.from], to = S.towns[v.to];
  if (!v.back) {
    teach(S, to, v.carry, from.name);
    v.carry = shareable(to); v.back = true;
    const home = S.bmap.get(from.store);
    if (home && goToBuilding(S, a, home)) return;
  } else teach(S, from, v.carry, to.name);
  a.visit = null; a.state = 'idle';
}

/** Short provenance line for the player, e.g. "came up with here", "learned from Hearth". */
export function originText(town: Town, k: Knowledge): string {
  if (k.by === 'founders') return 'known since the founding';
  if (k.by === 'hand') return 'learned from the one you built';
  if (k.from) return `learned from ${k.from}${k.by !== k.from ? ` (first thought of in ${k.by})` : ''}`;
  return k.by === town.name ? 'thought of here' : `first thought of in ${k.by}`;
}

export const verifiedHere = (town: Town, k: Knowledge) => provenHere(town, k);

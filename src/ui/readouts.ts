/**
 * Readouts: what the interface says about one settlement and its buildings, worked out from state it only reads.
 * DOM-free, so the tests can check it. Nothing here changes the simulation: it calls only sim functions that read
 * (their caches are keyed on `S.t`, which the next tick moves on before it reads them).
 */
import { ageNeeded, bp, ideasNear, NEED_SHORT, NEED_TEXT, nextAge, scholarly, villagers, type BlueprintDef, type Building, type ItemId, type State, type Stock, type Town, type Verdict } from '../sim/index.ts';
import { enoughInStore } from '../sim/production.ts';
import { formOf } from '../sim/planner.ts';
import { offered } from '../sim/farms.ts';

/** Why a building shows a badge: the cause a player can act on. */
export type Cause = 'input' | 'full' | 'worker' | 'home' | 'trouble' | 'resting';

/**
 * Each cause: its name in the legend, the badge's colour and the colour of its glyph, and the glyph as an SVG path
 * in a 13-unit box centred on 0, so the canvas (`Path2D`) and the legend (inline SVG) draw the same mark.
 */
export const CAUSES: Record<Cause, { name: string; hint: string; color: string; ink: string; glyph: string }> = {
  input: { name: 'Needs an input', hint: 'waits for goods to work with', color: '#e2735e', ink: '#1b2326', glyph: 'M0 4.4L-3.8 0.2H-1.3V-4.2H1.3V0.2H3.8Z' },
  full: { name: 'Output full', hint: 'waits for a carrier to take its goods away', color: '#e8b04a', ink: '#1b2326', glyph: 'M0 -4.4L-3.8 -0.2H-1.3V4.2H1.3V-0.2H3.8Z' },
  worker: { name: 'No worker', hint: 'nobody free to work it', color: '#7fb0d8', ink: '#1b2326', glyph: 'M-1.9 -2.4a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0 -3.8 0ZM-3.6 4.2Q-3.6 0.4 0 0.4Q3.6 0.4 3.6 4.2Z' },
  home: { name: 'Home in want', hint: 'short of food or firewood', color: '#e89a8a', ink: '#1b2326', glyph: 'M-4.2 -1.2H4.2Q4.2 3.8 0 3.8Q-4.2 3.8 -4.2 -1.2ZM-1.6 -4.4H-0.4V-2.2H-1.6ZM0.6 -4.4H1.8V-2.2H0.6Z' },
  trouble: { name: 'Trouble', hint: 'fire, flood, sickness or no way in', color: '#b0413e', ink: '#ede6d6', glyph: 'M-1.2 -4.4H1.2L0.8 1.2H-0.8ZM-1.2 2.2H1.2V4.4H-1.2Z' },
  resting: { name: 'Resting', hint: 'enough in store: its worker went carrying', color: '#6b7a80', ink: '#ede6d6', glyph: 'M-2.8 -3.2H2.8V-1.9L-0.9 2H2.8V3.2H-2.8V1.9L0.9 -2H-2.8Z' },
};
/** The causes in the order the problems list shows them; resting last, as no problem. */
export const CAUSE_ORDER: Cause[] = ['trouble', 'home', 'input', 'worker', 'full', 'resting'];

const TROUBLE = /^(On fire|Flooded|Sickness in the house|No way in|Its worker is sick)/;

/**
 * The cause of a building's badge, or null when it has none. A workplace showing "No worker free" while its
 * settlement holds enough of what it makes is resting, not short of hands: nobody is sent to it.
 */
export function causeOf(S: State, b: Building): Cause | null {
  if (b.site || b.dead) return null;
  const t = b.status.t, l = b.status.l;
  if (t === 'Enough in store: resting' || t === 'The fleet has the boats it needs: resting') return 'resting';
  if (t === 'No worker free') return enoughInStore(S, b) ? 'resting' : 'worker';
  if (l !== 'bad' && l !== 'warn') return null;
  if (TROUBLE.test(t)) return 'trouble';
  if (t.startsWith('Needs ') || t === 'No grown trees nearby') return 'input';
  if (t.startsWith('Output full')) return 'full';
  if (bp(S, b).homes) return 'home';
  return 'trouble';
}

/** The words a building's status should say: "No worker free" on a workplace resting with enough in store says so. */
export function statusText(S: State, b: Building): { t: string; l: string } {
  if (b.status.t === 'No worker free' && !b.site && enoughInStore(S, b)) return { t: 'Resting: enough in store', l: 'wait' };
  return b.status;
}

/** Goods in the storage yards of one settlement, or of every settlement (`town` null). */
export function storesOf(S: State, town: number | null): Stock {
  const out: Stock = {};
  for (const b of S.buildings) {
    if (b.site || b.dead || (town !== null && b.town !== town) || !bp(S, b).storage) continue;
    for (const g in b.inv) out[g] = (out[g] || 0) + b.inv[g];
  }
  return out;
}

export interface TownView {
  town: Town;
  form: string;
  age: string;
  pop: number;
  beds: number;
  free: number;
  children: number;
  workers: number;
  carriers: number;
  /** Carriers standing with nothing to carry. */
  idle: number;
  bots: number;
  fed: number;
  mood: number;
  /** Its open construction sites, with how far each has come (0 to 1). */
  sites: { b: Building; name: string; done: number }[];
  /** Goods its planner was short of at its last look, worst first, 0 to 1. */
  wants: [ItemId, number][];
  /** The blueprint its planner works towards, if any. */
  towards: string | null;
  status: string;
  /** The top of its planner's wish list, each in a few words with its verdict. */
  wishes: WishView[];
  /** Its three biggest trades each way, in whole loads. */
  sent: [ItemId, number][];
  got: [ItemId, number][];
  /** Its buildings with a badge, by cause. */
  problems: Map<Cause, Building[]>;
}

/** Everything the settlement card shows about one settlement. */
export function townView(S: State, t: Town): TownView {
  const C = S.content, P = C.tuning.production;
  const people = villagers(S).filter(a => a.home?.town === t.id);
  let beds = 0, free = 0;
  const sites: TownView['sites'] = [], problems = new Map<Cause, Building[]>();
  for (const b of S.buildings) {
    if (b.town !== t.id || b.dead) continue;
    const B = bp(S, b);
    if (b.site) {
      // a site's progress: half for the goods brought, half for the building work once they are all there
      const total = Object.values(B.cost).reduce((s, n) => s + n, 0), have = Object.keys(B.cost).reduce((s, k) => s + Math.min(B.cost[k], b.inv[k] || 0), 0);
      const done = have >= total ? 0.5 + 0.5 * Math.min(1, b.build / P.buildSeconds) : 0.5 * (total ? have / total : 1);
      sites.push({ b, name: B.name, done });
      continue;
    }
    if (B.homes) { beds += B.homes; free += Math.max(0, B.homes - b.residents.length); }
    const c = causeOf(S, b);
    if (c) { const l = problems.get(c); if (l) l.push(b); else problems.set(c, [b]); }
  }
  const top = (r: Stock): [ItemId, number][] => Object.entries(r).filter(([, n]) => n >= 1).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g, n]) => [g, Math.round(n)]);
  return {
    town: t,
    form: formOf(S, t),
    age: C.eras[t.age]?.name ?? '',
    pop: people.length,
    beds, free,
    children: people.filter(a => a.role === 'child').length,
    workers: people.filter(a => a.role === 'worker').length,
    carriers: people.filter(a => a.role === 'carrier').length,
    idle: people.filter(a => a.role === 'carrier' && !a.task && (a.state === 'idle' || a.state === 'wander')).length,
    bots: S.agents.filter(a => a.kind === 'bot' && a.depot?.town === t.id).length,
    fed: t.fed, mood: t.mood,
    sites: sites.sort((a, b) => b.done - a.done),
    wants: Object.entries(t.planner.wants).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3),
    towards: t.planner.want ? C.blueprints[t.planner.want]?.name ?? t.planner.want : null,
    status: t.planner.on ? t.planner.status : 'Plans are off: you place the buildings',
    wishes: t.planner.on ? wishesOf(S, t) : [],
    sent: top(t.trade.exported), got: top(t.trade.imported),
    problems,
  };
}

/** One wish of a planner's list as the player reads it: "Bakery: saving planks, 6 of 10", its verdict, and the planner's whole line. */
export interface WishView { name: string; verdict: Verdict; short: string; text: string }

/** What each verdict says, in a few words. */
const VERDICT: Record<Verdict, string> = {
  going: 'going ahead', thinking: 'thinking about it', saving: 'saving', hands: 'waiting for hands', room: 'no room',
  trading: 'trading for it', input: 'waiting for an input', queued: 'waits its turn', none: 'nothing known would help', below: 'not pressing',
};

/**
 * The top `n` wishes of a settlement's planner, as its last look left them (those below its threshold left out):
 * "Bakery: saving planks, 6 of 10"; "Granary: no room".
 */
export function wishesOf(S: State, t: Town, n = 4): WishView[] {
  const C = S.content, gn = (g: string) => (C.goods[g]?.name ?? g).toLowerCase();
  return t.planner.wishes.filter(w => w.verdict !== 'below').slice(0, n).map(w => {
    const B = w.type ? C.blueprints[w.type] : undefined, of = B?.name ?? '';
    // the works by what they are; a need by the building it calls for, else by its good, else by why it is wished for
    const name = { road: 'Road', belt: 'Conveyor', district: 'New district', replan: `${of} (renewing a block)`, move_out: `${of} (moving out)` }[w.key]
      ?? (B ? `${B.name}${w.key === 'winter_store' ? ' for the winter' : ''}` : C.goods[w.key] ? C.goods[w.key].name : w.why[0].toUpperCase() + w.why.slice(1));
    let short = VERDICT[w.verdict];
    if (w.verdict === 'saving' && w.good) short = `saving ${gn(w.good)}${w.need ? `, ${w.have ?? 0} of ${w.need}` : ''}`;
    else if (w.verdict === 'input' && w.good) short = `waiting for ${gn(w.good)}`;
    else if (w.verdict === 'trading' && w.good) short = `trading for ${gn(w.good)}`;
    return { name, verdict: w.verdict, short, text: w.text };
  });
}

/** Problems a player should look at in one settlement: every badge but resting. */
export const problemCount = (v: TownView) => [...v.problems].reduce((n, [c, l]) => n + (c === 'resting' ? 0 : l.length), 0);

/**
 * What a settlement that does not know a blueprint waits on, in a sentence; null when it knows it.
 * `short` gives a few words for the build bar.
 */
export function waitsOn(S: State, t: Town, B: BlueprintDef, short = false): string | null {
  if (B.id in t.knows) return null;
  const C = S.content, name = (id: string) => C.blueprints[id]?.name ?? id;
  if (!B.discovery) return short ? 'forgotten' : `${t.name} has forgotten the ${B.name}: nobody built one for too long. A visitor or a library may bring it back.`;
  const age = ageNeeded(S, B.id), missing = B.discovery.after.filter(id => !(id in t.knows));
  const scholars = B.discovery.university ? scholarly(S, t).find(x => x.B.id === B.id) : undefined;
  const era = C.eras[age]?.name ?? '';
  if (short) {
    if (missing.length) return `after ${name(missing[0])}`;
    if (t.age < age) return `Age of ${era}`;
    if (scholars?.waits === 'university') return 'needs scholars';
    return 'not thought of';
  }
  const parts = [`${t.name} has not thought of the ${B.name} yet.`];
  if (missing.length) parts.push(`It must know the ${missing.map(name).join(' and ')} first.`);
  if (t.age < age) parts.push(`It comes only in the Age of ${era}.`);
  if (B.discovery.university) parts.push(scholars?.waits === 'university' ? `Only scholars think of it, and ${t.name} has no university at work.` : 'Only scholars think of it, at a university.');
  parts.push(`The idea comes when ${NEED_TEXT[B.discovery.need] ?? B.discovery.need}.`);
  return parts.join(' ');
}

/** A share as whole tens of per cent, rounded down (a hair under 70% from floating point still says 70). */
export const tens = (share: number) => Math.floor(share * 10 + 1e-9) * 10;

/** One idea a settlement could think of next: its name, its need in a few words, how far of the way (0 to 1), and a line saying so (to the ten per cent, so a panel is not redrawn every second). */
export interface IdeaView { id: string; name: string; need: string; share: number; text: string }

/**
 * How near a settlement is to each idea it could think of next, nearest first ("Courier Depot: carriers strained, 70%
 * of the way"). Once the strain reaches the point it takes the idea up, it is thinking on it: the idea comes at random,
 * on average within the minutes shown.
 */
export function ideasOf(S: State, t: Town): IdeaView[] {
  return ideasNear(S, t).map(x => {
    const need = NEED_SHORT[x.need] ?? x.need, pct = tens(x.share);
    const text = x.share >= 1 ? `${x.B.name}: ${need}, thinking on it (about ${Math.max(1, Math.round(x.meanSeconds / 60))} min on average)` : `${x.B.name}: ${need}, ${pct}% of the way`;
    return { id: x.B.id, name: x.B.name, need, share: x.share, text };
  });
}

/** What a settlement still lacks for its next age, in a sentence; null in the last age. */
export function nextAgeText(S: State, t: Town): string | null {
  const n = nextAge(S, t);
  if (!n) return null;
  const name = (id: string) => S.content.blueprints[id]?.name ?? id, list = (xs: string[], and: string) => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} ${and} ${xs[xs.length - 1]}` : xs[0] ?? '';
  const left = n.E.discoveries.filter(id => !n.proven.includes(id)).map(id => `the ${name(id)}`);
  const parts: string[] = [];
  if (n.proven.length < n.needed) parts.push(n.needed === n.E.discoveries.length ? `prove ${list(left, 'and')} in use` : `prove ${n.needed - n.proven.length} more of ${list(left, 'or')} in use`);
  if (n.works < n.worksNeeded) parts.push(n.worksNeeded === 1 ? `have one standing` : `have ${n.worksNeeded} standing (${n.works} now)`);
  return parts.length ? `The Age of ${n.E.name}: ${parts.join(', and ')}.` : `The Age of ${n.E.name}: ready, on its next second.`;
}

/** Is the blueprint one this world offers at all (farms that grow, ships)? */
export const inWorld = (S: State, B: BlueprintDef) => offered(S, B);

// where the player may place what for want of knowledge: the sim's own check, made by the place command
export { landOf, knowledgeProblem } from '../sim/commands.ts';

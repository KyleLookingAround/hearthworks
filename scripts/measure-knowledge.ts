/**
 * Measure default new games for knowledge and the advisor (stage 2.4 of decision 0006), as scripts/fingerprint.ts builds them.
 *   node scripts/measure-knowledge.ts <seed> <draw> [seconds=3600]
 * Draw k takes k numbers from each of S.rng, S.krng, S.prng and S.hrng right after createState: another throw of the world's luck.
 * Prints one JSON line: villagers, settlements, departures, trades, fed_min, ages per settlement, inventions, advice counts.
 */
import { loadContent } from '../src/content/node.ts';
import { createHash } from 'node:crypto';
import { createState, runFor, saveGame, villagers, type State } from '../src/sim/index.ts';
import * as steward from '../src/sim/steward.ts';
import { rand } from '../src/sim/rng.ts';

const seed = Number(process.argv[2]), draw = Number(process.argv[3] ?? 0), seconds = Number(process.argv[4] ?? 3600);
const content = loadContent();
const T = content.tuning.map;
const map = Object.values(content.maps).sort((a, b) => a.order - b.order)[0]?.id ?? T.standardType;
const size = T.sizes[T.gameSize] ? T.gameSize : T.standardSize;
const S: State = createState(content, seed, { planner: true, seasons: true, trade: true, people: true, carts: true, settlers: true, charts: true, ships: true, hardship: true, plannedRoads: true, farms: true, settlements: T.sizes[size].settlements, map, size });
for (let k = 0; k < draw; k++) { rand(S.rng); rand(S.krng); rand((S as any).prng); rand((S as any).hrng); }

const KINDS: [string, RegExp][] = [
  ['hungry', /is going hungry/], ['scholars-answer', /only scholars think of/], ['later-age', /comes to a settlement of the Age/], ['encourage-answer', /encourage them to think of/],
  ['scholars', /^Scholars would think/], ['zone', /paint a zone|^.* has no (room|place)/], ['raiders', /^Raiders/], ['winter-store', /store for the winter/], ['hungry-stay', /may not leave/],
  ['cart-shed', /encourage the Cart Shed/], ['ox-barn', /encourage the Ox Barn/], ['oxen-wheat', /oxen of/], ['long-hauls-foot', /long hauls go on foot/], ['diet', /eats nothing but bread/],
  ['noise', /sawmill's noise/], ['packed', /homes stand packed/], ['renewing', /^Renewing/], ['latest', /^Latest/],
];
const kind = (text: string) => KINDS.find(([, r]) => r.test(text))?.[0] ?? 'other:' + text.slice(0, 40);
const shown: Record<string, number> = {}, given: Record<string, number> = {}, early: Record<string, number> = {};
const prev = new Map<number, Set<string>>();
const ages = new Map<number, { name: string; first: Record<number, number>; fell: number; final: number; pop?: number; form?: string }>();
let minFed = 1;
let last = -1;
// tips as the advisor gives them: the new advisor keeps them on the town (`t.advice`), the old one is read every 10 seconds
const tipsOf = (t: any): string[] => Array.isArray(t.advice) ? t.advice.map((a: any) => a.text) : (steward as any).advise(S, t);
runFor(S, seconds, s => {
  const sec = Math.floor(s.t);
  if (sec === last) return;
  last = sec;
  if (s.t >= 60) minFed = Math.min(minFed, s.fed);
  for (const t of s.towns) {
    let r = ages.get(t.id);
    if (!r) { r = { name: t.name, first: {}, fell: 0, final: t.age }; ages.set(t.id, r); }
    if (t.age > r.final) for (let a = r.final + 1; a <= t.age; a++) r.first[a] ??= sec;
    if (t.age < r.final) r.fell++;
    r.final = t.age;
    if (t.age === 3 && r.pop === undefined) { r.pop = villagers(s).filter(a => a.home?.town === t.id).length; r.form = t.form; }
  }
  if (sec % 10 !== 0 || process.env.NOADVICE) return;
  for (const t of s.towns) {
    const now = new Set(tipsOf(t).map(kind)), was = prev.get(t.id) ?? new Set();
    for (const k of now) { shown[k] = (shown[k] || 0) + 1; if (!was.has(k)) { given[k] = (given[k] || 0) + 1; if (sec < 300) early[k] = (early[k] || 0) + 1; } }
    prev.set(t.id, now);
  }
});
const inventedScholars = S.chronicle.filter(c => c.kind === 'invented' && /scholars/.test(c.text)).length;
console.log(JSON.stringify({
  seed, draw, save: (() => { const j = saveGame(S) as any; delete j.content; return createHash('sha256').update(JSON.stringify(j)).digest('hex').slice(0, 12); })(), villagers: villagers(S).length, settlements: S.towns.length, departures: S.stats.departures, trades: S.stats.trades, fed_min: Math.round(minFed * 1000) / 1000,
  invented: S.stats.invented, inventedScholars, taught: S.stats.taught, forgotten: S.stats.forgotten,
  ages: [...ages.values()], shown, given, early,
}));

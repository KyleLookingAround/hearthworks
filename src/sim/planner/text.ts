/** The planner's words: names of goods and buildings, plurals and lists, for the reasons it gives and the chronicle. */
import type { ItemId, State } from '../types.ts';

export const goodName = (S: State, g: ItemId) => S.content.goods[g]?.name.toLowerCase() ?? g;
export const runningLow = (S: State, g: ItemId) => { const n = goodName(S, g); return `${n} ${n.endsWith('s') ? 'are' : 'is'} running low`; };
/** 'an' before a vowel sound: an Orchard, but a University. */
export const article = (name: string) => (/^(?!uni|use|eu)[aeiou]/i.test(name) ? 'an' : 'a');
/** Plurals and lists for the planner's reasons: bakeries; farms, gardens or orchards. */
export const plural = (n: string) => (/[^aeiou]y$/.test(n) ? n.slice(0, -1) + 'ies' : n + 's');
export const orList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}` : xs[0] ?? '');
/** Ordinal words for a settlement's districts, as the chronicle tells them. */
export const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

export const minutes = (s: number) => { const m = Math.round(s / 60); return `${m} minute${m === 1 ? '' : 's'}`; };

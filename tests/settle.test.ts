import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, runFor, villagers, bp, loadGame, saveGame } from '../src/sim/index.ts';
import { sendParty } from '../src/sim/settle.ts';

const content = loadContent();
const Z = content.tuning.settling;

test('settling is off unless asked for', () => {
  const S = createState(content, 1847, { planner: true, map: 'landmass', size: 'l' });
  runFor(S, 60);
  assert.equal(S.settlers, false);
  assert.equal(S.towns.length, 1);
});

test('a crowded settlement sends a party with goods, practised knowledge and its custom', () => {
  const S = createState(content, 1847, { planner: true, settlers: true, people: true, map: 'landmass', size: 'l' });
  const mother = S.towns[0], yard = S.bmap.get(mother.store)!;
  // crowd it: more founders, and stores to pay for the founding
  runFor(S, 1);
  const extra = Z.minVillagers - villagers(S).length;
  for (let k = 0; k < extra; k++) {
    const c = S.agents.find(a => a.kind === 'villager')!;
    const n = { ...c, id: S.nextId++, home: null, skill: {}, path: [], task: null, carry: null };
    S.agents.push(n); S.amap.set(n.id, n);
  }
  for (const a of villagers(S)) if (!a.home) { a.home = yard; }
  yard.inv = { planks: 200, bread: 100, logs: 50 };
  mother.knows.dock = { by: mother.name, at: 0, verified: [], from: null, learned: 0, used: 0 };
  const d = sendParty(S, mother);
  assert.ok(d, 'a daughter was founded');
  assert.equal(d!.mother, mother.id);
  assert.equal(d!.custom, mother.custom);
  assert.ok(!('dock' in d!.knows), 'a craft the mother never practised stays behind');
  assert.equal(villagers(S).filter(a => a.home?.town === d!.id).length, Z.partySize);
  const dy = S.bmap.get(d!.store)!;
  assert.ok((dy.inv.bread || 0) > 0 && (dy.inv.planks || 0) > 0, 'they carried stores');
  assert.ok(S.chronicle.some(c => c.kind === 'settled'));
  void bp;
});

test('a game with settling saves and loads', () => {
  const S = createState(content, 1847, { planner: true, settlers: true });
  runFor(S, 60);
  S.towns[0].sentAt = 33;
  const back = loadGame(content, saveGame(S));
  assert.equal(back.settlers, true);
  assert.equal(back.towns[0].sentAt, 33);
  assert.equal(back.towns[0].mother, null);
});

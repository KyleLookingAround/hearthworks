import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, runFor, villagers, bp, loadGame, saveGame, crowded } from '../src/sim/index.ts';
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
  mother.craft = 'bakery';
  const d = sendParty(S, mother);
  assert.ok(d, 'a daughter was founded');
  assert.equal(d!.mother, mother.id);
  assert.equal(d!.custom, mother.custom);
  // and its ways: its mother's craft too, and the chronicle says whose ways it keeps
  assert.equal(d!.craft, 'bakery');
  assert.ok(d!.why.custom?.includes(mother.name));
  assert.ok(S.chronicle.some(c => c.town === d!.id && c.kind === 'custom' && c.text.includes(`keeps the ways of ${mother.name}`) && c.text.includes('bread')));
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

test('a settlement whose land is full sends a party from crowded_min_villagers, one with room waits for min_villagers', () => {
  const party = (full: boolean) => {
    const S = createState(content, 1847, { planner: true, settlers: true, people: true, map: 'landmass', size: 'l' });
    const mother = S.towns[0], yard = S.bmap.get(mother.store)!;
    runFor(S, 1);
    const extra = Z.crowdedMinVillagers - villagers(S).length;
    for (let k = 0; k < extra; k++) {
      const c = S.agents.find(a => a.kind === 'villager')!;
      const n = { ...c, id: S.nextId++, home: yard, skill: {}, path: [], task: null, carry: null };
      S.agents.push(n); S.amap.set(n.id, n);
    }
    yard.inv = { planks: 200, bread: 100, logs: 50 };
    // its wish list has held "no room" for a farm for `crowded_hold_seconds` (or holds nothing without room)
    mother.planner.roomSince = full ? S.t - Z.crowdedHoldSeconds : null;
    return sendParty(S, mother);
  };
  assert.ok(Z.crowdedMinVillagers < Z.minVillagers);
  assert.ok(party(true), 'its land is full: it sends settlers');
  assert.equal(party(false), null, 'room to grow: it waits until it is crowded');
});

test('crowding is a "no room" verdict held on the wish list, not a moment of it', () => {
  const S = createState(content, 1847, { planner: true, settlers: true });
  const t = S.towns[0];
  assert.equal(crowded(S, t), false);
  t.planner.roomSince = S.t;
  assert.equal(crowded(S, t), false, 'just now: not yet crowded');
  S.t += Z.crowdedHoldSeconds;
  assert.equal(crowded(S, t), true, 'held long enough: crowded');
});

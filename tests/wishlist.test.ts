import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadContent } from '../src/content/node.ts';
import { createState, loadGame, runFor, saveGame, type SaveFile, type State, type Verdict } from '../src/sim/index.ts';
import { clearFor } from '../src/sim/planner/water.ts';
import { wishesOf } from '../src/ui/readouts.ts';

const content = loadContent();
const VERDICTS: Verdict[] = ['going', 'thinking', 'saving', 'hands', 'room', 'trading', 'input', 'queued', 'none', 'below'];

test('each look leaves one wish list: every need with its building and verdict, the one that decided the look first, and the status line is its top entry', () => {
  const S = createState(content, 7, { planner: true, settlements: 2, people: true, carts: true, seasons: true, trade: true });
  let looked = 0;
  for (let k = 0; k < 40; k++) {
    runFor(S, 30);
    for (const t of S.towns) {
      const W = t.planner.wishes;
      if (!W.length) continue;
      looked++;
      assert.ok(W.length <= content.tuning.planner.wishListSize);
      for (const w of W) assert.ok(VERDICTS.includes(w.verdict), w.verdict);
      if (W[0].verdict !== 'below') assert.equal(t.planner.status, W[0].text);
      // at most one wish goes ahead a look
      assert.ok(W.filter(w => w.verdict === 'going').length <= 1);
    }
  }
  assert.ok(looked > 0);
});

test('the planner is free of random draws: the same seed gives the same lists', () => {
  const run = () => { const S = createState(content, 3, { planner: true, people: true }); runFor(S, 600); return JSON.stringify(S.towns.map(t => t.planner.wishes)); };
  assert.equal(run(), run());
});

test('a university only asks whether a workshop could be cleared for it until it is chosen and paid for: nothing comes down', () => {
  const S = createState(content, 7, { planner: true, people: true });
  runFor(S, 900);
  const t = S.towns[0], n = S.buildings.filter(b => !b.dead).length, ids = S.buildings.map(b => b.id).join();
  clearFor(S, t, content.blueprints.university, false);
  assert.equal(S.buildings.filter(b => !b.dead).length, n);
  assert.equal(S.buildings.map(b => b.id).join(), ids);
});

test('the card reads the top of the list in a few words', () => {
  const S = createState(content, 1847, { planner: true });
  const t = S.towns[0];
  t.planner.wishes = [
    { key: 'bread', sev: 0.9, type: 'bakery', verdict: 'saving', text: 'Saving planks for a Bakery: bread is running low', why: 'bread is running low', good: 'planks', have: 6, need: 10 },
    { key: 'winter_store', sev: 0.6, type: 'granary', verdict: 'room', text: 'No room for a Granary: there is no room to store the grain for winter', why: 'there is no room to store the grain for winter' },
    { key: 'road', sev: 0.6, type: null, verdict: 'queued', text: 'a road: its people walk this way most', why: 'its people walk this way most' },
    { key: 'meat', sev: 0.1, type: null, verdict: 'below', text: 'meat is running low', why: 'meat is running low' },
  ];
  assert.deepEqual(wishesOf(S, t).map(w => `${w.name}: ${w.short}`), ['Bakery: saving planks, 6 of 10', 'Granary: no room', 'Road: waits its turn']);
});

test('a version 33 save is upgraded to version 34: no wishes yet, nothing held without room, and the needs that shared a key keep their priority under each new one', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v33.json', import.meta.url), 'utf8')) as SaveFile;
  assert.equal(file.version, 33);
  const S: State = loadGame(content, file);
  const [a, b] = S.towns;
  assert.ok(S.towns.every(t => Array.isArray(t.planner.wishes) && t.planner.roomSince === null));
  assert.deepEqual(a.levers.priority, { hauling: 2, carts: 2, oxen: 2, stores_full: 4, winter_store: 4 });
  assert.deepEqual(b.levers.priority, { library: 0.5, school: 0.5, university: 0.5, press: 0.5 });
  assert.equal(a.planner.firstFor.stores_full, 5);
  assert.equal(a.planner.firstFor.winter_store, 5);
  assert.ok(!('storage' in a.planner.firstFor));
  runFor(S, 60);
  assert.ok(S.towns.some(t => t.planner.wishes.length > 0), 'its planners look and make their lists');
  const text = (s: State) => JSON.stringify(saveGame(s));
  assert.equal(text(loadGame(content, text(S))), text(S));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadContent } from '../src/content/node.ts';
import { createState, demolish, loadGame, migrate, runFor, saveGame, SAVE_VERSION, type SaveFile } from '../src/sim/index.ts';
import { standardMetrics } from '../src/gates/kit.ts';

const content = loadContent();
const text = (S: Parameters<typeof saveGame>[0]) => JSON.stringify(saveGame(S));

test('a saved and loaded game plays on exactly as if it had never stopped', () => {
  const A = createState(content, 7, { planner: true, settlements: 2, map: 'islands', size: 'small' });
  runFor(A, 300);
  const B = loadGame(content, text(A));
  assert.equal(text(B), text(A), 'saving the loaded game gives the same file');
  runFor(A, 300); runFor(B, 300);
  assert.deepEqual(standardMetrics(B), standardMetrics(A));
  assert.equal(text(B), text(A));
  assert.equal(B.planner, B.towns[0].planner, 'the player\'s planner is still town 0\'s');
});

test('a carrier whose job points at a demolished building survives a save', () => {
  const S = createState(content, 1847, { planner: true });
  runFor(S, 200);
  const a = S.agents.find(x => x.task)!;
  assert.ok(a, 'someone is carrying');
  const dst = a.task!.dst;
  demolish(S, dst);
  const L = loadGame(content, text(S));
  const b = L.amap.get(a.id)!;
  assert.equal(b.task?.dst.dead, true, 'the job still points at the demolished building');
  assert.ok(!L.bmap.has(dst.id));
  runFor(S, 30); runFor(L, 30);
  assert.equal(text(L), text(S));
});

test('saves carry a version: newer ones are refused, other files are not saves', () => {
  const S = createState(content, 1847);
  const f = saveGame(S);
  assert.equal(f.version, SAVE_VERSION);
  assert.equal(f.content, content.hash);
  assert.throws(() => migrate({ ...f, version: SAVE_VERSION + 1 }), /newer version/);
  assert.throws(() => loadGame(content, '{"hello":1}'), /not a Hearthworks save/);
});

test('the version 1 fixture still loads and plays', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v1.json', import.meta.url), 'utf8')) as SaveFile;
  assert.equal(file.version, 1);
  const S = loadGame(content, file);
  const before = S.t;
  runFor(S, 60);
  assert.ok(S.t > before);
  assert.ok(S.towns.length >= 1 && S.agents.length > 0);
});

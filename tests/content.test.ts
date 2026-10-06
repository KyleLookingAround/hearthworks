import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, readDesignFiles } from '../src/content/node.ts';
import { buildContent, ContentError } from '../src/content/load.ts';

test('the design bundle builds into valid game content', () => {
  const c = loadContent();
  assert.ok(Object.keys(c.blueprints).length >= 8);
  assert.ok(c.goods.planks && c.goods.bread);
  assert.equal(c.blueprints.sawmill.input.logs, 1);
  assert.equal(c.blueprints.house.homes, 3);
  // the standard map is Island at the standard size, 112 by 80
  assert.equal(c.tuning.map.width, 112);
});

test('a blueprint naming an unknown good is rejected with the file name', () => {
  const files = readDesignFiles().map(f => f.path === 'blueprints/bakery.md' ? { ...f, raw: f.raw.replace('output: { bread: 1 }', 'output: { cake: 1 }') } : f);
  assert.throws(() => buildContent(files), (e: unknown) => e instanceof ContentError && e.problems.some(p => p.includes('blueprints/bakery.md') && p.includes('"cake"')));
});

test('a missing tuning number is rejected', () => {
  const files = readDesignFiles().map(f => f.path === 'systems/needs.md' ? { ...f, raw: f.raw.replace(/\n  eat_every_seconds: 45/, '') } : f);
  assert.throws(() => buildContent(files), /systems\/needs.md: "tuning.eat_every_seconds" is required/);
});

test('a misspelt tuning key is rejected, and so is the key it should have been', () => {
  const files = readDesignFiles().map(f => f.path === 'systems/trade.md' ? { ...f, raw: f.raw.replace(/\n  kin_bonus:/, '\n  kin_bonuss:') } : f);
  assert.throws(() => buildContent(files), (e: unknown) => e instanceof ContentError
    && e.problems.some(p => p.includes('systems/trade.md: "tuning.kin_bonuss" is not a tuning key'))
    && e.problems.some(p => p.includes('systems/trade.md: "tuning.kin_bonus" is required')));
});

test('a misspelt key in a nested tuning block is rejected', () => {
  const files = readDesignFiles().map(f => f.path === 'systems/needs.md' ? { ...f, raw: f.raw.replace(' tree_radius: 4,', ' tree_radios: 4,') } : f);
  assert.throws(() => buildContent(files), /systems\/needs.md: "tuning.surroundings.tree_radios" is not a tuning key/);
});

test('content hash changes when a number changes', () => {
  const a = buildContent(readDesignFiles());
  const b = buildContent(readDesignFiles().map(f => f.path === 'systems/needs.md' ? { ...f, raw: f.raw.replace('eat_every_seconds: 45', 'eat_every_seconds: 46') } : f));
  assert.notEqual(a.hash, b.hash);
});

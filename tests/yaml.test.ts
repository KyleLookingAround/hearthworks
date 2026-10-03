import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml } from '../src/content/yaml.ts';
import { parseDoc } from '../src/content/frontmatter.ts';

test('block mappings, nesting and scalars', () => {
  assert.deepEqual(parseYaml('a: 1\nb: two words\nc:\n  d: true\n  e: null\nf: "quoted: yes"\ng: 2026-10-03T08:15:00Z'), {
    a: 1, b: 'two words', c: { d: true, e: null }, f: 'quoted: yes', g: '2026-10-03T08:15:00Z',
  });
});

test('flow collections, including timestamps and nesting', () => {
  assert.deepEqual(parseYaml('generated: { by: claude/opus-5.5, at: 2026-10-03T08:15:00Z }\nsize: [2, 3]\nrecipe: { input: { logs: 1 }, output: { planks: 1 }, seconds: 4 }'), {
    generated: { by: 'claude/opus-5.5', at: '2026-10-03T08:15:00Z' },
    size: [2, 3],
    recipe: { input: { logs: 1 }, output: { planks: 1 }, seconds: 4 },
  });
});

test('sequences of flow maps and of block maps (OKF sources)', () => {
  const v = parseYaml([
    'parameters:',
    '  - { name: seed, type: integer, required: true }',
    'sources:',
    '  - id: okf',
    '    resource: https://github.com/GoogleCloudPlatform/open-knowledge-format',
    '    title: OKF spec',
    '  - id: hc',
    '    resource: https://store.steampowered.com/app/2481240/HavenCraft/',
    'tags:',
    '- a',
    '- b',
  ].join('\n'));
  assert.deepEqual(v, {
    parameters: [{ name: 'seed', type: 'integer', required: true }],
    sources: [
      { id: 'okf', resource: 'https://github.com/GoogleCloudPlatform/open-knowledge-format', title: 'OKF spec' },
      { id: 'hc', resource: 'https://store.steampowered.com/app/2481240/HavenCraft/' },
    ],
    tags: ['a', 'b'],
  });
});

test('comments and multi-line flow collections', () => {
  assert.deepEqual(parseYaml('# top\na: 1 # trailing\nb: "x # not a comment"\nc: [1,\n  2,\n  3]'), { a: 1, b: 'x # not a comment', c: [1, 2, 3] });
});

test('unsupported syntax fails loudly with a line number', () => {
  assert.throws(() => parseYaml('a: |\n  text'), /line 1: block scalars/);
  assert.throws(() => parseYaml('a: &x 1'), /anchors/);
  assert.throws(() => parseYaml('a: 1\na: 2'), /line 2: duplicate key/);
  assert.throws(() => parseYaml('a: b: c'), /quote it/);
  assert.throws(() => parseYaml('a: 1\n   b: 2'), /unexpected indentation/);
});

test('documents split into frontmatter and body', () => {
  const d = parseDoc('x.md', '---\ntype: Good\ntitle: Logs\n---\n\n# Flow\nbody');
  assert.equal(d.data.type, 'Good');
  assert.equal(d.body.trim(), '# Flow\nbody');
  assert.throws(() => parseDoc('y.md', '# no frontmatter'), /missing frontmatter/);
});

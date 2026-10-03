/** Node-only: read the design bundle from disk (tests, gates, build script). */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContent, type SourceFile } from './load.ts';
import type { Content } from '../sim/types.ts';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const DESIGN_DIR = join(REPO_ROOT, 'design');

export function walkMarkdown(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkMarkdown(p));
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

export function readDesignFiles(dir = DESIGN_DIR): SourceFile[] {
  return walkMarkdown(dir)
    .map(p => ({ path: relative(dir, p).split(sep).join('/'), raw: readFileSync(p, 'utf8') }))
    .filter(f => /^(blueprints|goods|maps|systems|eras)\//.test(f.path));
}

export const loadContent = (dir = DESIGN_DIR): Content => buildContent(readDesignFiles(dir));

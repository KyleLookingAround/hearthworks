/**
 * Assemble the static site in site/: copy static/ and compile the design
 * bundle into site/content.json. Run after `tsc -p tsconfig.build.json`
 * (which writes site/js). `npm run build` does both.
 */
import { cpSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadContent, REPO_ROOT } from '../src/content/node.ts';

export function buildSite(): { content: number; hash: string } {
  const out = join(REPO_ROOT, 'site');
  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(join(REPO_ROOT, 'static'))) cpSync(join(REPO_ROOT, 'static', f), join(out, f), { recursive: true });
  const content = loadContent();
  const json = JSON.stringify(content);
  writeFileSync(join(out, 'content.json'), json);
  writeFileSync(join(out, '.nojekyll'), '');
  return { content: json.length, hash: content.hash };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = buildSite();
  console.log(`site/ ready: content.json ${(r.content / 1024).toFixed(1)} KB, content ${r.hash}`);
}

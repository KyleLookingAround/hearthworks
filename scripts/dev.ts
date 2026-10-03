/**
 * Local development: compile TypeScript in watch mode, rebuild content.json
 * when the design bundle changes, and serve site/ on http://localhost:5173.
 * Zero dependencies beyond TypeScript. Reload the browser to see changes.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, watch } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { REPO_ROOT } from '../src/content/node.ts';
import { buildSite } from './build-site.ts';

const PORT = Number(process.env.PORT ?? 5173);
const SITE = join(REPO_ROOT, 'site');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.map': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
};

const rebuild = () => {
  try { const r = buildSite(); console.log(`[content] rebuilt ${r.hash}`); }
  catch (e) { console.error(`[content] ${(e as Error).message}`); }
};
rebuild();

const tscArgs = ['-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput'];
let tscBin: string | null = null;
try { tscBin = createRequire(import.meta.url).resolve('typescript/bin/tsc'); } catch { /* fall back to tsc on PATH */ }
const tsc = tscBin
  ? spawn(process.execPath, [tscBin, ...tscArgs], { cwd: REPO_ROOT, stdio: 'inherit' })
  : spawn('tsc', tscArgs, { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
process.on('exit', () => tsc.kill());

let timer: ReturnType<typeof setTimeout> | undefined;
for (const dir of ['design', 'static']) {
  watch(join(REPO_ROOT, dir), { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(rebuild, 150); });
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let p = normalize(join(SITE, decodeURIComponent(url.pathname)));
  if (!p.startsWith(SITE)) { res.writeHead(403).end(); return; }
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(p));
}).listen(PORT, () => console.log(`Hearthworks on http://localhost:${PORT}`));

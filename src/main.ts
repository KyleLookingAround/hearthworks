import { App } from './ui/app.ts';
import type { Content } from './sim/index.ts';

const DEFAULT_SEED = 1847;

async function boot() {
  const res = await fetch('./content.json');
  if (!res.ok) throw new Error(`content.json: HTTP ${res.status}`);
  const content = (await res.json()) as Content;
  const app = new App(content, DEFAULT_SEED);
  app.start();
}

boot().catch(err => {
  const el = document.getElementById('fatal');
  if (el) { el.hidden = false; el.textContent = `Could not start the game: ${(err as Error).message}`; }
  console.error(err);
});

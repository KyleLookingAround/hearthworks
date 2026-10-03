/** The new-game screen: pick the world (map type, size, settlements, seed) with a live preview, then start. */
import { createState, ctr, type Content } from '../sim/index.ts';

export interface GameChoice { map: string; size: string; settlements: number; seed: number; plans: boolean }

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const KEY = 'hearthworks.newgame';
const MAX_SETTLEMENTS = 4;
const randomSeed = () => Math.floor(Math.random() * 1e9);

export class NewGameDialog {
  private readonly content: Content;
  private readonly onStart: (c: GameChoice) => void;
  private choice: GameChoice;
  private previewTimer = 0;

  constructor(content: Content, onStart: (c: GameChoice) => void, seed: number) {
    this.content = content;
    this.onStart = onStart;
    const T = content.tuning.map;
    this.choice = { map: T.standardType, size: T.standardSize, settlements: T.sizes[T.standardSize].settlements, seed, plans: true };
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<GameChoice> | null;
      if (saved && content.maps[saved.map ?? ''] && T.sizes[saved.size ?? '']) this.choice = { ...this.choice, ...saved };
    } catch { /* storage unavailable: use the defaults */ }
    this.build();
  }

  /** Show the screen. `cancellable` when a game is already running behind it. */
  open(cancellable: boolean) {
    $('#ngCancel').hidden = !cancellable;
    $('#newgame').hidden = false;
    this.sync();
    $<HTMLButtonElement>('#ngStart').focus({ preventScroll: true });
    $('.newgame').scrollTop = 0;
  }

  close() { $('#newgame').hidden = true; }

  private build() {
    const maps = Object.values(this.content.maps).sort((a, b) => a.order - b.order);
    $('#ngMaps').innerHTML = maps.map(M => `<button type="button" class="ng-card" data-map="${esc(M.id)}" aria-pressed="false"><b>${esc(M.name)}</b><span>${esc(M.description)}</span></button>`).join('');
    const sizes = Object.entries(this.content.tuning.map.sizes);
    $('#ngSizes').innerHTML = sizes.map(([id, z]) => `<button type="button" class="btn" data-size="${esc(id)}" aria-pressed="false">${esc(id[0].toUpperCase() + id.slice(1))}<small>${z.width} × ${z.height}</small></button>`).join('');
    $('#ngTowns').innerHTML = Array.from({ length: MAX_SETTLEMENTS }, (_, i) => `<button type="button" class="btn" data-towns="${i + 1}" aria-pressed="false">${i + 1}</button>`).join('');

    document.querySelectorAll<HTMLButtonElement>('#ngMaps [data-map]').forEach(b => b.addEventListener('click', () => { this.choice.map = b.dataset.map!; this.sync(); }));
    document.querySelectorAll<HTMLButtonElement>('#ngSizes [data-size]').forEach(b => b.addEventListener('click', () => { this.choice.size = b.dataset.size!; this.sync(); }));
    document.querySelectorAll<HTMLButtonElement>('#ngTowns [data-towns]').forEach(b => b.addEventListener('click', () => { this.choice.settlements = Number(b.dataset.towns); this.sync(); }));
    const seed = $<HTMLInputElement>('#ngSeed');
    seed.addEventListener('input', () => { const v = Math.floor(Number(seed.value)); if (Number.isFinite(v) && v >= 0) { this.choice.seed = v; this.sync(false); } });
    $('#ngRandom').addEventListener('click', () => { this.choice.seed = randomSeed(); this.sync(); });
    const plans = $<HTMLInputElement>('#ngPlans');
    plans.addEventListener('change', () => { this.choice.plans = plans.checked; });
    $('#ngStart').addEventListener('click', () => {
      try { localStorage.setItem(KEY, JSON.stringify(this.choice)); } catch { /* not saved: fine */ }
      this.close();
      this.onStart({ ...this.choice });
    });
    $('#ngCancel').addEventListener('click', () => this.close());
    $('#newgame').addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#ngCancel').hidden) this.close(); });
  }

  /** Reflect the choice in the controls, and redraw the preview shortly after the last change. */
  private sync(updateSeedField = true) {
    const c = this.choice;
    document.querySelectorAll<HTMLButtonElement>('#ngMaps [data-map]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.map === c.map)));
    document.querySelectorAll<HTMLButtonElement>('#ngSizes [data-size]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.size === c.size)));
    document.querySelectorAll<HTMLButtonElement>('#ngTowns [data-towns]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.towns) === c.settlements)));
    if (updateSeedField) $<HTMLInputElement>('#ngSeed').value = String(c.seed);
    $<HTMLInputElement>('#ngPlans').checked = c.plans;
    clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => this.preview(), 120);
  }

  /** Generate the world the choice would make and draw it small: water, sand, grass, woods and settlements. */
  private preview() {
    const c = this.choice, cv = $<HTMLCanvasElement>('#ngPreview'), ctx = cv.getContext('2d')!;
    const S = createState(this.content, c.seed, { map: c.map, size: c.size, settlements: c.settlements });
    const w = S.world, px = Math.max(1, Math.floor(Math.min(cv.width / w.w, cv.height / w.h)));
    const ox = Math.floor((cv.width - w.w * px) / 2), oy = Math.floor((cv.height - w.h * px) / 2);
    ctx.fillStyle = '#1d4b57'; ctx.fillRect(0, 0, cv.width, cv.height);
    const colour = ['#1d4b57', '#d6c38f', '#7aa960'];
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
      const i = y * w.w + x;
      ctx.fillStyle = w.tree[i] === 2 ? '#2f5a36' : colour[w.ground[i]];
      ctx.fillRect(ox + x * px, oy + y * px, px, px);
    }
    for (const t of S.towns) {
      const s = S.bmap.get(t.store);
      if (!s) continue;
      const p = ctr(s);
      ctx.fillStyle = '#f0c27a'; ctx.strokeStyle = '#1b2326'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ox + p.x * px, oy + p.y * px, Math.max(4, px * 2.5), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    const got = S.towns.length;
    $('#ngNote').textContent = `${S.towns.map(t => t.name).join(', ')}${got < c.settlements ? ` (room for only ${got} of ${c.settlements} settlements on this map)` : ''}`;
  }
}

/** The new-game screen: pick the world (map type, size, settlements, seed) with a live preview, then start. */
import { createState, ctr, type Content } from '../sim/index.ts';

export interface GameChoice { map: string; size: string; settlements: number; seed: number; plans: boolean; seasons: boolean; trade: boolean }

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const KEY = 'hearthworks.newgame';
const MAX_SETTLEMENTS = 4;
const randomSeed = () => Math.floor(Math.random() * 1e9);

export class NewGameDialog {
  private readonly content: Content;
  private readonly onStart: (c: GameChoice) => void;
  private readonly onContinue: () => void;
  private choice: GameChoice;
  private previewTimer = 0;

  constructor(content: Content, onStart: (c: GameChoice) => void, onContinue: () => void, seed: number) {
    this.content = content;
    this.onStart = onStart;
    this.onContinue = onContinue;
    const T = content.tuning.map;
    // players start on the first map type in order (Islands); the gates keep the standard map
    const first = Object.values(content.maps).sort((a, b) => a.order - b.order)[0]?.id ?? T.standardType;
    const size = T.sizes[T.gameSize] ? T.gameSize : T.standardSize;
    this.choice = { map: first, size, settlements: T.sizes[size].settlements, seed, plans: true, seasons: true, trade: true };
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<GameChoice> | null;
      if (saved && content.maps[saved.map ?? ''] && T.sizes[saved.size ?? '']?.offered) this.choice = { ...this.choice, ...saved };
    } catch { /* storage unavailable: use the defaults */ }
    this.build();
  }

  /** Show the screen. `cancellable` when a game is already running behind it; `saved` describes the autosave to continue, if any. */
  open(cancellable: boolean, saved: string | null = null) {
    $('#ngCancel').hidden = !cancellable;
    $('#ngContinue').hidden = !saved;
    $('#ngSaved').hidden = !saved;
    $('#ngSaved').textContent = saved ? `Saved: ${saved}` : '';
    $('#newgame').hidden = false;
    this.sync();
    $<HTMLButtonElement>('#ngStart').focus({ preventScroll: true });
    $('.newgame').scrollTop = 0;
  }

  close() { $('#newgame').hidden = true; }

  private build() {
    const maps = Object.values(this.content.maps).sort((a, b) => a.order - b.order);
    $('#ngMaps').innerHTML = maps.map(M => `<button type="button" class="ng-card" data-map="${esc(M.id)}" aria-pressed="false"><b>${esc(M.name)}</b><span>${esc(M.description)}</span></button>`).join('');
    const sizes = Object.entries(this.content.tuning.map.sizes).filter(([, z]) => z.offered);
    $('#ngSizes').innerHTML = sizes.map(([id, z]) => `<button type="button" class="btn" data-size="${esc(id)}" aria-pressed="false">${esc(z.label)}<small>${z.width} × ${z.height}</small></button>`).join('');
    $('#ngTowns').innerHTML = Array.from({ length: MAX_SETTLEMENTS }, (_, i) => `<button type="button" class="btn" data-towns="${i + 1}" aria-pressed="false">${i + 1}</button>`).join('');

    document.querySelectorAll<HTMLButtonElement>('#ngMaps [data-map]').forEach(b => b.addEventListener('click', () => { this.choice.map = b.dataset.map!; this.sync(); }));
    document.querySelectorAll<HTMLButtonElement>('#ngSizes [data-size]').forEach(b => b.addEventListener('click', () => { this.choice.size = b.dataset.size!; this.sync(); }));
    document.querySelectorAll<HTMLButtonElement>('#ngTowns [data-towns]').forEach(b => b.addEventListener('click', () => { this.choice.settlements = Number(b.dataset.towns); this.sync(); }));
    const seed = $<HTMLInputElement>('#ngSeed');
    seed.addEventListener('input', () => { const v = Math.floor(Number(seed.value)); if (Number.isFinite(v) && v >= 0) { this.choice.seed = v; this.sync(false); } });
    $('#ngRandom').addEventListener('click', () => { this.choice.seed = randomSeed(); this.sync(); });
    const seasons = $<HTMLInputElement>('#ngSeasons');
    seasons.addEventListener('change', () => { this.choice.seasons = seasons.checked; });
    const trade = $<HTMLInputElement>('#ngTrade');
    trade.addEventListener('change', () => { this.choice.trade = trade.checked; });
    const plans = $<HTMLInputElement>('#ngPlans');
    plans.addEventListener('change', () => { this.choice.plans = plans.checked; });
    $('#ngStart').addEventListener('click', () => {
      try { localStorage.setItem(KEY, JSON.stringify(this.choice)); } catch { /* not saved: fine */ }
      this.close();
      this.onStart({ ...this.choice });
    });
    $('#ngCancel').addEventListener('click', () => this.close());
    $('#ngContinue').addEventListener('click', () => { this.close(); this.onContinue(); });
    $('#newgame').addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#ngCancel').hidden) this.close(); });
  }

  /** Reflect the choice in the controls, and redraw the preview shortly after the last change. */
  private sync(updateSeedField = true) {
    const c = this.choice;
    // some map types are only offered at some sizes
    const offered = Object.entries(this.content.tuning.map.sizes).filter(([id, z]) => z.offered && (this.content.maps[c.map]?.sizes ?? [id]).includes(id)).map(([id]) => id);
    if (!offered.includes(c.size)) { c.size = offered[0]; c.settlements = this.content.tuning.map.sizes[c.size].settlements; }
    document.querySelectorAll<HTMLButtonElement>('#ngSizes [data-size]').forEach(b => { b.disabled = !offered.includes(b.dataset.size!); });
    document.querySelectorAll<HTMLButtonElement>('#ngMaps [data-map]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.map === c.map)));
    document.querySelectorAll<HTMLButtonElement>('#ngSizes [data-size]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.size === c.size)));
    document.querySelectorAll<HTMLButtonElement>('#ngTowns [data-towns]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.towns) === c.settlements)));
    if (updateSeedField) $<HTMLInputElement>('#ngSeed').value = String(c.seed);
    $<HTMLInputElement>('#ngPlans').checked = c.plans;
    $<HTMLInputElement>('#ngSeasons').checked = c.seasons !== false;
    $<HTMLInputElement>('#ngTrade').checked = c.trade !== false;
    clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => this.preview(), 120);
  }

  /** Generate the world the choice would make and draw it small: water, sand, grass, woods and settlements. */
  private preview() {
    const c = this.choice, cv = $<HTMLCanvasElement>('#ngPreview'), ctx = cv.getContext('2d')!;
    const S = createState(this.content, c.seed, { map: c.map, size: c.size, settlements: c.settlements });
    // one pixel a tile, scaled to fit the preview whatever the map's size
    const w = S.world, img = new ImageData(w.w, w.h);
    const rgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const colour = [rgb('#1d4b57'), rgb('#d6c38f'), rgb('#7aa960'), rgb('#8f8a7f')], wood = rgb('#2f5a36');
    for (let i = 0; i < w.ground.length; i++) {
      const [r, g, b] = w.tree[i] === 2 ? wood : colour[w.ground[i]];
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    const tiles = document.createElement('canvas');
    tiles.width = w.w; tiles.height = w.h;
    tiles.getContext('2d')!.putImageData(img, 0, 0);
    const px = Math.min(cv.width / w.w, cv.height / w.h);
    const ox = (cv.width - w.w * px) / 2, oy = (cv.height - w.h * px) / 2;
    ctx.fillStyle = '#1d4b57'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tiles, ox, oy, w.w * px, w.h * px);
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

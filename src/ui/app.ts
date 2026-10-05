/** Browser shell: HUD, build bar, inspector, toasts, pointer input and the frame loop. */
import { surroundings } from '../sim/surroundings.ts';
import { clean, guarded } from '../sim/hardship.ts';
import { homeTier } from '../sim/production.ts';
import { FEAST, NAMING, called } from '../sim/people.ts';
import { atOnce, formOf, hubs, openSites, renewalNote } from '../sim/planner.ts';
import { capOf, crew, growFarm, growProblem, maxSize, offered, places, sizeName } from '../sim/farms.ts';
import { ZONES, advise, defence, scholarly, learningAt, reads, chronicleLog, loadGame, saveGame, seasonOf, type SaveFile, canPlace, placeProblem, countBuilt, createState, demolish, NEED_TEXT, ageNeeded, beltBy, ctr, originText, placeBuilding, turnBuilding, STEP, tick, verifiedHere, villagers, type Building, type Content, type State } from '../sim/index.ts';
import { ghostOrigin, Renderer, TS, type View } from '../render/renderer.ts';
import { NewGameDialog, type GameChoice } from './newgame.ts';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const SAVE_KEY = 'hearthworks.save';
const AUTOSAVE_SECONDS = 20;
/** Zone tools: id, name, swatch, what it does. */
const ZONE_TOOLS: [string, string, string, string][] = [
  ['zone:homes', 'Homes zone', '#e89a8a', 'paint'], ['zone:farms', 'Farm zone', '#e3c454', 'paint'],
  ['zone:workshops', 'Workshop zone', '#8fa6c8', 'paint'], ['zone:nobuild', 'No building', '#b0413e', 'paint'], ['zone:clear', 'Clear zones', '#6b7a80', 'erase'],
];
const n0 = (v: number | undefined) => Math.max(0, Math.round(v || 0));

export class App {
  S: State;
  readonly content: Content;
  readonly r: Renderer;
  view: View;
  speed = 1;
  /** Village plans: the planner chooses and places buildings. On by default; the player can still place by hand. */
  plans = true;
  private seenEvents = 0;
  /** Which notices pop up: important ones (default), everything, or none. */
  notices: 'important' | 'all' | 'off' = 'important';
  private knowKey = '';
  private confirmDel = false;
  private readonly dialog: NewGameDialog;
  /** False while the standard world idles behind the first new-game screen: nothing to save yet. */
  private live = false;
  private saveT = 0;

  constructor(content: Content, seed: number) {
    this.content = content;
    try { const n = localStorage.getItem('hearthworks.notices'); if (n === 'all' || n === 'off' || n === 'important') this.notices = n; } catch { /* default */ }
    this.r = new Renderer($<HTMLCanvasElement>('#view'));
    this.S = createState(content, seed);
    this.dialog = new NewGameDialog(content, c => this.newGame(c), () => this.continueGame(), seed);
    this.view = { cam: { x: 0, y: 0, z: 1 }, hover: null, tool: null, rot: 0, sel: null, routes: false, overlay: 'none' };
    this.buildBar();
    this.wireControls();
    this.wireInput();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    // the standard world plays behind the new-game screen until the player picks one
    const T = content.tuning.map;
    this.adopt(createState(content, seed, { planner: true, settlements: T.sizes[T.standardSize].settlements }));
    this.live = false;
    this.setSpeed(0);
    this.dialog.open(false, this.savedLabel());
  }

  newGame(c: GameChoice) {
    this.adopt(createState(this.content, c.seed, { planner: c.plans, seasons: c.seasons !== false, trade: c.trade !== false, people: c.people !== false, carts: c.carts !== false, settlers: c.settlers !== false, charts: c.settlers !== false, ships: c.settlers !== false, hardship: c.hardship !== false, plannedRoads: c.roads !== false, farms: c.farms !== false, settlements: c.settlements, map: c.map, size: c.size }));
    this.save();
  }

  /** Play a world: a new one, or one loaded from a save. */
  private adopt(S: State) {
    this.S = S;
    this.live = true;
    this.plans = S.planner.on;
    $('#plans').setAttribute('aria-pressed', String(this.plans));
    $('#world').textContent = this.worldLabel();
    this.setSpeed(1);
    this.knowKey = '';
    // what only exists with an option of the world on (farms that grow) shows only in such a world
    document.querySelectorAll<HTMLButtonElement>('#build .tool[data-type]').forEach(btn => { const B = this.content.blueprints[btn.dataset.type!]; if (B) btn.hidden = !offered(S, B); });
    // a loaded game has already told its news
    this.seenEvents = S.t > 0 ? S.events.length : 0;
    // open on the player's first settlement, wherever the seed put it
    const home = this.S.bmap.get(this.S.towns[0].store), cx = home ? home.x + home.w / 2 : this.S.world.w / 2, cy = home ? home.y + home.h / 2 : this.S.world.h / 2;
    const cam = this.view.cam;
    cam.x = cx * TS; cam.y = cy * TS;
    cam.z = Math.max(0.7, Math.min(2.2, Math.min(this.r.cw / (26 * TS), this.r.ch / (17 * TS))));
    this.select(null); this.setTool(null);
    this.updateHud();
  }

  // ---------- saves ----------
  private worldLabel() {
    const st = this.S.setup, M = this.content.maps[st.map];
    return `${M?.name ?? st.map}, ${this.content.tuning.map.sizes[st.size]?.label ?? st.size}, seed ${this.S.seed}`;
  }

  /** Autosave to this browser. Quietly does nothing where storage is unavailable or full. */
  save() {
    if (!this.live) return;
    try {
      const m = Math.floor(this.S.t / 60);
      localStorage.setItem(SAVE_KEY, JSON.stringify({ label: `${this.worldLabel()}, ${m} min in`, file: saveGame(this.S) }));
    } catch { /* not kept */ }
  }

  private savedLabel(): string | null {
    try { const v = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { label?: string } | null; return v?.label ?? null; } catch { return null; }
  }

  private continueGame() {
    try {
      const v = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { file: SaveFile };
      this.load(v.file);
    } catch (e) { this.toast(`Could not load the saved game: ${(e as Error).message}`, 'bad'); this.dialog.open(false, null); }
  }

  private load(file: SaveFile | string) {
    const S = loadGame(this.content, file);
    this.adopt(S);
    this.toast(`Loaded: ${this.worldLabel()}`);
  }

  private saveFile() {
    const blob = new Blob([JSON.stringify(saveGame(this.S))], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hearthworks-${this.S.setup.map}-${this.S.seed}-${Math.floor(this.S.t / 60)}min.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- loop ----------
  start() {
    let last = performance.now(), acc = 0, uiT = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000); last = now;
      acc += dt * this.speed;
      let steps = 0;
      while (acc >= STEP && steps < 40) { tick(this.S, STEP); acc -= STEP; steps++; }
      if (steps >= 40) acc = 0;
      this.r.draw(this.S, this.view);
      uiT -= dt;
      if (uiT <= 0) { uiT = 0.25; this.updateHud(); this.drainEvents(); }
      this.saveT += dt;
      if (this.saveT >= AUTOSAVE_SECONDS && this.speed > 0) { this.saveT = 0; this.save(); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private resize() {
    this.r.resize();
    this.measure();
    this.clampCam();
  }
  /** Panels float over the map; keep the drawer, toasts and hints clear of the HUD and build bar. */
  private measure() {
    const root = document.documentElement.style;
    root.setProperty('--buildH', ($('#buildwrap').offsetHeight || 0) + 'px');
    root.setProperty('--hudH', ($('.topstack').offsetHeight || 0) + 'px');
  }
  /** Zoom out until the whole world fits on screen, with a little sea around it. */
  private minZoom() {
    const w = this.S.world;
    return Math.min(0.5, 0.9 * Math.min(this.r.cw / (w.w * TS), this.r.ch / (w.h * TS)));
  }
  private clampCam() {
    const c = this.view.cam, w = this.S.world;
    c.x = Math.max(0, Math.min(w.w * TS, c.x)); c.y = Math.max(0, Math.min(w.h * TS, c.y)); c.z = Math.max(this.minZoom(), Math.min(3, c.z));
    // a world smaller than the screen sits in the middle of it
    if (w.w * TS * c.z <= this.r.cw) c.x = w.w * TS / 2;
    if (w.h * TS * c.z <= this.r.ch) c.y = w.h * TS / 2;
  }

  // ---------- build bar and controls ----------
  private buildBar() {
    const bar = $('#build');
    const bps = Object.values(this.content.blueprints).sort((a, b) => a.order - b.order);
    // bridges are planned by the villages only, for now; new fields are laid from a farm's inspector
    for (const B of bps.filter(B => !B.bridge && !B.field)) {
      const btn = document.createElement('button');
      btn.className = 'tool'; btn.dataset.type = B.id; btn.id = 'tool-' + B.id; btn.setAttribute('aria-pressed', 'false');
      // paving by hand is free; planners pay for the roads they lay
      const cost = B.paves ? 'free' : Object.entries(B.cost).map(([k, n]) => `${n} ${this.content.goods[k].name.toLowerCase()}`).join(', ') || 'free';
      btn.innerHTML = `<span class="sw" style="background:${B.color}"></span><span class="nm">${esc(B.name)}</span><span class="cs">${esc(cost)}</span>`;
      btn.title = B.description;
      btn.addEventListener('click', () => this.setTool(this.view.tool === B.id ? null : B.id));
      bar.appendChild(btn);
    }
    // zones: paint where the villages should put homes, farms and workshops, or build nothing
    for (const [id, name, colour, what] of ZONE_TOOLS) {
      const btn = document.createElement('button');
      btn.className = 'tool zone'; btn.dataset.type = id; btn.id = 'tool-' + id.replace(':', '-'); btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML = `<span class="sw" style="background:${colour}"></span><span class="nm">${esc(name)}</span><span class="cs">${esc(what)}</span>`;
      btn.addEventListener('click', () => this.setTool(this.view.tool === id ? null : id));
      bar.appendChild(btn);
    }
  }

  private wireControls() {
    document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(b => b.addEventListener('click', () => this.setSpeed(Number(b.dataset.speed))));
    $('#plans').addEventListener('click', () => this.setPlans(!this.plans));
    $('#routes').addEventListener('click', () => { this.view.routes = !this.view.routes; $('#routes').setAttribute('aria-pressed', String(this.view.routes)); });
    $('#newWorld').addEventListener('click', () => { this.setMenu(false); this.setSpeed(0); this.save(); this.dialog.open(true); });
    $('#saveFile').addEventListener('click', () => this.saveFile());
    const input = $<HTMLInputElement>('#loadInput');
    $('#loadFile').addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      input.value = '';
      if (!f) return;
      void f.text().then(t => { this.load(t); this.setMenu(false); this.save(); }).catch(e => this.toast(`Could not load ${f.name}: ${(e as Error).message}`, 'bad'));
    });
    // keep the autosave fresh when the tab is hidden or closed
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.save(); });
    window.addEventListener('pagehide', () => this.save());
    $('#insClose').addEventListener('click', () => this.select(null));
    $('#menuBtn').addEventListener('click', () => this.setMenu($('#drawer').hidden === true));
    $('#drawerClose').addEventListener('click', () => this.setMenu(false));
    $('#planLine').addEventListener('click', () => { const p = $('#planLine'); p.setAttribute('aria-expanded', String(p.getAttribute('aria-expanded') !== 'true')); this.measure(); });
    $('#hideUi').addEventListener('click', () => this.setUiHidden(true));
    const overlay = $<HTMLSelectElement>('#overlay');
    overlay.addEventListener('change', () => { this.view.overlay = overlay.value as View['overlay']; });
    $('#steward').addEventListener('toggle', () => this.renderSteward(true));
    $('#chronicle').addEventListener('toggle', () => this.renderChronicle());
    $('#chronExport').addEventListener('click', () => {
      const blob = new Blob([chronicleLog(this.S)], { type: 'text/markdown' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `chronicle-${this.S.setup.map}-${this.S.seed}.md`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('#showUi').addEventListener('click', () => this.setUiHidden(false));
    $('#buildToggle').addEventListener('click', () => {
      const open = $('#build').hidden === true;
      $('#build').hidden = !open; $('#buildToggle').setAttribute('aria-expanded', String(open));
      if (!open) this.setTool(null);
      this.measure();
    });
    const fs = $('#fullscreen');
    fs.hidden = !document.fullscreenEnabled;
    fs.addEventListener('click', () => this.toggleFullscreen());
    document.addEventListener('fullscreenchange', () => { fs.setAttribute('aria-pressed', String(!!document.fullscreenElement)); this.resize(); });
    const notices = $<HTMLSelectElement>('#notices');
    notices.value = this.notices;
    notices.addEventListener('change', () => { this.notices = notices.value as App['notices']; try { localStorage.setItem('hearthworks.notices', this.notices); } catch { /* not kept */ } });
    window.addEventListener('keydown', e => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
      if (e.key === 'Escape') { if (this.view.tool) this.setTool(null); else if (!$('#drawer').hidden) this.setMenu(false); else this.select(null); }
      if (e.key === ' ' && e.target === document.body) { e.preventDefault(); this.setSpeed(this.speed ? 0 : 1); }
      if (typing || !$('#newgame').hidden) return;
      if (e.key === 'h' || e.key === 'H') this.setUiHidden(!document.body.classList.contains('ui-hidden'));
      if ((e.key === 'f' || e.key === 'F') && document.fullscreenEnabled) this.toggleFullscreen();
      if ((e.key === 'r' || e.key === 'R') && this.turnable()) this.turn(e.shiftKey ? 3 : 1);
    });
  }

  private setMenu(open: boolean) {
    $('#drawer').hidden = !open;
    $('#menuBtn').setAttribute('aria-expanded', String(open));
    if (open) this.select(null);
  }

  /** Hide every panel so the map fills the screen; a small button brings them back. */
  private setUiHidden(hidden: boolean) {
    document.body.classList.toggle('ui-hidden', hidden);
    $('#showUi').hidden = !hidden;
    if (hidden) { this.setMenu(false); this.setTool(null); }
    this.measure();
  }

  private toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => this.toast('Full screen is not available here'));
  }

  setSpeed(v: number) {
    this.speed = v;
    document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === v)));
  }

  setPlans(on: boolean) {
    this.plans = on;
    for (const t of this.S.towns) { t.planner.on = on; t.planner.t = 0; }
    $('#plans').setAttribute('aria-pressed', String(on));
    this.toast(on ? 'The villagers will plan what to build' : 'Village plans off: you place the buildings');
    this.updateHud();
  }

  setTool(t: string | null) {
    this.view.tool = t;
    document.querySelectorAll<HTMLButtonElement>('.tool').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.type === t)));
    this.r.canvas.classList.toggle('placing', !!t);
    const hint = $('#toolhint');
    if (!t) { hint.hidden = true; return; }
    if (t.startsWith('zone:')) {
      hint.textContent = t === 'zone:clear' ? 'Drag across the map to clear zones.' : `Drag across the map to paint a ${ZONE_TOOLS.find(z => z[0] === t)![1].toLowerCase()}. The village plans keep to it.`;
      hint.hidden = false; this.select(null); return;
    }
    this.toolHint();
    hint.hidden = false;
    this.select(null);
  }

  /** The hint for the building being placed, with which way it faces and a button to turn it. */
  private toolHint() {
    const t = this.view.tool, hint = $('#toolhint');
    if (!t || t.startsWith('zone:')) return;
    const B = this.content.blueprints[t];
    const cost = Object.entries(B.cost).map(([k, n]) => `${n} ${this.content.goods[k].name.toLowerCase()}`).join(' and ');
    if (B.paves) { hint.textContent = `Drag across the map to lay ${B.name.toLowerCase()}. Esc or the ${B.name} button to stop.`; return; }
    const way = ['south', 'west', 'north', 'east'][this.view.rot];
    hint.innerHTML = `<span>${esc(`Tap open land to place a ${B.name}, its door facing ${way}. Carriers will bring ${cost} to build it.`)}</span> <button type="button" class="btn" id="turnTool" title="Turn it a quarter (R; Shift+R turns back)">Turn</button>`;
    $('#turnTool').addEventListener('click', () => this.turn(1));
  }

  /** Can the building being placed be turned? Anything but paving. */
  private turnable() { const t = this.view.tool; return !!t && !t.startsWith('zone:') && !this.content.blueprints[t].paves; }

  /** Turn the building being placed a quarter: `by` 1 clockwise from south to west, 3 back. */
  private turn(by: number) { this.view.rot = (this.view.rot + by) % 4; this.toolHint(); }

  // ---------- input ----------
  private wireInput() {
    const cv = this.r.canvas, ptrs = new Map<number, { x: number; y: number }>();
    let drag: { sx: number; sy: number; cx: number; cy: number; moved: boolean } | null = null;
    let pinch: { d: number; z: number; w: { x: number; y: number } } | null = null;
    let painting = false;
    const cam = this.view.cam;
    const hover = (sx: number, sy: number) => { const w = this.r.toWorld(cam, sx, sy); this.view.hover = { x: Math.floor(w.x / TS), y: Math.floor(w.y / TS) }; };
    const paint = () => {
      const h = this.view.hover, t = this.view.tool;
      if (!h || !t) return;
      if (t.startsWith('zone:')) {
        // a 3 by 3 brush
        const w = this.S.world, z = t === 'zone:clear' ? 0 : 1 + ZONES.indexOf(t.slice(5) as (typeof ZONES)[number]);
        for (let y = h.y - 1; y <= h.y + 1; y++) for (let x = h.x - 1; x <= h.x + 1; x++) if (x >= 0 && y >= 0 && x < w.w && y < w.h) w.zone[y * w.w + x] = z;
        return;
      }
      if (canPlace(this.S, t, h.x, h.y)) placeBuilding(this.S, t, h.x, h.y, true);
    };

    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (ptrs.size === 2) {
        const [p, q] = [...ptrs.values()];
        pinch = { d: Math.hypot(p.x - q.x, p.y - q.y) || 1, z: cam.z, w: this.r.toWorld(cam, (p.x + q.x) / 2, (p.y + q.y) / 2) };
        drag = null; painting = false; return;
      }
      if (e.button === 2) { this.setTool(null); return; }
      drag = { sx: e.offsetX, sy: e.offsetY, cx: cam.x, cy: cam.y, moved: false };
      hover(e.offsetX, e.offsetY);
      const t = this.view.tool;
      if (t && (t.startsWith('zone:') || this.content.blueprints[t].paves)) { painting = true; paint(); }
    });
    cv.addEventListener('pointermove', e => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pinch && ptrs.size >= 2) {
        const [p, q] = [...ptrs.values()], d = Math.hypot(p.x - q.x, p.y - q.y), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
        cam.z = Math.max(this.minZoom(), Math.min(3, (pinch.z * d) / pinch.d));
        cam.x = pinch.w.x - (mx - this.r.cw / 2) / cam.z; cam.y = pinch.w.y - (my - this.r.ch / 2) / cam.z;
        this.clampCam(); return;
      }
      hover(e.offsetX, e.offsetY);
      if (!drag) return;
      if (painting) { paint(); return; }
      const dx = e.offsetX - drag.sx, dy = e.offsetY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) > 6) drag.moved = true;
      if (drag.moved) { cam.x = drag.cx - dx / cam.z; cam.y = drag.cy - dy / cam.z; this.clampCam(); }
    });
    const end = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
      if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
      if (drag && !drag.moved && !painting && e.type === 'pointerup') this.tap();
      drag = null; painting = false;
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { if (!drag) this.view.hover = null; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const w = this.r.toWorld(cam, e.offsetX, e.offsetY);
      cam.z = Math.max(this.minZoom(), Math.min(3, cam.z * Math.exp(-e.deltaY * 0.0015)));
      cam.x = w.x - (e.offsetX - this.r.cw / 2) / cam.z; cam.y = w.y - (e.offsetY - this.r.ch / 2) / cam.z;
      this.clampCam();
    }, { passive: false });
  }

  private tap() {
    const h = this.view.hover, S = this.S;
    if (!h) return;
    const t = this.view.tool;
    if (t && t.startsWith('zone:')) return;
    if (t && !this.content.blueprints[t].paves) {
      const rot = this.view.rot, o = ghostOrigin(S, t, h, rot);
      if (canPlace(S, t, o.x, o.y, rot)) { const b = placeBuilding(S, t, o.x, o.y, false, rot); this.setTool(null); this.select(b); }
      else this.toast(`Can't build there: ${placeProblem(S, t, o.x, o.y, rot)}`, 'bad');
      return;
    }
    if (!t) {
      const w = S.world, inside = h.x >= 0 && h.y >= 0 && h.x < w.w && h.y < w.h;
      const id = inside ? w.bgrid[h.y * w.w + h.x] : -1;
      this.select(id >= 0 ? S.bmap.get(id) ?? null : null);
      // a barbarian camp is no building: a tap on one says who camps there and how they stand with the settlements
      const camp = id < 0 ? S.camps.find(c => Math.hypot(c.x - (h.x + 0.5), c.y - (h.y + 0.5)) <= 1.5) : undefined;
      if (camp) this.toast(this.campText(camp));
    }
  }

  /** A barbarian camp in a line: how many, whether they are out raiding, and any settlement that sends them bread. */
  private campText(c: State['camps'][number]) {
    const S = this.S, n = Math.floor(c.strength), friend = c.friend !== null ? S.towns[c.friend] : undefined;
    const gifts = Math.round(c.goodwill * this.content.tuning.hardship.giftsToSettle), of = this.content.tuning.hardship.giftsToSettle;
    const who = `A barbarian camp of ${n} raider${n === 1 ? '' : 's'}`;
    if (friend && c.goodwill > 0) return `${who}, at peace with ${friend.name}: ${gifts} of ${of} gifts of bread, and they will come and settle`;
    return `${who}${c.raid ? `, out raiding ${S.towns[c.raid.town]?.name ?? 'a settlement'}` : ''}. ${S.trade ? 'Gifts of bread from a settlement with some to spare would keep it at peace.' : 'Settlers who reach the wilds where it stands break it up.'}`;
  }

  // ---------- HUD and toasts ----------
  private updateHud() {
    const S = this.S, totals: Record<string, number> = {};
    for (const b of S.buildings) if (this.content.blueprints[b.type].storage && !b.site) for (const k in b.inv) totals[k] = (totals[k] || 0) + b.inv[k];
    // the four staples always; other goods once there is some in storage
    $('#res').innerHTML = Object.values(this.content.goods).sort((a, b) => a.order - b.order).filter(g => g.order <= 4 || (totals[g.id] || 0) >= 1).map(g =>
      `<span class="chip" title="${esc(g.name)} in storage"><span class="dot" style="background:${g.color}"></span><span class="lbl">${esc(g.name)}</span> <b>${n0(totals[g.id])}</b></span>`).join('');
    const vs = villagers(S), cap = S.buildings.reduce((n, b) => n + (b.site ? 0 : this.content.blueprints[b.type].homes), 0), bots = S.agents.length - vs.length;
    const carriers = vs.filter(a => a.role === 'carrier').length, m = Math.round(S.mood * 100);
    const mc = m >= 80 ? 'mood-good' : m >= 50 ? 'mood-warn' : 'mood-bad';
    const line = $('#planLine'), on = S.planner.on, multi = S.towns.length > 1;
    line.classList.toggle('off', !on);
    $('#planText').innerHTML = on
      ? S.towns.map(t => {
        // a settlement's form, and its districts once it has more than one
        const d = hubs(S, t).length, form = formOf(S, t), tag = `${form}${d > 1 ? `, ${d} districts` : ''}`;
        return `<b class="tn" title="${esc(tag)}">${esc(multi ? t.name : form[0].toUpperCase() + form.slice(1))}</b> ` + esc(t.planner.status);
      }).join(' <br>')
      : 'Plans are off: you place the buildings';
    this.renderKnowledge();
    this.renderSteward(false);
    this.renderChronicle();
    const season = seasonOf(S), year = Math.floor(S.t / this.content.tuning.seasons.yearSeconds) + 1;
    $('#meta').innerHTML = (season ? `<span class="chip season ${season}" title="Year ${year}"><span class="lbl">${season[0].toUpperCase() + season.slice(1)}</span> ${['🌱', '☀', '🍂', '❄'][['spring', 'summer', 'autumn', 'winter'].indexOf(season)]} <b>Y${year}</b></span>` : '') + `<span class="chip" title="Villagers and beds"><span class="lbl">Villagers</span> 👤 <b>${vs.length}/${cap}</b></span><span class="chip" id="chipCarriers">Carriers <b>${carriers}</b></span><span class="chip ${mc}" title="Mood"><span class="lbl">Mood</span> ☺ <b>${m}%</b></span>` + (bots ? `<span class="chip" title="Bots"><span class="lbl">Bots</span> ⚙ <b>${bots}</b></span>` : '');
    this.updateInspector();
  }

  /** Per settlement: what it has learned beyond its founding, how, and whether it has proven it; and what is still undiscovered. */
  /** Which settlement the steward panel steers. */
  private stewardTown = 0;
  private stewardKey = '';

  /**
   * The steward panel: for one settlement, a priority for each need, the line of thought to encourage,
   * the planner's pace, and the advisor's suggestions. Rebuilt only when something it shows changes,
   * so a select being used is never replaced under the pointer.
   */
  private renderSteward(force: boolean) {
    const panel = $<HTMLDetailsElement>('#steward');
    if (!panel.open) return;
    const S = this.S, t = S.towns[Math.min(this.stewardTown, S.towns.length - 1)];
    if (!t) return;
    const unknown = Object.values(this.content.blueprints).filter(B => B.discovery && !(B.id in t.knows));
    const tips = advise(S, t);
    // trade so far: the three biggest of each way, in whole loads
    const top = (r: Record<string, number>) => Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g, n]) => `${n} ${(this.content.goods[g]?.name ?? g).toLowerCase()}`).join(', ');
    const trade = S.trade && S.towns.length > 1 ? [top(t.trade.exported) || 'nothing yet', top(t.trade.imported) || 'nothing yet'] : null;
    // hardship: the defence at its first yard against raiders, and camps in reach
    const D = S.hardship ? defence(S, t) : null, near = S.hardship ? S.camps.filter(c => { const y = S.bmap.get(t.store); return !!y && Math.hypot(c.x - y.x, c.y - y.y) <= this.content.tuning.hardship.raidReach; }).length : 0;
    const peace = S.hardship ? S.camps.filter(c => c.friend === t.id && c.goodwill > 0).length : 0;
    const guard = D ? [Math.round(D.total), D.warned, near, peace] : null;
    const key = JSON.stringify([t.id, t.levers, t.laws, guard, t.roads.length, 'road' in t.knows, t.belts.length, 'conveyor' in t.knows, unknown.map(B => B.id), tips, S.towns.length, trade, t.custom, t.naming, t.rites.length, t.age, t.feasts.join(), S.t < t.feastUntil, t.charted.length, S.agents.some(a => a.visit?.explore && a.visit.from === t.id)]);
    if (!force && key === this.stewardKey) return;
    this.stewardKey = key;
    const needs: [string, string][] = [
      ['bread', 'Bread'], ['wheat', 'Wheat'], ['planks', 'Planks'], ['logs', 'Logs'], ['beds', 'Homes for newcomers'],
      ['hauling', 'Hauling'], ['crossing', 'Reaching the neighbours'], ['detours', 'Getting across water'],
      ...(S.hardship ? [['fire', 'Guarding against fire'], ['flood', 'Holding back floods'], ['sickness', 'Tending the sick'], ['raids', 'Defence against raiders']] as [string, string][] : []),
    ];
    const levels: [number, string][] = [[0.5, 'Low'], [1, 'Normal'], [2, 'High'], [4, 'First']];
    const sel = (id: string, v: number, opts: [number, string][]) => `<select data-lever="${id}">${opts.map(([n, l]) => `<option value="${n}"${n === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    let html = '';
    if (S.towns.length > 1) html += `<div class="steward-grid"><span>Settlement</span><select id="stewardPick">${S.towns.map(o => `<option value="${o.id}"${o.id === t.id ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select></div>`;
    html += '<div class="steward-grid">' + needs.map(([k, label]) => `<span>${label}</span>${sel('p:' + k, t.levers.priority[k] ?? 1, levels)}`).join('');
    html += `<span>Encourage thinking about</span><select data-lever="encourage"><option value="">Nothing in particular</option>${unknown.map(B => `<option value="${B.id}"${t.levers.encourage === B.id ? ' selected' : ''}>${esc(B.name)}</option>`).join('')}</select>`;
    html += `<span>Pace</span>${sel('pace', t.levers.pace, [[0.5, 'Unhurried'], [1, 'Normal'], [2, 'Brisk']])}</div>`;
    // the laws for hard times
    html += `<div class="steward-grid"><span>Rationing</span><select data-law="rationing"><option value="0"${t.laws.rationing ? '' : ' selected'}>Eat as usual</option><option value="1"${t.laws.rationing ? ' selected' : ''}>Ration food</option></select>`;
    html += `<span>Working hours</span><select data-law="hours">${(['short', 'normal', 'long'] as const).map(h => `<option value="${h}"${t.laws.hours === h ? ' selected' : ''}>${{ short: 'Short', normal: 'Normal', long: 'Long' }[h]}</option>`).join('')}</select>`;
    html += `<span>The hungry</span><select data-law="leave"><option value="1"${t.laws.leave ? ' selected' : ''}>May leave</option><option value="0"${t.laws.leave ? '' : ' selected'}>Must stay</option></select></div>`;
    if (S.plannedRoads) html += `<div class="steward-grid"><span>Roads</span><span>${t.roads.length ? `${t.roads.length} laid` : 'road' in t.knows ? 'none laid yet' : 'not thought of yet'}</span></div>`;
    if (t.belts.length || 'conveyor' in t.knows) html += `<div class="steward-grid"><span>Conveyors</span><span>${t.belts.length ? `${t.belts.length} laid` : 'none laid yet'}</span></div>`;
    if (guard) html += `<div class="steward-grid"><span>Defence</span><span>${guard[0]}${guard[1] ? ', a lookout on watch' : ', no lookout'}</span><span>Camps in reach</span><span>${guard[2] || 'none'}</span>${guard[3] ? `<span>At peace</span><span>${guard[3] === 1 ? 'a camp it sends bread to' : `${guard[3]} camps it sends bread to`}</span>` : ''}</div>`;
    // the islands it has charted, and an explorer out at sea
    if (S.charts) {
      const out = S.agents.some(a => a.visit?.explore && a.visit.from === t.id);
      html += `<div class="steward-grid"><span>Charts</span><span>${t.charted.length === 1 ? 'its own island' : `${t.charted.length} islands`}${out ? ', an explorer at sea' : ''}</span></div>`;
    }
    // its boats, moored and out
    if (S.ships) {
      const fleet = S.boats.filter(b => b.town === t.id), out = fleet.filter(b => b.crew.length).length;
      html += `<div class="steward-grid"><span>Boats</span><span>${fleet.length ? `${esc(fleet.map(b => b.name).join(', '))}${out ? ` (${out} out)` : ''}` : 'none yet'}</span></div>`;
    }
    // its age, and what the next one would let it think of
    const next = this.content.eras[t.age + 1], opens = next?.unlocks.map(id => this.content.blueprints[id]?.name ?? id).join(', ');
    html += `<div class="steward-grid"><span>Age</span><span>${esc(this.content.eras[t.age]?.name ?? '')}</span>${opens ? `<span>The next age opens</span><span>${esc(opens)}</span>` : ''}</div>`;
    if (S.people) {
      const word = { burial: 'Burial', cremation: 'Cremation', ship: 'Ship burial' }[t.custom];
      html += `<div class="steward-grid"><span>Custom for the dead</span><span>${word}${t.rites.length ? `, ${t.rites.length} waiting` : ''}</span>`;
      // the feasts it keeps through the year, and whether one lately held lifts its mood
      html += `<span>Names its children</span><span>${esc(NAMING[t.naming] ?? '')}</span>`;
      if (S.seasons) html += `<span>Feasts</span><span>${t.feasts.length ? t.feasts.map(f => FEAST[f].name).join(', ') : 'none'}${S.t < t.feastUntil ? ' (feasting now)' : ''}</span>`;
      html += '</div>';
    }
    if (trade) html += `<div class="steward-grid"><span>Traded away</span><span>${esc(trade[0])}</span><span>Traded for</span><span>${esc(trade[1])}</span></div>`;
    if (tips.length) html += `<ul class="advice">${tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    $('#stewardBody').innerHTML = html;
    $('#stewardTown').textContent = t.name;
    $('#stewardPick')?.addEventListener('change', e => { this.stewardTown = Number((e.target as HTMLSelectElement).value); this.renderSteward(true); });
    document.querySelectorAll<HTMLSelectElement>('#stewardBody [data-lever]').forEach(s => s.addEventListener('change', () => {
      const id = s.dataset.lever!;
      if (id === 'encourage') t.levers.encourage = s.value || null;
      else if (id === 'pace') t.levers.pace = Number(s.value);
      else t.levers.priority[id.slice(2)] = Number(s.value);
      this.renderSteward(true);
    }));
    document.querySelectorAll<HTMLSelectElement>('#stewardBody [data-law]').forEach(s => s.addEventListener('change', () => {
      const id = s.dataset.law!;
      if (id === 'rationing') t.laws.rationing = s.value === '1';
      else if (id === 'leave') t.laws.leave = s.value === '1';
      else t.laws.hours = s.value as typeof t.laws.hours;
      this.renderSteward(true);
    }));
  }

  /** The chronicle, newest first: every settlement's history as it happened. */
  private chronShown = -1;
  private renderChronicle() {
    const S = this.S, n = S.chronicle.length;
    $('#chronCount').textContent = String(n);
    if (!$<HTMLDetailsElement>('#chronicle').open || n === this.chronShown) return;
    this.chronShown = n;
    const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    // a season comes to every settlement at once: one line for all of them
    const lines: { t: number; text: string }[] = [];
    let turn: { t: number; text: string; names: string[] } | null = null;
    for (const c of [...S.chronicle].reverse()) {
      const m = c.kind === 'season' ? /^(\w+) came to (.+) in year (\d+)$/.exec(c.text) : null;
      if (m && turn && turn.t === c.t && turn.text === `${m[1]}|${m[3]}`) { turn.names.unshift(m[2]); continue; }
      if (m) { turn = { t: c.t, text: `${m[1]}|${m[3]}`, names: [m[2]] }; lines.push(turn); continue; }
      turn = null;
      lines.push(c);
      if (lines.length >= 80) break;
    }
    const said = (l: { text: string; names?: string[] }) => {
      if (!l.names) return l.text;
      const [season, year] = l.text.split('|'), who = l.names.length === S.towns.length && l.names.length > 2 ? 'every settlement' : l.names.length > 1 ? `${l.names.slice(0, -1).join(', ')} and ${l.names[l.names.length - 1]}` : l.names[0];
      return `${season} came to ${who} in year ${year}`;
    };
    $('#chronList').innerHTML = lines.slice(0, 80).map(l => `<li><b>${clock(l.t)}</b>${esc(said(l))}</li>`).join('');
  }

  private renderKnowledge() {
    const S = this.S, bps = Object.values(this.content.blueprints).sort((a, b) => a.order - b.order);
    const discoverable = bps.filter(B => B.discovery);
    const key = S.towns.map(t => villagers(S).filter(a => a.home?.town === t.id).length + ':' + Object.entries(t.knows).map(([id, k]) => id + k.verified.length).join() + ':' + scholarly(S, t).map(x => x.waits[0]).join('')).join('|');
    if (key === this.knowKey) return;
    this.knowKey = key;
    let html = '', learned = 0;
    for (const t of S.towns) {
      const pop = villagers(S).filter(a => a.home?.town === t.id).length;
      html += `<h3>${esc(t.name)}<small>${pop} villagers</small></h3><ul>`;
      for (const B of bps) {
        const k = t.knows[B.id];
        if (!k || k.by === 'founders') continue;
        learned++;
        const proven = verifiedHere(t, k) ? ' · <span class="ok">proven here</span>' : ' · not yet tried';
        html += `<li><b>${esc(B.name)}</b>: ${esc(originText(t, k))}${proven}</li>`;
      }
      const scholars = new Map(scholarly(S, t).map(x => [x.B.id, x]));
      for (const B of discoverable) if (!t.knows[B.id] && offered(S, B)) {
        const age = ageNeeded(S, B.id), later = t.age < age ? `, once it has reached the Age of ${this.content.eras[age].name}` : '';
        const first = B.discovery!.after.filter(id => !t.knows[id]).map(id => `the ${this.content.blueprints[id]?.name ?? id}`);
        const after = first.length ? `, once it knows ${first.join(' and ')}` : '';
        const sc = scholars.get(B.id);
        // a discovery only scholars make: say so, and whether this settlement has a university at work to make it
        if (sc) html += `<li class="unknown"><b>${esc(B.name)}</b>: not yet thought of, and only scholars think of it. It comes when ${esc(NEED_TEXT[B.discovery!.need] ?? B.discovery!.need)}${esc(after + later)}, while a university has a scholar at work. ${sc.waits === 'university' ? `<span class="warn">Waits on a university: ${esc(t.name)} has none at work.</span>` : sc.waits === 'ready' ? '<span class="ok">Its scholars are on it.</span>' : 'Its scholars are ready for it.'}</li>`;
        else html += `<li class="unknown"><b>${esc(B.name)}</b>: not yet thought of. It comes when ${esc(NEED_TEXT[B.discovery!.need] ?? B.discovery!.need)}${esc(after + later)}.</li>`;
      }
      html += '</ul>';
    }
    const founding = bps.filter(B => !B.discovery && !B.paves).map(B => B.name).join(', ');
    html += `<p class="founding">Every settlement starts out knowing: ${esc(founding)}.</p>`;
    $('#knowList').innerHTML = html;
    $('#knowCount').textContent = `${learned} learned`;
  }

  private drainEvents() {
    const ev = this.S.events;
    if (this.seenEvents > ev.length) this.seenEvents = 0;
    // routine news (buildings finished, newcomers, plans) shows only when notices are set to everything
    for (const e of ev.slice(this.seenEvents)) {
      if (this.notices === 'off' || (this.notices === 'important' && e.minor)) continue;
      this.toast(e.text, e.kind === 'info' ? '' : e.kind);
    }
    this.seenEvents = ev.length;
  }
  toast(msg: string, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast panel ' + kind; el.textContent = msg;
    const box = $('#toasts'); box.prepend(el);
    while (box.children.length > 2) box.lastChild!.remove();
    setTimeout(() => el.remove(), 3200);
  }

  // ---------- inspector ----------
  select(b: Building | null) { this.view.sel = b; this.confirmDel = false; this.renderActions(); this.updateInspector(); }

  private renderActions() {
    const b = this.view.sel, acts = $('#insActs');
    acts.innerHTML = '';
    if (!b || b.dead) return;
    const B = this.content.blueprints[b.type];
    if (B.workers && !b.site) {
      const p = document.createElement('button');
      p.className = 'btn'; p.id = 'act-pause'; p.textContent = b.paused ? 'Resume' : 'Pause'; p.setAttribute('aria-pressed', String(b.paused));
      p.addEventListener('click', () => { b.paused = !b.paused; this.renderActions(); this.updateInspector(); });
      acts.appendChild(p);
    }
    // farms that grow: lay new fields behind it
    if (this.S.farms && B.grows && !b.site && b.size < maxSize(B)) {
      const g = document.createElement('button');
      g.className = 'btn'; g.id = 'act-grow'; g.textContent = 'Grow fields';
      g.title = `Lay new fields behind it to grow it into ${B.grows.names[b.size + 1].toLowerCase()}, with a place for one more hand`;
      g.addEventListener('click', () => { const why = growProblem(this.S, b); if (why) this.toast(`It cannot grow: ${why}`, 'bad'); else { growFarm(this.S, b); this.toast(`New fields are being laid behind the ${sizeName(this.S, b).toLowerCase()}`); } this.renderActions(); this.updateInspector(); });
      acts.appendChild(g);
    }
    if (!B.bridge && !B.field && !b.size) {
      const r = document.createElement('button');
      r.className = 'btn'; r.id = 'act-turn'; r.textContent = 'Turn'; r.title = 'Turn it a quarter about its centre, its door to the next side';
      r.addEventListener('click', () => { if (!turnBuilding(this.S, b)) this.toast('No room to turn it there', 'bad'); this.updateInspector(); });
      acts.appendChild(r);
    }
    const d = document.createElement('button');
    d.className = 'btn danger' + (this.confirmDel ? ' armed' : ''); d.id = 'act-demolish';
    d.textContent = this.confirmDel ? (b.site ? 'Confirm: cancel site' : 'Confirm demolish') : (b.site ? 'Cancel site' : 'Demolish');
    d.addEventListener('click', () => { if (!this.confirmDel) { this.confirmDel = true; this.renderActions(); return; } demolish(this.S, b); this.select(null); });
    acts.appendChild(d);
    if (this.confirmDel) {
      const k = document.createElement('button');
      k.className = 'btn'; k.id = 'act-keep'; k.textContent = 'Keep it';
      k.addEventListener('click', () => { this.confirmDel = false; this.renderActions(); });
      acts.appendChild(k);
    }
  }

  private updateInspector() {
    const panel = $('#inspector'), b = this.view.sel, S = this.S;
    if (!b || b.dead) { panel.hidden = true; return; }
    panel.hidden = false;
    const B = this.content.blueprints[b.type], G = this.content.goods, T = this.content.tuning;
    $('#insSw').style.background = B.color;
    $('#insName').textContent = b.site ? `${B.name} (site)` : sizeName(S, b);
    $('#insDesc').textContent = B.description;
    const why = $('#insWhy');
    why.hidden = !b.reason;
    if (b.reason) why.innerHTML = `<b>${b.site ? 'Planned' : 'Built'} by the village:</b> ${esc(b.reason)}`;
    const row = (k: string, v: string | number) => `<dt>${esc(k)}</dt><dd>${esc(String(v))}</dd>`;
    let rows = '', progress: number | null = null;
    if (b.site) {
      for (const k in B.cost) rows += row(`${G[k].name} delivered`, `${n0(b.inv[k])} / ${B.cost[k]}`) + row('On the way', n0(b.incoming[k]));
      const total = Object.values(B.cost).reduce((s, n) => s + n, 0);
      const have = Object.keys(B.cost).reduce((s, k) => s + Math.min(B.cost[k], b.inv[k] || 0), 0);
      progress = have >= total ? b.build / T.production.buildSeconds : have / (total || 1);
    } else if (B.homes) {
      rows += row('Residents', `${b.residents.length} / ${B.homes}`);
      // with people on: who lives here, by age
      if (S.people) {
        const P = T.people, ppl = b.residents.map(id => S.amap.get(id)).filter(a => !!a);
        const kids = ppl.filter(a => a!.role === 'child').length, old = ppl.filter(a => S.t - a!.born >= P.elderSeconds).length;
        rows += row('Household', `${ppl.length - kids - old} adults` + (kids ? `, ${kids} ${kids > 1 ? 'children' : 'child'}` : '') + (old ? `, ${old} retired` : ''));
        // by name: grown-ups first, then the children
        const named = [...ppl].sort((x, y) => x!.born - y!.born).map(a => a!.role === 'child' ? `${called(a!)} (a child)` : S.t - a!.born >= P.elderSeconds ? `${called(a!)} (retired)` : called(a!));
        if (named.length) rows += row('Names', named.join(', '));
      }
      const tier = homeTier(S, b), N = T.needs, su = surroundings(S, b);
      rows += row('Tier', ['Hungry', 'Fed', 'Comfortable', 'Well off'][tier]);
      // what is on the shelf: what it keeps stocked, then the other foods and the goods it has, each with what is on the way
      const have = (g: string) => `${n0(b.inv[g])}` + ((b.incoming[g] || 0) > 0 ? ` (+${n0(b.incoming[g])} on the way)` : '');
      const some = (g: string) => (b.inv[g] || 0) >= 1 || (b.incoming[g] || 0) > 0;
      for (const k in B.keepStocked) rows += row(`${G[k].name} at home`, `${have(k)} of ${B.keepStocked[k]}`);
      const list = (gs: string[]) => gs.filter(some).map(g => `${n0(b.inv[g])} ${G[g].name.toLowerCase()}` + ((b.incoming[g] || 0) > 0 ? ` (+${n0(b.incoming[g])})` : '')).join(', ');
      // farms that grow: the foods of the diet on the shelf, and how varied its meals have been lately
      if (S.farms) {
        const foods = list(T.farms.diet.filter(g => !(g in B.keepStocked)));
        if (foods) rows += row('Other food', foods);
        const ate = Object.keys(b.ate).filter(f => S.t - b.ate[f] <= T.farms.dietSeconds).map(f => G[f]?.name.toLowerCase() ?? f);
        rows += row('Eaten lately', ate.length ? (ate.length > 1 ? `${ate.slice(0, -1).join(', ')} and ${ate[ate.length - 1]}` : ate[0]) : 'nothing yet');
      }
      if (S.seasons && !(('logs') in B.keepStocked)) rows += row('Firewood', some('logs') ? have('logs') : seasonOf(S) === 'winter' ? 'none: the home is cold' : 'none yet');
      const goods = list([...N.tierTwo, ...N.tierThree]);
      if (goods) rows += row('Goods', goods);
      // hard times: sickness in the house, and what keeps it well
      if (S.hardship && b.residents.length) {
        const keep = [clean(S, b) && 'kept clean by a bathhouse', guarded(S, b, 'sickness') && 'a healer within reach'].filter(Boolean);
        rows += row('Health', (b.sick > 0 ? 'Sickness in the house' : 'In good health') + (keep.length ? `; ${keep.join(', ')}` : ''));
      }
      const good = [su.trees > 0 && 'trees', su.water > 0 && 'water'].filter(Boolean), bad = [su.noise > 0 && 'noise', su.crowd > 0 && 'crowding', su.sites > 0 && 'building work'].filter(Boolean);
      rows += row('Surroundings', `${Math.round(su.score * 100)}%` + (good.length ? `, ${good.join(' and ')}` : '') + (bad.length ? `; ${bad.join(', ')}` : ''));
    } else if (B.storage) {
      const held = Object.values(b.inv).reduce((s, n) => s + n, 0);
      if (B.capacity) rows += row('Holding', `${n0(held)} / ${B.capacity}`);
      if (B.keeps) rows += row('Keeps', B.keeps.map(k => G[k].name).join(', '));
      for (const g of Object.values(G).sort((a, b) => a.order - b.order)) if ((b.inv[g.id] || 0) >= 1 || g.order <= 4) rows += row(g.name, n0(b.inv[g.id]));
    } else if (B.carts || B.oxen) {
      // a cart shed or an ox barn: how many of its carts are out, and the oxen's feed
      let out = 0;
      for (const a of S.agents) if (a.cart === b.id) out++;
      const n = B.oxen || B.carts, kind = B.oxen ? 'Ox carts' : 'Handcarts', L = T.logistics;
      rows += row(`${kind} out`, `${out} of ${n}`) + row('Takes', `${B.oxen ? L.oxCarry : L.cartCarry} goods, on jobs of ${B.oxen ? L.oxMinTiles : L.cartMinTiles}+ tiles`);
      for (const k in B.keepStocked) rows += row(`${G[k].name} for the oxen`, `${n0(b.inv[k])} / ${B.keepStocked[k]}` + ((b.incoming[k] || 0) > 0 ? ` (+${n0(b.incoming[k])})` : '') + (B.oxen && (b.inv[k] || 0) < L.oxFeed ? ': the oxen wait for feed' : ''));
    } else if (B.couriers) {
      const busy = b.bots.filter(id => S.amap.get(id)?.task).length;
      rows += row('Bots', b.bots.length) + row('Hauling now', busy) + row('Range', `${B.couriers.radius} tiles`);
    } else if (B.workers) {
      const w = b.worker !== null ? S.amap.get(b.worker) : undefined, n = places(S, b);
      if (n > 1) { const ids = crew(b), at = ids.filter(id => S.amap.get(id)?.state === 'working').length; rows += row('Hands', `${ids.length} of ${n}` + (ids.length > at ? `, ${ids.length - at} walking over` : '')); }
      else rows += row('Worker', w ? (w.state === 'working' ? 'On the job' : 'Walking over') : 'None free');
      // farms that grow: its size and fields, and what it has made
      if (S.farms && B.grows) rows += row('Size', `${sizeName(S, b)}, ${b.size + 1} of ${B.grows.names.length}`) + row('Fields', `${b.w * b.h} tiles`) + row('Made', `${n0(b.made)} ${Object.keys(B.output).map(k => G[k].name.toLowerCase()).join(' and ')}`);
      if (B.ripens && b.plantT < B.ripens) rows += row('Bears in', `${Math.ceil(B.ripens - b.plantT)}s`);
      for (const k in B.input) rows += row(`${G[k].name} in`, `${n0(b.inv[k])} / ${B.keepStocked[k] ?? B.input[k]}` + ((b.incoming[k] || 0) > 0 ? ` (+${n0(b.incoming[k])})` : ''));
      for (const k in B.output) rows += row(`${G[k].name} out`, `${n0(b.inv[k])} / ${capOf(S, b)}`);
      if (B.learning === 'library') {
        // the shelves: every record its settlement holds beyond founding knowledge, with who thought of it
        const t = S.towns[b.town], shelf = t ? Object.entries(t.knows).filter(([, k]) => k.by !== 'founders') : [];
        // its readers: grown villagers schooled to read, who learn from it and from other libraries
        if (S.people && t) { const printed = learningAt(S, t.id, 'press'), readers = villagers(S).filter(a => a.home?.town === t.id && reads(S, a, printed)).length; rows += row('Readers', readers ? `${readers}, reading ${S.towns.length > 1 ? 'what other libraries hold, and ' : ''}the trades written down here` : 'none yet: a school teaches the children to read'); }
        rows += row('On the shelves', shelf.length ? '' : 'nothing yet beyond what the founders knew');
        for (const [id, k] of shelf) rows += row(this.content.blueprints[id]?.name ?? id, `${originText(t!, k)}; ` + (k.verified.length ? `proven in ${k.verified.length === 1 ? 'one settlement' : `${k.verified.length} settlements`}` : 'not yet proven'));
      } else if (B.learning === 'school') {
        // its pupils: the settlement's children, who grow up able to read while it is at work
        const t = S.towns[b.town], ppl = t ? villagers(S).filter(a => a.home?.town === t.id) : [];
        const kids = ppl.filter(a => a.role === 'child').length, readers = ppl.filter(a => a.schooled && a.role !== 'child').length;
        rows += row('Pupils', kids ? `${kids} ${kids > 1 ? 'children' : 'child'} of ${t!.name}` : 'no children yet') + row('Grown readers', readers || 'none yet');
      } else if (B.learning === 'university') {
        // its scholars: invention under strain comes faster, and the ideas only scholars find, with what each waits on
        const t = S.towns[b.town], K = T.knowledge, at = w?.state === 'working';
        rows += row('Work', at ? `Pursuing lines of inquiry: ideas come ${K.universityFactor}× as fast, at ${Math.round(K.universityThreshold * 100)}% of the strain` : 'Its scholar is away: no inquiries');
        if (t) {
          const ideas = Object.values(this.content.blueprints).filter(D => D.discovery?.university && offered(S, D)).sort((a, c) => a.order - c.order), waits = new Map(scholarly(S, t).map(x => [x.B.id, x]));
          rows += row('Only scholars find', ideas.length ? '' : 'nothing yet');
          for (const D of ideas) {
            const x = waits.get(D.id), need = NEED_TEXT[D.discovery!.need] ?? D.discovery!.need;
            rows += row(D.name, !x ? (t.knows[D.id]?.by === t.name ? 'thought of here' : 'known') : x.waits === 'university' ? 'waits on a scholar at work'
              : x.waits === 'after' ? `waits on the ${x.missing.map(id => this.content.blueprints[id]?.name ?? id).join(' and ')}` : x.waits === 'age' ? `waits on the Age of ${this.content.eras[ageNeeded(S, D.id)].name}`
              : x.waits === 'need' ? `comes when ${need}` : `on it: ${need}`);
          }
        }
      } else if (B.learning === 'press') {
        // its readers: every grown villager, while the printer is at work
        const t = S.towns[b.town], grown = t ? villagers(S).filter(a => a.home?.town === t.id && a.role !== 'child').length : 0;
        rows += row('Readers', w?.state === 'working' ? `all ${grown} grown villagers of ${t?.name ?? 'its settlement'}` : 'only the schooled, while its printer is away');
        rows += row('Library', t && learningAt(S, t.id, 'library', false) ? 'its books reach every home' : 'none: there is nothing to read without one');
      }
      else if (B.mills) {
        // a mill: the workplaces it mills within reach
        const near = S.buildings.filter(o => o.town === b.town && !o.site && B.mills!.types.includes(o.type) && Math.hypot(ctr(o).x - ctr(b).x, ctr(o).y - ctr(b).y) <= B.mills!.radius).length;
        const kinds = B.mills.types.map(k => (this.content.blueprints[k]?.name.toLowerCase() ?? k).replace(/([^aeiou])y$/, '$1ie') + 's'), names = kinds.length > 1 ? `${kinds.slice(0, -1).join(', ')} or ${kinds[kinds.length - 1]}` : kinds[0];
        rows += row('Work', `${near} ${names} within ${B.mills.radius} tiles work with ${B.mills.boon}: ${B.mills.factor}× what each batch yields` + (w?.state === 'working' ? '' : `, while its worker is in`));
      }
      else if (B.hall) {
        // the planner at their desk: how skilled, and how many of the settlement's own sites it keeps open at once
        const t = S.towns[b.town], skill = w ? Math.round((w.skill[b.type] || 0) * 100) : 0;
        rows += row('Planner', w ? `${w.name || 'a villager'}, ${skill >= Math.round(T.people.expertAt * 100) ? 'a master planner' : `skill ${skill}%`}` : 'none at the desk');
        if (t) rows += row('Building at once', `${openSites(S, t)} of ${atOnce(S, t)} sites`);
      }
      else if (!B.guards) rows += row('Cycle', `${B.seconds}s each`);
      if (B.tools) rows += row('Tools', (b.inv.tools || 0) >= 1 ? `${n0(b.inv.tools)}: working ${B.tools.speedup}× as fast` : 'none: slower work');
      progress = B.seconds ? b.timer / B.seconds : 0;
    }
    // a counter: what it guards against and how far
    // a conveyor runs past its door: loads ride to and from it with no hands
    if (!b.site && S.world.belts && beltBy(S, b) >= 0) { const riding = S.parcels.filter(p => p.src === b.id || p.dst === b.id).length; rows += row('Conveyor', `beside a belt${riding ? `: ${riding} load${riding > 1 ? 's' : ''} riding to or from it` : ''}`); }
    if (B.sanitation) rows += row('Keeps clean', `homes within ${B.sanitation.radius} tiles, while its attendant is in: they fall sick ${Math.round(T.hardship.cleanFactor * 100)}% as often`);
    // renewal: being moved out of a district centre, or idle long enough to come down
    const renewal = renewalNote(S, b);
    if (renewal) rows += row('Renewal', renewal);
    if (B.guards) rows += row('Guards against', `${({ fire: 'fire', flood: 'floods', sickness: 'sickness', raids: 'raiders' })[B.guards.hazard]} within ${B.guards.radius} tiles` + (B.guards.defence ? `; defence ${B.guards.defence}` : ''));
    const pct = progress === null ? null : Math.round(Math.max(0, Math.min(1, progress)) * 100);
    $('#insDyn').innerHTML = `<div class="ins-body"><span class="status ${b.status.l}">${esc(b.status.t)}</span><dl class="rows">${rows}</dl>${pct === null ? '' : `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>`}</div>`;
  }
}

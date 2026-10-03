/** Browser shell: HUD, goals, build bar, inspector, toasts, pointer input and the frame loop. */
import { loadGame, saveGame, type SaveFile, canPlace, placeProblem, countBuilt, createState, demolish, NEED_TEXT, originText, placeBuilding, STEP, tick, verifiedHere, villagers, type Building, type Content, type State } from '../sim/index.ts';
import { GOALS } from '../game/goals.ts';
import { ghostOrigin, Renderer, TS, type View } from '../render/renderer.ts';
import { NewGameDialog, type GameChoice } from './newgame.ts';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const SAVE_KEY = 'hearthworks.save';
const AUTOSAVE_SECONDS = 20;
const n0 = (v: number | undefined) => Math.max(0, Math.round(v || 0));

export class App {
  S: State;
  readonly content: Content;
  readonly r: Renderer;
  view: View;
  speed = 1;
  /** Village plans: the planner chooses and places buildings. On by default; the player can still place by hand. */
  plans = true;
  goals: boolean[];
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
    this.view = { cam: { x: 0, y: 0, z: 1 }, hover: null, tool: null, sel: null, routes: false };
    this.goals = GOALS.map(() => false);
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
    if (window.innerWidth < 640) $<HTMLDetailsElement>('#goals').open = false;
  }

  newGame(c: GameChoice) {
    this.adopt(createState(this.content, c.seed, { planner: c.plans, settlements: c.settlements, map: c.map, size: c.size }));
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
    // a loaded game has already told its news and met its goals
    this.seenEvents = S.t > 0 ? S.events.length : 0;
    this.goals = GOALS.map(g => S.t > 0 && g.check(S));
    // open on the player's first settlement, wherever the seed put it
    const home = this.S.bmap.get(this.S.towns[0].store), cx = home ? home.x + home.w / 2 : this.S.world.w / 2, cy = home ? home.y + home.h / 2 : this.S.world.h / 2;
    const cam = this.view.cam;
    cam.x = cx * TS; cam.y = cy * TS;
    cam.z = Math.max(0.7, Math.min(2.2, Math.min(this.r.cw / (26 * TS), this.r.ch / (17 * TS))));
    this.select(null); this.setTool(null);
    this.renderGoals(); this.updateHud();
  }

  // ---------- saves ----------
  private worldLabel() {
    const st = this.S.setup, M = this.content.maps[st.map];
    return `${M?.name ?? st.map}, ${st.size}, seed ${this.S.seed}`;
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
      if (uiT <= 0) { uiT = 0.25; this.updateHud(); this.checkGoals(); this.drainEvents(); }
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
    for (const B of bps) {
      const btn = document.createElement('button');
      btn.className = 'tool'; btn.dataset.type = B.id; btn.id = 'tool-' + B.id; btn.setAttribute('aria-pressed', 'false');
      const cost = Object.entries(B.cost).map(([k, n]) => `${n} ${this.content.goods[k].name.toLowerCase()}`).join(', ') || 'free';
      btn.innerHTML = `<span class="sw" style="background:${B.color}"></span><span class="nm">${esc(B.name)}</span><span class="cs">${esc(cost)}</span>`;
      btn.title = B.description;
      btn.addEventListener('click', () => this.setTool(this.view.tool === B.id ? null : B.id));
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
    const B = this.content.blueprints[t];
    const cost = Object.entries(B.cost).map(([k, n]) => `${n} ${this.content.goods[k].name.toLowerCase()}`).join(' and ');
    hint.textContent = B.paves ? 'Drag across the map to lay road. Esc or the Road button to stop.' : `Tap open land to place a ${B.name}. Carriers will bring ${cost} to build it.`;
    hint.hidden = false;
    this.select(null);
  }

  // ---------- input ----------
  private wireInput() {
    const cv = this.r.canvas, ptrs = new Map<number, { x: number; y: number }>();
    let drag: { sx: number; sy: number; cx: number; cy: number; moved: boolean } | null = null;
    let pinch: { d: number; z: number; w: { x: number; y: number } } | null = null;
    let painting = false;
    const cam = this.view.cam;
    const hover = (sx: number, sy: number) => { const w = this.r.toWorld(cam, sx, sy); this.view.hover = { x: Math.floor(w.x / TS), y: Math.floor(w.y / TS) }; };
    const paint = () => { const h = this.view.hover; if (h && this.view.tool && canPlace(this.S, this.view.tool, h.x, h.y)) placeBuilding(this.S, this.view.tool, h.x, h.y, true); };

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
      if (this.view.tool && this.content.blueprints[this.view.tool].paves) { painting = true; paint(); }
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
    if (t && !this.content.blueprints[t].paves) {
      const o = ghostOrigin(S, t, h);
      if (canPlace(S, t, o.x, o.y)) { const b = placeBuilding(S, t, o.x, o.y, false); this.setTool(null); this.select(b); }
      else this.toast(`Can't build there: ${placeProblem(S, t, o.x, o.y)}`, 'bad');
      return;
    }
    if (!t) {
      const w = S.world, inside = h.x >= 0 && h.y >= 0 && h.x < w.w && h.y < w.h;
      const id = inside ? w.bgrid[h.y * w.w + h.x] : -1;
      this.select(id >= 0 ? S.bmap.get(id) ?? null : null);
    }
  }

  // ---------- HUD, goals, toasts ----------
  private updateHud() {
    const S = this.S, totals: Record<string, number> = {};
    for (const b of S.buildings) if (this.content.blueprints[b.type].storage && !b.site) for (const k in b.inv) totals[k] = (totals[k] || 0) + b.inv[k];
    $('#res').innerHTML = Object.values(this.content.goods).sort((a, b) => a.order - b.order).map(g =>
      `<span class="chip" title="${esc(g.name)} in storage"><span class="dot" style="background:${g.color}"></span><span class="lbl">${esc(g.name)}</span> <b>${n0(totals[g.id])}</b></span>`).join('');
    const vs = villagers(S), cap = countBuilt(S, 'house') * this.content.blueprints.house.homes, bots = S.agents.length - vs.length;
    const carriers = vs.filter(a => a.role === 'carrier').length, m = Math.round(S.mood * 100);
    const mc = m >= 80 ? 'mood-good' : m >= 50 ? 'mood-warn' : 'mood-bad';
    const line = $('#planLine'), on = S.planner.on, multi = S.towns.length > 1;
    line.classList.toggle('off', !on);
    $('#planText').innerHTML = on
      ? S.towns.map(t => (multi ? `<b class="tn">${esc(t.name)}</b> ` : '') + esc(t.planner.status)).join(' <br>')
      : 'Plans are off: you place the buildings';
    this.renderKnowledge();
    $('#meta').innerHTML = `<span class="chip" title="Villagers and beds"><span class="lbl">Villagers</span> 👤 <b>${vs.length}/${cap}</b></span><span class="chip" id="chipCarriers">Carriers <b>${carriers}</b></span><span class="chip ${mc}" title="Mood"><span class="lbl">Mood</span> ☺ <b>${m}%</b></span>` + (bots ? `<span class="chip" title="Bots"><span class="lbl">Bots</span> ⚙ <b>${bots}</b></span>` : '');
    this.updateInspector();
  }

  /** Per settlement: what it has learned beyond its founding, how, and whether it has proven it; and what is still undiscovered. */
  private renderKnowledge() {
    const S = this.S, bps = Object.values(this.content.blueprints).sort((a, b) => a.order - b.order);
    const discoverable = bps.filter(B => B.discovery);
    const key = S.towns.map(t => villagers(S).filter(a => a.home?.town === t.id).length + ':' + Object.entries(t.knows).map(([id, k]) => id + k.verified.length).join()).join('|');
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
      for (const B of discoverable) if (!t.knows[B.id]) {
        html += `<li class="unknown"><b>${esc(B.name)}</b>: not yet thought of. It comes when ${esc(NEED_TEXT[B.discovery!.need] ?? B.discovery!.need)}.</li>`;
      }
      html += '</ul>';
    }
    const founding = bps.filter(B => !B.discovery && !B.paves).map(B => B.name).join(', ');
    html += `<p class="founding">Every settlement starts out knowing: ${esc(founding)}.</p>`;
    $('#knowList').innerHTML = html;
    $('#knowCount').textContent = `${learned} learned`;
  }

  private renderGoals() {
    const list = $('#goalList');
    list.innerHTML = '';
    const next = this.goals.indexOf(false);
    GOALS.forEach((g, i) => {
      const li = document.createElement('li');
      li.textContent = g.text;
      li.className = this.goals[i] ? 'done' : i === next ? 'next' : '';
      list.appendChild(li);
    });
    $('#goalCount').textContent = `${this.goals.filter(Boolean).length}/${GOALS.length}`;
  }
  private checkGoals() {
    let changed = false;
    GOALS.forEach((g, i) => { if (!this.goals[i] && g.check(this.S)) { this.goals[i] = true; changed = true; this.toast(`Goal complete: ${g.text}`, 'good'); } });
    if (changed) this.renderGoals();
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
    $('#insName').textContent = b.site ? `${B.name} (site)` : B.name;
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
      for (const k in B.keepStocked) rows += row(`${G[k].name} at home`, `${n0(b.inv[k])} / ${B.keepStocked[k]}`) + row('On the way', n0(b.incoming[k]));
    } else if (B.storage) {
      for (const g of Object.values(G).sort((a, b) => a.order - b.order)) rows += row(g.name, n0(b.inv[g.id]));
    } else if (B.couriers) {
      const busy = b.bots.filter(id => S.amap.get(id)?.task).length;
      rows += row('Bots', b.bots.length) + row('Hauling now', busy) + row('Range', `${B.couriers.radius} tiles`);
    } else if (B.workers) {
      const w = b.worker !== null ? S.amap.get(b.worker) : undefined;
      rows += row('Worker', w ? (w.state === 'working' ? 'On the job' : 'Walking over') : 'None free');
      for (const k in B.input) rows += row(`${G[k].name} in`, `${n0(b.inv[k])} / ${B.keepStocked[k] ?? B.input[k]}` + ((b.incoming[k] || 0) > 0 ? ` (+${n0(b.incoming[k])})` : ''));
      for (const k in B.output) rows += row(`${G[k].name} out`, `${n0(b.inv[k])} / ${T.logistics.outputCap}`);
      rows += row('Cycle', `${B.seconds}s each`);
      progress = B.seconds ? b.timer / B.seconds : 0;
    }
    const pct = progress === null ? null : Math.round(Math.max(0, Math.min(1, progress)) * 100);
    $('#insDyn').innerHTML = `<div class="ins-body"><span class="status ${b.status.l}">${esc(b.status.t)}</span><dl class="rows">${rows}</dl>${pct === null ? '' : `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>`}</div>`;
  }
}

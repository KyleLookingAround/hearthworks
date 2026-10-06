/** Browser shell: HUD, build bar, inspector, toasts, pointer input and the frame loop. */
import { surroundings } from '../sim/surroundings.ts';
import { clean, guarded } from '../sim/hardship.ts';
import { homeTier } from '../sim/production.ts';
import { FEAST, NAMING, called, craftGoods, isCraft } from '../sim/people.ts';
import { atOnce, hubs, openSites, renewalNote } from '../sim/planner.ts';
import { capOf, crew, maxSize, offered, places, sizeName } from '../sim/farms.ts';
import { ZONES, advise, waysOf, hubOf, defence, scholarly, learningAt, reads, chronicleLog, loadGame, saveGame, seasonOf, type SaveFile, canPlace, countBuilt, createState, NEED_TEXT, ageNeeded, beltBy, ctr, originText, setPlans, paintZone, setLever, setLaw, takeAdvice, place, turn, pullDown, pauseWork, growFields, STEP, tick, verifiedHere, villagers, type Building, type Content, type State } from '../sim/index.ts';
import { ghostOrigin, Renderer, TS, type View } from '../render/renderer.ts';
import { NewGameDialog, type GameChoice } from './newgame.ts';
import { CAUSES, CAUSE_ORDER, causeOf, ideasOf, tens, inWorld, nextAgeText, problemCount, statusText, storesOf, townView, waitsOn, wishesOf, type Cause, type TownView } from './readouts.ts';

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
const pct = (v: number) => `${Math.round(v * 100)}%`;
/** A badge as it is drawn on the map, for the legend and the problems list. */
const badge = (c: Cause) => `<svg class="badge" viewBox="-7.5 -7.5 15 15" aria-hidden="true"><circle r="6.5" fill="${CAUSES[c].color}" stroke="#1b2326" stroke-width="1.2"/><path d="${CAUSES[c].glyph}" fill="${CAUSES[c].ink}"/></svg>`;
/** Narrow screens: panels become sheets along the bottom, one at a time. */
const narrow = () => window.matchMedia('(max-width: 640px)').matches;
/** Milliseconds of each frame the simulation may take; past that the game runs slower than chosen rather than stutter. */
const TICK_BUDGET_MS = 11;

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
    this.view = { cam: { x: 0, y: 0, z: 1 }, hover: null, tool: null, rot: 0, sel: null, routes: false, overlay: 'none', flash: null };
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
    this.town = 0; this.scope = 'town'; this.cardKey = ''; this.barKey = '';
    this.setCard(false);
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
  /** Game seconds a real second, as run lately: below the speed chosen when this device cannot keep up. */
  rate = 1;
  start() {
    let last = performance.now(), acc = 0, uiT = 0, ran = 0, real = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000); last = now;
      acc += dt * this.speed;
      // as many steps as are due, within the frame's budget: past it, what is left is dropped and the game runs slower
      let steps = 0;
      const t0 = performance.now();
      while (acc >= STEP && steps < 40 && performance.now() - t0 < TICK_BUDGET_MS) { tick(this.S, STEP); acc -= STEP; steps++; }
      if (acc >= STEP) acc = 0;
      ran += steps * STEP; real += dt;
      if (real >= 1.5) { this.rate = ran / real; ran = 0; real = 0; this.speedNote(); }
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
  private hudH = 0;
  /** Panels float over the map; keep the drawer, toasts and hints clear of the HUD and build bar. */
  private measure() {
    const root = document.documentElement.style;
    root.setProperty('--buildH', ($('#buildwrap').offsetHeight || 0) + 'px');
    this.hudH = $('.topstack').offsetHeight || 0;
    root.setProperty('--hudH', this.hudH + 'px');
    const hint = $('#toolhint');
    root.setProperty('--hintH', (hint.hidden ? 0 : hint.offsetHeight) + 'px');
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
      btn.dataset.cost = cost;
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

  /**
   * Mark the build bar's buildings the chosen settlement does not know, with what each waits on. They can still be
   * chosen, to place on the land of a settlement that knows them.
   */
  private barKey = '';
  private markBuildBar() {
    const S = this.S, t = this.chosen();
    if (!t) return;
    const key = t.id + ':' + Object.keys(t.knows).sort().join() + ':' + t.age;
    if (key === this.barKey) return;
    this.barKey = key;
    document.querySelectorAll<HTMLButtonElement>('#build .tool[data-type]').forEach(btn => {
      const B = this.content.blueprints[btn.dataset.type!];
      if (!B) return;
      const short = waitsOn(S, t, B, true), cs = btn.querySelector('.cs')!;
      btn.classList.toggle('unknown', !!short);
      cs.textContent = short ? short : btn.dataset.cost ?? '';
      btn.title = short ? `${waitsOn(S, t, B)} Costs ${btn.dataset.cost}.` : B.description;
    });
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
    // the plan line: a settlement's name opens its card; anywhere else shows every plan in full, or folds them again
    $('#planLine').addEventListener('click', e => {
      const tn = (e.target as HTMLElement).closest<HTMLElement>('[data-town]');
      if (tn) { this.openCard(Number(tn.dataset.town)); return; }
      const p = $('#planLine'), open = p.getAttribute('aria-expanded') !== 'true';
      p.setAttribute('aria-expanded', String(open)); $('#planToggle').setAttribute('aria-expanded', String(open));
      this.planKey = ''; this.updateHud(); this.measure();
    });
    // the chosen settlement: from the menu, and its card
    $<HTMLSelectElement>('#townPick').addEventListener('change', e => this.choose(Number((e.target as HTMLSelectElement).value)));
    $('#townCard').addEventListener('click', () => { this.setMenu(false); this.openCard(this.town); });
    $('#cardClose').addEventListener('click', () => this.setCard(false));
    $('#card').addEventListener('click', e => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-jump],[data-step],[data-act]');
      if (!el) return;
      if (el.dataset.jump) {
        // a line for several alike buildings jumps to each in turn
        const ids = el.dataset.jump.split(',').map(Number), k = (this.jumps[el.dataset.jump] ?? -1) + 1;
        this.jumps[el.dataset.jump] = k;
        const b = this.S.bmap.get(ids[k % ids.length]);
        if (b) { this.jumpTo(b); this.select(b); }
      }
      else if (el.dataset.step) this.choose((this.town + Number(el.dataset.step) + this.S.towns.length) % this.S.towns.length);
      else if (el.dataset.act === 'go') { const b = this.S.bmap.get(this.chosen()?.store ?? -1); if (b) this.jumpTo(b, false); }
      else if (el.dataset.act === 'steward') { this.setMenu(true); const st = $<HTMLDetailsElement>('#steward'); st.open = true; this.renderSteward(true); st.scrollIntoView({ block: 'start' }); }
    });
    // what can be tapped in the HUD and the card is not redrawn under a finger or a pressed button, so no tap is lost
    for (const id of ['#res', '#meta', '#planLine', '#card']) $(id).addEventListener('pointerdown', () => { this.heldAt = performance.now(); });
    for (const ev of ['pointerup', 'pointercancel'] as const) window.addEventListener(ev, () => { this.heldAt = 0; });
    $('#card').addEventListener('toggle', e => { const d = e.target as HTMLDetailsElement; if (d.dataset.fold) this.folds[d.dataset.fold] = d.open; }, true);
    // the goods bar: whose stores it shows, and (on a phone) the goods beyond the staples
    $('#res').addEventListener('click', e => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (el?.dataset.act === 'scope') { this.cycleScope(); }
      else if (el?.dataset.act === 'more') { this.resMore = !this.resMore; this.updateHud(); this.measure(); }
    });
    $('#meta').addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('[data-act="problems"]')) { this.folds.problems = true; this.openCard(this.town); }
    });
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
      if (e.key === 'Escape') { if (this.view.tool) this.setTool(null); else if (!$('#drawer').hidden) this.setMenu(false); else if (this.view.sel) this.select(null); else this.setCard(false); }
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
    this.layoutSheets();
  }

  // ---------- the chosen settlement ----------
  /** The settlement the card, the goods bar, the steward and the build bar speak of. */
  town = 0;
  /** Whether the goods bar and the counts beside it show the chosen settlement or the whole world. */
  scope: 'town' | 'world' = 'town';
  private cardOpen = false;
  private cardKey = '';
  /** When a pointer went down on the HUD or the card: they are not redrawn until it is lifted (or for a second at most). */
  private heldAt = 0;
  private get held() { return this.heldAt > 0 && performance.now() - this.heldAt < 1000; }
  private jumps: Record<string, number> = {};
  private planKey = '';
  private resMore = false;
  /** Which folds of the card are open, by name, kept while it is redrawn. */
  private folds: Record<string, boolean> = { problems: false, stores: true };

  private chosen() { return this.S.towns[Math.min(this.town, this.S.towns.length - 1)]; }

  /** Choose a settlement: its card, its stores in the goods bar, its steward and what its build bar knows. */
  choose(i: number) {
    if (!this.S.towns[i]) return;
    this.town = i; this.cardKey = ''; this.stewardKey = '';
    this.updateHud();
    this.renderSteward(true);
  }

  openCard(i: number) {
    this.choose(i);
    // on a phone the card takes the inspector's place along the bottom
    if (narrow()) this.select(null);
    this.setCard(true);
  }

  setCard(open: boolean) {
    this.cardOpen = open;
    this.cardKey = '';
    this.layoutSheets();
    if (open) this.renderCard();
  }

  /** The goods bar's owner, in turn: each settlement, then the whole world. */
  private cycleScope() {
    const n = this.S.towns.length;
    if (this.scope === 'world') { this.scope = 'town'; this.choose(0); return; }
    if (this.town + 1 < n) { this.choose(this.town + 1); return; }
    this.scope = 'world'; this.updateHud();
  }

  /** Centre the camera on a building (closer in, if `zoom`), and ring it for a moment. */
  jumpTo(b: Building, zoom = true) {
    const cam = this.view.cam;
    cam.x = (b.x + b.w / 2) * TS; cam.y = (b.y + b.h / 2) * TS;
    if (zoom) cam.z = Math.max(cam.z, 1.3);
    // on a phone, keep it clear of the sheet along the bottom
    if (narrow()) cam.y += this.r.ch * 0.18 / cam.z;
    this.clampCam();
    this.view.flash = { id: b.id, at: performance.now() };
  }

  /**
   * Which panels show: on a phone one sheet along the bottom at a time (the inspector over the card) and the card
   * hidden under the menu. Toasts keep clear of whatever is open.
   */
  private layoutSheets() {
    const ins = !!this.view.sel && !this.view.sel.dead, menu = !$('#drawer').hidden, slim = narrow();
    const card = this.cardOpen && !(slim && (ins || menu));
    $('#card').hidden = !card;
    document.body.classList.toggle('card-open', card);
    document.body.classList.toggle('ins-open', ins);
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
    this.rate = v;
    document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === v)));
    this.speedNote();
  }

  /** Say so when the game runs well below the speed chosen (this device cannot keep up). */
  private speedNote() {
    const el = $('#speedNote'), slow = this.speed > 1 && this.rate < this.speed * 0.85;
    el.hidden = !slow;
    if (slow) el.textContent = `running at ${Math.max(1, Math.round(this.rate))}×`;
    $('.speed').dataset.rate = this.rate.toFixed(2);
  }

  setPlans(on: boolean) {
    this.plans = on;
    setPlans(this.S, { on });
    $('#plans').setAttribute('aria-pressed', String(on));
    this.toast(on ? 'The villagers will plan what to build' : 'Village plans off: you place the buildings');
    this.updateHud();
  }

  setTool(t: string | null) {
    this.view.tool = t;
    document.querySelectorAll<HTMLButtonElement>('.tool').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.type === t)));
    this.r.canvas.classList.toggle('placing', !!t);
    const hint = $('#toolhint');
    if (!t) { hint.hidden = true; this.measure(); return; }
    if (t.startsWith('zone:')) {
      hint.textContent = t === 'zone:clear' ? 'Drag across the map to clear zones.' : `Drag across the map to paint a ${ZONE_TOOLS.find(z => z[0] === t)![1].toLowerCase()}. The village plans keep to it.`;
      hint.hidden = false; this.measure(); this.select(null); return;
    }
    this.toolHint();
    hint.hidden = false; this.measure();
    this.select(null);
  }

  /** The hint for the building being placed, with which way it faces and a button to turn it. */
  private toolHint() {
    const t = this.view.tool, hint = $('#toolhint');
    if (!t || t.startsWith('zone:')) return;
    const B = this.content.blueprints[t];
    const cost = Object.entries(B.cost).map(([k, n]) => `${n} ${this.content.goods[k].name.toLowerCase()}`).join(' and ');
    // where it can go for want of knowledge: only on the land of a settlement that knows it
    const S = this.S, who = S.towns.filter(o => t in o.knows).map(o => o.name), chosen = this.chosen(), unknown = !!chosen && !(t in chosen.knows);
    hint.classList.toggle('unknown', unknown);
    // nobody knows it: say what it waits on, and nothing about placing it
    if (unknown && !who.length) { hint.textContent = `${waitsOn(S, chosen, B)} No settlement knows it yet.`; return; }
    const where = unknown ? ` Only on the land of ${who.join(' or ')}: ${chosen.name} has not thought of it yet.` : '';
    const a = /^[AEIOU]/.test(B.name) ? 'an' : 'a';
    if (B.paves) { hint.textContent = `Drag across the map to lay ${B.name.toLowerCase()}.${where} Esc or the ${B.name} button to stop.`; return; }
    const way = ['south', 'west', 'north', 'east'][this.view.rot];
    hint.innerHTML = `<span>${esc(`Tap open land to place ${a} ${B.name}, its door facing ${way}. Carriers will bring ${cost} to build it.${where}`)}</span> <button type="button" class="btn" id="turnTool" title="Turn it a quarter (R; Shift+R turns back)">Turn</button>`;
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
    let painting = false, refused = false;
    const cam = this.view.cam;
    const hover = (sx: number, sy: number) => { const w = this.r.toWorld(cam, sx, sy); this.view.hover = { x: Math.floor(w.x / TS), y: Math.floor(w.y / TS) }; };
    const paint = () => {
      const h = this.view.hover, t = this.view.tool;
      if (!h || !t) return;
      if (t.startsWith('zone:')) {
        // a 3 by 3 brush
        paintZone(this.S, { x: h.x, y: h.y, zone: t === 'zone:clear' ? null : t.slice(5) as (typeof ZONES)[number] });
        return;
      }
      if (!canPlace(this.S, t, h.x, h.y)) return;
      // paving too goes only where the settlement whose land it is knows it: said once a stroke
      const done = place(this.S, { type: t, x: h.x, y: h.y });
      if (!done.ok) { if (!refused) this.toast(`Can't lay it there: ${done.why}`, 'bad'); refused = true; }
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
      if (t && (t.startsWith('zone:') || this.content.blueprints[t].paves)) { painting = true; refused = false; paint(); }
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
      if (drag && !drag.moved && !painting && e.type === 'pointerup') this.tap(e.offsetX, e.offsetY);
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

  private tap(sx: number, sy: number) {
    const h = this.view.hover, S = this.S;
    if (!h) return;
    const t = this.view.tool;
    if (t && t.startsWith('zone:')) return;
    if (t && !this.content.blueprints[t].paves) {
      const rot = this.view.rot, o = ghostOrigin(S, t, h, rot);
      // a building can go only where the settlement whose land it is knows it, and on open land
      const done = place(S, { type: t, x: o.x, y: o.y, rot });
      if (done.ok) { this.setTool(null); this.select(done.building ?? null); }
      else this.toast(`Can't build there: ${done.why}`, 'bad');
      return;
    }
    if (!t) {
      // a settlement's name opens its card
      const named = this.r.townAt(S, this.view.cam, sx, sy);
      if (named !== null) { this.openCard(named); return; }
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
    if (this.held) return;
    const S = this.S, t = this.chosen(), world = this.scope === 'world' || !t;
    const totals = storesOf(S, world ? null : t.id), G = this.content.goods;
    // the goods bar: whose stores (tap to change), the four staples always, other goods once there is some in store;
    // on a phone the others fold behind "more"
    const goods = Object.values(G).sort((a, b) => a.order - b.order).filter(g => g.order <= 4 || (totals[g.id] || 0) >= 1);
    const extra = goods.filter(g => g.order > 4).length;
    const next = world ? S.towns[0]?.name ?? 'the first settlement' : this.town + 1 < S.towns.length ? S.towns[this.town + 1].name : 'every settlement together';
    $('#res').innerHTML = `<button type="button" class="chip scope" data-act="scope" title="Whose stores these are: tap for ${esc(next)}">${esc(world ? 'All settlements' : t.name)} <span aria-hidden="true">▾</span></button>`
      + goods.map(g => `<span class="chip${g.order > 4 ? ' more-good' : ''}" title="${esc(g.name)} in ${esc(world ? 'every settlement' : t.name)}'s stores"><span class="dot" style="background:${g.color}"></span><span class="lbl">${esc(g.name)}</span> <b>${n0(totals[g.id])}</b></span>`).join('')
      + (extra ? `<button type="button" class="chip more" data-act="more" aria-expanded="${this.resMore}">${this.resMore ? 'fewer' : `+${extra} more`}</button>` : '');
    $('#res').classList.toggle('open', this.resMore);
    // the counts beside it: the chosen settlement's, or the world's
    const vs = villagers(S), bots = world ? S.agents.length - vs.length : S.agents.filter(a => a.kind === 'bot' && a.depot?.town === t.id).length;
    const mine = world ? vs : vs.filter(a => a.home?.town === t.id);
    const cap = S.buildings.reduce((n, b) => n + (b.site || (!world && b.town !== t.id) ? 0 : this.content.blueprints[b.type].homes), 0);
    const carriers = mine.filter(a => a.role === 'carrier').length, m = Math.round((world ? S.mood : t.mood) * 100);
    const mc = m >= 80 ? 'mood-good' : m >= 50 ? 'mood-warn' : 'mood-bad';
    const views = S.towns.map(o => townView(S, o)), probs = world ? views.reduce((n, v) => n + problemCount(v), 0) : problemCount(views[t.id]);
    this.renderPlanLine(views);
    this.renderKnowledge();
    this.renderSteward(false);
    this.renderChronicle();
    this.renderTownPick();
    this.markBuildBar();
    if (this.cardOpen && t) this.renderCard(views[t.id]);
    const season = seasonOf(S), year = Math.floor(S.t / this.content.tuning.seasons.yearSeconds) + 1;
    $('#meta').innerHTML = (season ? `<span class="chip season ${season}" title="Year ${year}"><span class="lbl">${season[0].toUpperCase() + season.slice(1)}</span> <span class="ic">${['🌱', '☀', '🍂', '❄'][['spring', 'summer', 'autumn', 'winter'].indexOf(season)]}</span> <b>Y${year}</b></span>` : '')
      + `<span class="chip" title="Villagers and beds"><span class="lbl">Villagers</span> <span class="ic">👤</span> <b>${mine.length}/${cap}</b></span><span class="chip" id="chipCarriers" title="Carriers">Carriers <b>${carriers}</b></span><span class="chip ${mc}" title="Mood"><span class="lbl">Mood</span> <span class="ic">☺</span> <b>${m}%</b></span>`
      + (bots ? `<span class="chip" title="Bots"><span class="lbl">Bots</span> <span class="ic">⚙</span> <b>${bots}</b></span>` : '')
      + `<button type="button" class="chip problems${probs ? '' : ' none'}" data-act="problems" title="Buildings held up${world ? ' in every settlement' : ` in ${esc(t.name)}`}: tap for the list">${badge('input')}<span class="lbl">Held up</span> <b>${probs}</b></button>`;
    this.updateInspector();
    this.layoutSheets();
    // the HUD grows and shrinks with what it shows: keep the panels below it clear of it
    if ($('.topstack').offsetHeight !== this.hudH) this.measure();
  }

  /** The chosen settlement in the menu's picker, kept in step with the settlements there are. */
  private renderTownPick() {
    const sel = $<HTMLSelectElement>('#townPick'), key = this.S.towns.map(t => t.name).join('|');
    if (sel.dataset.key !== key) { sel.dataset.key = key; sel.innerHTML = this.S.towns.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join(''); }
    const id = String(this.chosen()?.id ?? 0);
    if (sel.value !== id) sel.value = id;
  }

  /**
   * The plan line: each settlement on a line of its own, its name opening its card. Folded, it shows up to three
   * (two on a phone), taking turns a few seconds each when there are more; unfolded, every plan in full.
   */
  private renderPlanLine(views: TownView[]) {
    const S = this.S, line = $('#planLine'), on = S.planner.on, multi = S.towns.length > 1, open = line.getAttribute('aria-expanded') === 'true';
    line.classList.toggle('off', !on);
    const fit = narrow() ? 2 : 3, n = views.length, turn = Math.floor(performance.now() / 6000);
    const shown = open || n <= fit ? views : [...new Set(Array.from({ length: fit }, (_, k) => views[(turn * fit + k) % n]))];
    const row = (v: TownView) => {
      // a settlement's form, and its districts once it has more than one
      const t = v.town, d = hubs(S, t).length, tag = `${v.form}${d > 1 ? `, ${d} districts` : ''}`;
      const name = multi ? t.name : v.form[0].toUpperCase() + v.form.slice(1);
      return `<div class="pl-row${t.id === this.chosen()?.id ? ' chosen' : ''}"><button type="button" class="tn" data-town="${t.id}" title="${esc(`${t.name}, ${tag}: open its card`)}">${esc(name)}</button> <span class="st">${esc(v.status)}</span></div>`;
    };
    const html = on ? shown.map(row).join('') + (!open && n > fit ? `<div class="pl-more">${n} settlements, taking turns: tap to see all</div>` : '') : '<div class="pl-row">Plans are off: you place the buildings</div>';
    if (html === this.planKey) return;
    const rows = $('#planText').childElementCount;
    this.planKey = html;
    $('#planText').innerHTML = html;
    if ($('#planText').childElementCount !== rows) this.measure();
  }

  /**
   * The settlement card: one settlement as its people live it. Its stores, fed and mood, hands, what it builds,
   * what its planner wants and what stands in the way, its age and trade, and its buildings held up, by cause.
   * Redrawn only when something it shows changes, so a tap on it is never lost.
   */
  private renderCard(v?: TownView) {
    const t0 = this.chosen();
    if (!this.cardOpen || !t0 || this.held) return;
    v ??= townView(this.S, t0);
    const S = this.S, t = v.town, G = this.content.goods, gn = (g: string) => (G[g]?.name ?? g).toLowerCase();
    const list = (xs: string[]) => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '';
    const stores = storesOf(S, t.id), goods = Object.values(G).sort((a, b) => a.order - b.order).filter(g => g.order <= 4 || (stores[g.id] || 0) >= 1);
    const fold = (id: string, title: string, count: string, body: string) => `<details class="card-fold" data-fold="${id}"${this.folds[id] ? ' open' : ''}><summary><span>${title}</span><span class="count">${count}</span></summary>${body}</details>`;
    const lvl = (x: number) => x >= 0.8 ? 'mood-good' : x >= 0.5 ? 'mood-warn' : 'mood-bad';
    const row = (k: string, val: string, cls = '') => `<dt>${esc(k)}</dt><dd${cls ? ` class="${cls}"` : ''}>${val}</dd>`;
    let h = `<p class="card-sub">${esc(v.form[0].toUpperCase() + v.form.slice(1))}, in the Age of ${esc(v.age)}${t.mother !== null && S.towns[t.mother] ? `, founded from ${esc(S.towns[t.mother].name)}` : ''}</p>`;
    h += `<div class="card-chips"><span class="chip ${lvl(v.fed)}">Fed <b>${pct(v.fed)}</b></span><span class="chip ${lvl(v.mood)}">Mood <b>${pct(v.mood)}</b></span><span class="chip">Villagers <b>${v.pop}</b></span><span class="chip">Free beds <b>${v.free}</b></span></div>`;
    h += '<dl class="rows">';
    h += row('Hands', `${v.workers} at work, ${v.carriers} carrying` + (v.children ? `, ${v.children} ${v.children > 1 ? 'children' : 'child'}` : ''));
    h += row('Idle carriers', v.idle ? `${v.idle} of ${v.carriers}, nothing to carry` : 'none', v.carriers > 3 && v.idle > v.carriers / 3 ? 'warn' : '');
    if (v.bots) h += row('Bots', String(v.bots));
    h += '</dl>';
    // its planner: what stands in the way now, what it works towards and what it is short of
    h += `<p class="card-plan"><b>Planner</b> ${esc(v.status)}</p>`;
    // the top of its wish list, each with what stands in the way
    if (v.wishes.length > 1) h += `<ul class="wishes">${v.wishes.map(w => `<li class="w-${w.verdict}" title="${esc(w.text)}"><b>${esc(w.name)}</b>: ${esc(w.short)}</li>`).join('')}</ul>`;
    const wants = v.wants.map(([g, n]) => `${gn(g)}${n >= 0.66 ? ' (badly)' : n < 0.33 ? ' (a little)' : ''}`);
    h += '<dl class="rows">';
    if (v.towards) h += row('Working towards', esc(v.towards));
    h += row('Short of', wants.length ? esc(list(wants)) : 'nothing, at its last look');
    // its next age, and the ideas it is nearest to thinking of
    const ageNext = nextAgeText(S, t), ideas = ideasOf(S, t).filter(x => x.share > 0).slice(0, 3);
    if (ageNext) h += row('Next age', esc(ageNext.replace(/^The Age of /, '')));
    h += row('Nearest ideas', ideas.length ? ideas.map(x => `<span class="idea" title="${esc(x.text)}">${esc(x.name)} ${x.share >= 1 ? 'soon' : `${tens(x.share)}%`}</span>`).join('') : 'nothing pressing it to think');
    h += row('Building now', v.sites.length ? v.sites.slice(0, 4).map(x => `<button type="button" class="link" data-jump="${x.b.id}">${esc(x.name)}</button> ${pct(x.done)}`).join(', ') + (v.sites.length > 4 ? `, and ${v.sites.length - 4} more` : '') : 'nothing');
    if (S.trade && S.towns.length > 1) {
      h += row('Has sent', v.sent.length ? esc(list(v.sent.map(([g, n]) => `${n} ${gn(g)}`))) : 'nothing yet');
      h += row('Has got', v.got.length ? esc(list(v.got.map(([g, n]) => `${n} ${gn(g)}`))) : 'nothing yet');
    }
    h += '</dl>';
    // its own stores: a neighbour's are out of reach but by trade
    h += fold('stores', 'Its stores', `${n0(Object.values(stores).reduce((a, b) => a + b, 0))} goods`, `<div class="card-goods">${goods.map(g => `<span class="chip"><span class="dot" style="background:${g.color}"></span>${esc(g.name)} <b>${n0(stores[g.id])}</b></span>`).join('')}</div>`);
    // its buildings held up, by cause, each a jump to the building; resting last, as no problem
    const total = problemCount(v);
    let probs = '';
    for (const c of CAUSE_ORDER) {
      const bs = v.problems.get(c);
      if (!bs?.length) continue;
      // alike buildings held up alike share a line
      const alike = new Map<string, { name: string; text: string; ids: number[] }>();
      for (const b of bs) {
        const name = sizeName(S, b), text = statusText(S, b).t, k = name + '|' + text, e = alike.get(k);
        if (e) e.ids.push(b.id); else alike.set(k, { name, text, ids: [b.id] });
      }
      const lines = [...alike.values()];
      const items = lines.slice(0, 10).map(e => `<li><button type="button" class="link" data-jump="${e.ids.join(',')}" title="${e.ids.length > 1 ? 'Go to each in turn' : 'Go to it'}">${esc(e.name)}</button>${e.ids.length > 1 ? ` <b class="times">×${e.ids.length}</b>` : ''} <span>${esc(e.text)}</span></li>`).join('');
      probs += `<div class="cause"><div class="cause-head">${badge(c)}<b>${CAUSES[c].name}</b> <span class="count">${bs.length}</span></div><ul>${items}${lines.length > 10 ? `<li class="more">and ${lines.length - 10} more kinds</li>` : ''}</ul></div>`;
    }
    const legend = `<div class="legend">${CAUSE_ORDER.map(c => `<span title="${esc(CAUSES[c].hint)}">${badge(c)}${CAUSES[c].name}: ${esc(CAUSES[c].hint)}</span>`).join('')}</div>`;
    h += fold('problems', 'Held up', total ? String(total) : 'none', (probs || '<p class="hint">Nothing is held up.</p>') + legend);
    h += `<div class="actions"><button type="button" class="btn" data-act="go">Go to ${esc(t.name)}</button><button type="button" class="btn" data-act="steward">Steward</button></div>`;
    const key = t.id + h;
    if (key === this.cardKey) return;
    this.cardKey = key;
    $('#cardName').textContent = t.name;
    document.querySelectorAll<HTMLElement>('#card .card-step').forEach(b => { b.hidden = S.towns.length < 2; });
    const card = $('#card'), top = card.scrollTop;
    $('#cardBody').innerHTML = h;
    card.scrollTop = top;
  }

  /** The steward panel steers the chosen settlement (`town`). */
  private stewardKey = '';

  /**
   * The steward panel: for one settlement, a priority for each need, the line of thought to encourage,
   * the planner's pace, and the advisor's suggestions. Rebuilt only when something it shows changes,
   * so a select being used is never replaced under the pointer.
   */
  private renderSteward(force: boolean) {
    const panel = $<HTMLDetailsElement>('#steward');
    if (!panel.open) return;
    const S = this.S, t = this.chosen();
    if (!t) return;
    const unknown = Object.values(this.content.blueprints).filter(B => B.discovery && !(B.id in t.knows));
    const tips = t.advice.map(x => [x.key, x.text, x.label]);
    // trade so far: the three biggest of each way, in whole loads
    const top = (r: Record<string, number>) => Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g, n]) => `${n} ${(this.content.goods[g]?.name ?? g).toLowerCase()}`).join(', ');
    const trade = S.trade && S.towns.length > 1 ? [top(t.trade.exported) || 'nothing yet', top(t.trade.imported) || 'nothing yet'] : null;
    // hardship: the defence at its first yard against raiders, and camps in reach
    const D = S.hardship ? defence(S, t) : null, near = S.hardship ? S.camps.filter(c => { const y = S.bmap.get(t.store); return !!y && Math.hypot(c.x - y.x, c.y - y.y) <= this.content.tuning.hardship.raidReach; }).length : 0;
    const peace = S.hardship ? S.camps.filter(c => c.friend === t.id && c.goodwill > 0).length : 0;
    const guard = D ? [Math.round(D.total), D.warned, near, peace] : null;
    // how its goods go: each way's share (to five per cent, so the panel is not redrawn for every delivery)
    const ways = waysOf(S, t), waysKey = ways ? [ways.shares.map(v => Math.round(v / 5)), Math.floor(Math.log2(1 + ways.handed))] : null;
    const wishes = wishesOf(S, t, 5);
    const key = JSON.stringify([wishes.map(w => w.name + w.short), waysKey, t.id, t.levers, t.laws, guard, t.roads.length, 'road' in t.knows, t.belts.length, 'conveyor' in t.knows, unknown.map(B => B.id), tips, S.towns.length, trade, t.custom, t.naming, t.craft, t.why, t.rites.length, t.age, t.feasts.join(), S.t < t.feastUntil, t.charted.length, S.agents.some(a => a.visit?.explore && a.visit.from === t.id)]);
    if (!force && key === this.stewardKey) return;
    this.stewardKey = key;
    const needs: [string, string][] = [
      ['bread', 'Bread'], ['wheat', 'Wheat'], ['planks', 'Planks'], ['logs', 'Logs'], ['beds', 'Homes for newcomers'],
      ['hauling', 'Hauling'], ...(S.carts ? [['carts', 'Cart sheds'], ['oxen', 'Ox barns']] as [string, string][] : []), ['crossing', 'Reaching the neighbours'], ['detours', 'Getting across water'],
      ...(S.hardship ? [['fire', 'Guarding against fire'], ['flood', 'Holding back floods'], ['sickness', 'Tending the sick'], ['raids', 'Defence against raiders']] as [string, string][] : []),
    ];
    const levels: [number, string][] = [[0.5, 'Low'], [1, 'Normal'], [2, 'High'], [4, 'First']];
    const sel = (id: string, v: number, opts: [number, string][]) => `<select data-lever="${id}">${opts.map(([n, l]) => `<option value="${n}"${n === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    let html = '';
    // what its planner wants next, and what stands in the way of each
    if (t.planner.on && wishes.length) html += `<div class="steward-grid"><span>Wishes</span><ul class="wishes">${wishes.map(w => `<li class="w-${w.verdict}" title="${esc(w.text)}"><b>${esc(w.name)}</b>: ${esc(w.short)}</li>`).join('')}</ul></div>`;
    html += '<div class="steward-grid">' + needs.map(([k, label]) => `<span>${label}</span>${sel('p:' + k, t.levers.priority[k] ?? 1, levels)}`).join('');
    html += `<span>Encourage thinking about</span><select data-lever="encourage"><option value="">Nothing in particular</option>${unknown.map(B => `<option value="${B.id}"${t.levers.encourage === B.id ? ' selected' : ''}>${esc(B.name)}</option>`).join('')}</select>`;
    html += `<span>Pace</span>${sel('pace', t.levers.pace, [[0.5, 'Unhurried'], [1, 'Normal'], [2, 'Brisk']])}</div>`;
    // the laws for hard times
    html += `<div class="steward-grid"><span>Rationing</span><select data-law="rationing"><option value="0"${t.laws.rationing ? '' : ' selected'}>Eat as usual</option><option value="1"${t.laws.rationing ? ' selected' : ''}>Ration food</option></select>`;
    html += `<span>Working hours</span><select data-law="hours">${(['short', 'normal', 'long'] as const).map(h => `<option value="${h}"${t.laws.hours === h ? ' selected' : ''}>${{ short: 'Short', normal: 'Normal', long: 'Long' }[h]}</option>`).join('')}</select>`;
    html += `<span>The hungry</span><select data-law="leave"><option value="1"${t.laws.leave ? ' selected' : ''}>May leave</option><option value="0"${t.laws.leave ? '' : ' selected'}>Must stay</option></select></div>`;
    if (S.plannedRoads) html += `<div class="steward-grid"><span>Roads</span><span>${t.roads.length ? `${t.roads.length} laid` : 'road' in t.knows ? 'none laid yet' : 'not thought of yet'}</span></div>`;
    if (t.belts.length || 'conveyor' in t.knows) html += `<div class="steward-grid"><span>Conveyors</span><span>${t.belts.length ? `${t.belts.length} laid` : 'none laid yet'}</span></div>`;
    if (ways) html += `<div class="steward-grid"><span>Goods go</span><span>${esc(ways.text)}</span>${ways.handed ? `<span>Handed on at its yards</span><span>${ways.handed} goods, brought by the cartload or the belt for their districts and taken on on foot</span>` : ''}</div>`;
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
      // its ways, and why it holds to them: its custom for the dead, its names, its feasts and its craft
      const why = (s?: string) => (s ? `, ${esc(s)}` : '');
      html += `<div class="steward-grid"><span>Custom for the dead</span><span>${word}${why(t.why.custom)}${t.rites.length ? `; ${t.rites.length} waiting` : ''}</span>`;
      html += `<span>Names its children</span><span>${esc(NAMING[t.naming] ?? '')}</span>`;
      // the feasts it keeps through the year, and whether one lately held lifts its mood
      if (S.seasons) html += `<span>Feasts</span><span>${t.feasts.length ? t.feasts.map(f => FEAST[f].name).join(', ') + why(t.why.feast) : 'none'}${S.t < t.feastUntil ? ' (feasting now)' : ''}</span>`;
      const pct = Math.round(this.content.tuning.people.craftPace * 100);
      html += `<span>Craft</span><span>${t.craft ? `its ${esc(craftGoods(S, t.craft))}${why(t.why.craft)}: every ${esc(this.content.blueprints[t.craft]?.name ?? t.craft)} of its works ${pct}% faster` : 'none yet: its first master of a trade no neighbour holds makes it one'}</span>`;
      html += '</div>';
    }
    if (trade) html += `<div class="steward-grid"><span>Traded away</span><span>${esc(trade[0])}</span><span>Traded for</span><span>${esc(trade[1])}</span></div>`;
    // the advisor's tips first, each with the lever or law it offers, set with one tap
    html = (tips.length ? `<ul class="advice">${tips.map(([key, text, label]) => `<li><span>${esc(text!)}</span>${label ? `<button type="button" class="btn small" data-advice="${esc(key!)}">${esc(label)}</button>` : ''}</li>`).join('')}</ul>` : '<p class="hint">The advisor has nothing new to suggest just now.</p>') + html;
    $('#stewardBody').innerHTML = html;
    $('#stewardTown').textContent = t.name;
    document.querySelectorAll<HTMLSelectElement>('#stewardBody [data-lever]').forEach(s => s.addEventListener('change', () => {
      const id = s.dataset.lever!;
      if (id === 'encourage') setLever(this.S, { town: t.id, lever: 'encourage', value: s.value || null });
      else if (id === 'pace') setLever(this.S, { town: t.id, lever: 'pace', value: Number(s.value) });
      else setLever(this.S, { town: t.id, lever: 'priority', need: id.slice(2), value: Number(s.value) });
      this.renderSteward(true);
    }));
    document.querySelectorAll<HTMLButtonElement>('#stewardBody [data-advice]').forEach(b => b.addEventListener('click', () => {
      const done = takeAdvice(this.S, { town: t.id, key: b.dataset.advice! });
      if (!done.ok) this.toast(done.why, 'bad'); else this.toast(`${t.name}: ${b.textContent}`);
      this.renderSteward(true);
    }));
    document.querySelectorAll<HTMLSelectElement>('#stewardBody [data-law]').forEach(s => s.addEventListener('change', () => {
      const id = s.dataset.law!;
      if (id === 'rationing' || id === 'leave') setLaw(this.S, { town: t.id, law: id, value: s.value === '1' });
      else setLaw(this.S, { town: t.id, law: 'hours', value: s.value as typeof t.laws.hours });
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

  /** Per settlement: what it has learned beyond its founding, how, and whether it has proven it; and what is still undiscovered. */
  private renderKnowledge() {
    const S = this.S, bps = Object.values(this.content.blueprints).sort((a, b) => a.order - b.order);
    const discoverable = bps.filter(B => B.discovery);
    // how near each idea is, worked out only while the panel is open (its count beside the title needs none of it)
    const open = $<HTMLDetailsElement>('#knowledge').open;
    const ideas = S.towns.map(t => (open ? ideasOf(S, t) : [])), ages = S.towns.map(t => (open ? nextAgeText(S, t) : null));
    const key = S.towns.map((t, i) => villagers(S).filter(a => a.home?.town === t.id).length + ':' + Object.entries(t.knows).map(([id, k]) => id + k.verified.length).join() + ':' + scholarly(S, t).map(x => x.waits[0]).join('') + ':' + ideas[i].map(x => x.text).join() + ':' + ages[i]).join('|');
    if (key === this.knowKey) return;
    this.knowKey = key;
    let html = '', learned = 0;
    for (const t of S.towns) {
      const pop = villagers(S).filter(a => a.home?.town === t.id).length;
      html += `<h3>${esc(t.name)}<small>${pop} villagers, Age of ${esc(this.content.eras[t.age]?.name ?? '')}</small></h3>`;
      // what it lacks for its next age, and how near it is to each idea it could think of now
      const ageNext = ages[t.id];
      if (ageNext) html += `<p class="next-age">Next: ${esc(ageNext)}</p>`;
      const pressed = ideas[t.id].filter(x => x.share > 0), idle = ideas[t.id].filter(x => x.share <= 0);
      if (pressed.length) html += `<ul class="ideas">${pressed.map(x => `<li class="${x.share >= 1 ? 'ready' : ''}"><span>${esc(x.text)}</span><span class="bar"><i style="width:${tens(x.share)}%"></i></span></li>`).join('')}</ul>`;
      if (idle.length) html += `<p class="next-age">Nothing presses it yet towards ${esc(idle.map(x => x.name).join(', '))}.</p>`;
      html += '<ul>';
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
  select(b: Building | null) { this.view.sel = b; this.confirmDel = false; this.renderActions(); this.updateInspector(); this.layoutSheets(); }

  private renderActions() {
    const b = this.view.sel, acts = $('#insActs');
    acts.innerHTML = '';
    if (!b || b.dead) return;
    const B = this.content.blueprints[b.type];
    if (B.workers && !b.site) {
      const p = document.createElement('button');
      p.className = 'btn'; p.id = 'act-pause'; p.textContent = b.paused ? 'Resume' : 'Pause'; p.setAttribute('aria-pressed', String(b.paused));
      p.addEventListener('click', () => { pauseWork(this.S, { building: b.id, paused: !b.paused }); this.renderActions(); this.updateInspector(); });
      acts.appendChild(p);
    }
    // farms that grow: lay new fields behind it
    if (this.S.farms && B.grows && !b.site && b.size < maxSize(B)) {
      const g = document.createElement('button');
      g.className = 'btn'; g.id = 'act-grow'; g.textContent = 'Grow fields';
      g.title = `Lay new fields behind it to grow it into ${B.grows.names[b.size + 1].toLowerCase()}, with a place for one more hand`;
      g.addEventListener('click', () => { const done = growFields(this.S, { building: b.id }); if (!done.ok) this.toast(`It cannot grow: ${done.why}`, 'bad'); else this.toast(`New fields are being laid behind the ${sizeName(this.S, b).toLowerCase()}`); this.renderActions(); this.updateInspector(); });
      acts.appendChild(g);
    }
    if (!B.bridge && !B.field && !b.size) {
      const r = document.createElement('button');
      r.className = 'btn'; r.id = 'act-turn'; r.textContent = 'Turn'; r.title = 'Turn it a quarter about its centre, its door to the next side';
      r.addEventListener('click', () => { const done = turn(this.S, { building: b.id }); if (!done.ok) this.toast(done.why, 'bad'); this.updateInspector(); });
      acts.appendChild(r);
    }
    const d = document.createElement('button');
    d.className = 'btn danger' + (this.confirmDel ? ' armed' : ''); d.id = 'act-demolish';
    d.textContent = this.confirmDel ? (b.site ? 'Confirm: cancel site' : 'Confirm demolish') : (b.site ? 'Cancel site' : 'Demolish');
    d.addEventListener('click', () => { if (!this.confirmDel) { this.confirmDel = true; this.renderActions(); return; } pullDown(this.S, { building: b.id }); this.select(null); });
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
      // a district's hub: the homes and workplaces whose nearest yard it is, and what comes to it for them by the cartload
      const served = S.buildings.filter(o => o !== b && !o.site && o.town === b.town && !this.content.blueprints[o.type].storage && (this.content.blueprints[o.type].homes || this.content.blueprints[o.type].workers) && hubOf(S, o) === b).length;
      if (served) {
        const coming = Object.keys(b.incoming).filter(g => (b.incoming[g] || 0) >= 1).map(g => `${n0(b.incoming[g])} ${G[g]?.name.toLowerCase() ?? g}`).join(', ');
        rows += row('Hub', `for ${served} homes and workplaces around it: what they ask for from far off comes here by the cartload and is taken on on foot` + (coming ? `; coming now: ${coming}` : ''));
      }
    } else if (B.carts || B.oxen) {
      // a cart shed or an ox barn: how many of its carts are out, and the oxen's feed
      let out = 0;
      for (const a of S.agents) if (a.cart === b.id) out++;
      const n = B.oxen || B.carts, kind = B.oxen ? 'Ox carts' : 'Handcarts', L = T.logistics;
      rows += row(`${kind} out`, `${out} of ${n}`) + row('Takes', `${B.oxen ? L.oxCarry : L.cartCarry} goods, on jobs of ${B.oxen ? L.oxMinTiles : L.cartMinTiles}+ tiles`);
      // where its carts are going: to doors, and on to a district's yard with the rest of the load
      const handing = S.agents.filter(a => a.cart === b.id && a.task && (a.task.hub || a.task.round.some(r => r.hub))).length;
      if (out) rows += row('Out now', handing ? `${out - handing} to doors, ${handing} on to a district's yard with the rest of the load` : `${out} to doors`);
      for (const k in B.keepStocked) rows += row(`${G[k].name} for the oxen`, `${n0(b.inv[k])} / ${B.keepStocked[k]}` + ((b.incoming[k] || 0) > 0 ? ` (+${n0(b.incoming[k])})` : '') + (B.oxen && (b.inv[k] || 0) < L.oxFeed ? ': the oxen wait for feed' : ''));
    } else if (B.couriers) {
      const busy = b.bots.filter(id => S.amap.get(id)?.task).length;
      rows += row('Bots', b.bots.length) + row('Hauling now', busy) + row('Range', `${B.couriers.radius} tiles`);
    } else if (B.workers) {
      const w = b.worker !== null ? S.amap.get(b.worker) : undefined, n = places(S, b);
      if (n > 1) { const ids = crew(b), at = ids.filter(id => S.amap.get(id)?.state === 'working').length; rows += row('Hands', `${ids.length} of ${n}` + (ids.length > at ? `, ${ids.length - at} walking over` : '')); }
      else rows += row('Worker', w ? (w.state === 'working' ? 'On the job' : 'Walking over') : 'None free');
      // its settlement's craft: it works faster
      if (isCraft(S, b)) rows += row('Tradition', `${S.towns[b.town].name}'s craft: works ${Math.round(T.people.craftPace * 100)}% faster`);
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
    const st = statusText(S, b);
    $('#insDyn').innerHTML = `<div class="ins-body"><span class="status ${st.l}">${esc(st.t)}</span><dl class="rows">${rows}</dl>${pct === null ? '' : `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>`}</div>`;
  }
}

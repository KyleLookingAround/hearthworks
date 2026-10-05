/** Canvas 2D renderer. Reads sim state; never changes it. */
import { canPlace, ctr, hash01, type Agent, type Building, type State } from '../sim/index.ts';

import { surroundings } from '../sim/surroundings.ts';
import { dims, door, FACING, seasonOf } from '../sim/world.ts';

export const TS = 24;
/** Zone tints, in ZONES order: homes, farms, workshops, no-build. */
const ZONE_TINT = ['rgba(232,154,138,.22)', 'rgba(227,196,84,.22)', 'rgba(143,166,200,.25)', 'rgba(176,65,62,.18)'];
const CHUNK = 32, MAX_CHUNKS = 48, OVERVIEW = 4;
/** Below this zoom the world is drawn from the overview, not tile by tile. */
const FAR = 0.3;

export interface Camera { x: number; y: number; z: number }
export interface View {
  cam: Camera;
  hover: { x: number; y: number } | null;
  tool: string | null;
  /** Which way the building being placed faces: 0 south, 1 west, 2 north, 3 east. */
  rot: number;
  sel: Building | null;
  routes: boolean;
  /** What to lay over the map: nothing, mood, nuisance, districts, traffic or courier coverage. */
  overlay: 'none' | 'mood' | 'nuisance' | 'districts' | 'traffic' | 'coverage' | 'cover';
}

type Ctx = CanvasRenderingContext2D;

export function ghostOrigin(S: State, type: string, t: { x: number; y: number }, rot = 0) {
  const { w, h } = dims(S.content.blueprints[type], rot);
  return { x: t.x - Math.floor((w - 1) / 2), y: t.y - Math.floor((h - 1) / 2) };
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: Ctx;
  private groundOf: State | null = null;
  cw = 0; ch = 0; dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.cw = r.width; this.ch = r.height;
    this.canvas.width = Math.round(this.cw * this.dpr);
    this.canvas.height = Math.round(this.ch * this.dpr);
  }

  toWorld(cam: Camera, sx: number, sy: number) {
    return { x: (sx - this.cw / 2) / cam.z + cam.x, y: (sy - this.ch / 2) / cam.z + cam.y };
  }

  /** Ground pieces of CHUNK by CHUNK tiles, drawn when first seen; the least recently used are dropped past MAX_CHUNKS. */
  private chunks = new Map<number, HTMLCanvasElement>();
  /** Far out: the whole world at OVERVIEW pixels a tile, ground once and trees refreshed every couple of seconds. */
  private overview: { ground: HTMLCanvasElement; trees: HTMLCanvasElement; at: number } | null = null;

  private resetGround(S: State) {
    this.chunks.clear(); this.overview = null; this.groundOf = S;
  }

  private chunk(S: State, cx: number, cy: number): HTMLCanvasElement {
    const w = S.world, key = cy * 4096 + cx;
    let cv = this.chunks.get(key);
    if (cv) { this.chunks.delete(key); this.chunks.set(key, cv); return cv; }
    cv = document.createElement('canvas');
    cv.width = CHUNK * TS; cv.height = CHUNK * TS;
    const g = cv.getContext('2d')!;
    g.translate(-cx * CHUNK * TS, -cy * CHUNK * TS);
    const near = (x: number, y: number) => {
      for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        const xx = x + k, yy = y + j;
        if (xx >= 0 && yy >= 0 && xx < w.w && yy < w.h && w.ground[yy * w.w + xx]) return true;
      }
      return false;
    };
    for (let y = cy * CHUNK; y < Math.min(w.h, (cy + 1) * CHUNK); y++) for (let x = cx * CHUNK; x < Math.min(w.w, (cx + 1) * CHUNK); x++) {
      const i = y * w.w + x, v = hash01(i), gr = w.ground[i];
      g.fillStyle = !gr ? (near(x, y) ? '#2a6670' : '#1f5562') : gr === 1 ? (v < 0.5 ? '#d6c08a' : '#dcc794') : gr === 3 ? (v < 0.5 ? '#8c877c' : '#958f83') : v < 0.33 ? '#6c9850' : v < 0.66 ? '#719d54' : '#77a258';
      g.fillRect(x * TS, y * TS, TS, TS);
      if (gr) {
        // hill shading: lit from the north-west, so slopes read as relief
        const up = (xx: number, yy: number) => (xx >= 0 && yy >= 0 ? w.height[yy * w.w + xx] : w.height[i]);
        const shade = (up(x - 1, y - 1) - w.height[i]) / 40;
        if (shade > 0.02) { g.fillStyle = `rgba(20,30,20,${Math.min(0.28, shade)})`; g.fillRect(x * TS, y * TS, TS, TS); }
        else if (shade < -0.02) { g.fillStyle = `rgba(255,250,230,${Math.min(0.2, -shade)})`; g.fillRect(x * TS, y * TS, TS, TS); }
      }
      if (gr === 3) { g.fillStyle = 'rgba(60,58,52,.35)'; g.fillRect(x * TS + v * 14 + 2, y * TS + hash01(i + 5) * 14 + 4, 6, 3); }
      const dep = w.deposit[i];
      if (dep === 1) { g.fillStyle = 'rgba(92,64,38,.45)'; for (let k = 0; k < 4; k++) g.fillRect(x * TS + hash01(i * 3 + k) * 18 + 3, y * TS + hash01(i * 5 + k) * 18 + 3, 3, 2); }
      else if (dep === 2) { g.fillStyle = 'rgba(205,200,190,.7)'; for (let k = 0; k < 2; k++) { g.beginPath(); g.arc(x * TS + 5 + hash01(i * 9 + k) * 14, y * TS + 5 + hash01(i * 11 + k) * 14, 2.4, 0, 7); g.fill(); } }
      else if (dep === 3) { g.fillStyle = 'rgba(176,96,62,.45)'; g.fillRect(x * TS + 4 + v * 8, y * TS + 8 + hash01(i + 7) * 8, 8, 4); }
      else if (dep === 5) { g.fillStyle = 'rgba(120,70,60,.75)'; for (let k = 0; k < 3; k++) g.fillRect(x * TS + 4 + hash01(i * 13 + k) * 14, y * TS + 4 + hash01(i * 17 + k) * 14, 3, 3); }
      else if (dep === 4) { g.strokeStyle = 'rgba(230,240,235,.35)'; g.lineWidth = 1.2; g.beginPath(); const fx = x * TS + 6 + v * 10, fy = y * TS + 8 + hash01(i + 2) * 8; g.moveTo(fx, fy); g.quadraticCurveTo(fx + 4, fy - 3, fx + 8, fy); g.stroke(); }
      if (gr === 2) {
        g.fillStyle = 'rgba(40,70,30,.22)';
        for (let k = 0; k < 3; k++) g.fillRect(x * TS + hash01(i * 7 + k) * 20 + 2, y * TS + hash01(i * 13 + k) * 20 + 2, 2, 2);
      }
      if (!gr && near(x, y)) { g.fillStyle = 'rgba(236,240,226,.12)'; g.fillRect(x * TS + v * 12, y * TS + 6 + hash01(i + 3) * 10, 8, 1.5); }
    }
    this.chunks.set(key, cv);
    if (this.chunks.size > MAX_CHUNKS) this.chunks.delete(this.chunks.keys().next().value!);
    return cv;
  }

  private overviewOf(S: State, now: number) {
    const w = S.world, O = OVERVIEW;
    if (!this.overview) {
      const ground = document.createElement('canvas'), trees = document.createElement('canvas');
      ground.width = trees.width = w.w * O; ground.height = trees.height = w.h * O;
      const g = ground.getContext('2d')!;
      for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
        const i = y * w.w + x, gr = w.ground[i];
        g.fillStyle = !gr ? '#1f5562' : gr === 1 ? '#d8c38e' : gr === 3 ? '#8f8a7f' : '#719d54';
        g.fillRect(x * O, y * O, O, O);
      }
      this.overview = { ground, trees, at: -Infinity };
    }
    if (now - this.overview.at > 2000) {
      const t = this.overview.trees, g = t.getContext('2d')!;
      g.clearRect(0, 0, t.width, t.height);
      for (let i = 0; i < w.tree.length; i++) {
        if (!w.tree[i]) continue;
        g.fillStyle = w.tree[i] === 2 ? '#2f5a36' : '#5e8d4a';
        g.fillRect((i % w.w) * O, Math.floor(i / w.w) * O, O, O);
      }
      this.overview.at = now;
    }
    return this.overview;
  }

  draw(S: State, v: View) {
    if (this.groundOf !== S) this.resetGround(S);
    const c = this.ctx, { cam } = v, w = S.world, dpr = this.dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#1d4b57'; c.fillRect(0, 0, this.cw, this.ch);
    c.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (this.cw / 2 - cam.x * cam.z), dpr * (this.ch / 2 - cam.y * cam.z));
    const a0 = this.toWorld(cam, 0, 0), a1 = this.toWorld(cam, this.cw, this.ch);
    const cl = (n: number, hi: number) => Math.max(0, Math.min(hi, n));
    const x0 = cl(Math.floor(a0.x / TS) - 1, w.w - 1), x1 = cl(Math.ceil(a1.x / TS) + 1, w.w - 1);
    const y0 = cl(Math.floor(a0.y / TS) - 1, w.h - 1), y1 = cl(Math.ceil(a1.y / TS) + 1, w.h - 1);
    const far = cam.z < FAR;
    if (far) {
      const o = this.overviewOf(S, performance.now());
      c.imageSmoothingEnabled = false;
      c.drawImage(o.ground, 0, 0, w.w * TS, w.h * TS);
      c.drawImage(o.trees, 0, 0, w.w * TS, w.h * TS);
      c.imageSmoothingEnabled = true;
    } else {
      for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++) for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) {
        c.drawImage(this.chunk(S, cx, cy), cx * CHUNK * TS, cy * CHUNK * TS);
      }
    }

    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const wr = w.wear[y * w.w + x];
      // trodden ground: where feet have worn a path that is not paved yet
      if (wr > 6 && !w.road[y * w.w + x] && !far) { c.fillStyle = `rgba(150,118,74,${Math.min(0.4, wr / 80)})`; c.fillRect(x * TS + 4, y * TS + 4, TS - 8, TS - 8); }
      const rd = w.road[y * w.w + x];
      if (!rd) continue;
      if (rd === 3) {
        // a road of stone: cobbles set in rows, kerbs along it
        c.fillStyle = '#5f5a52'; c.fillRect(x * TS, y * TS, TS, TS);
        c.fillStyle = '#8c867b'; c.fillRect(x * TS + 2, y * TS + 2, TS - 4, TS - 4);
        if (!far) {
          c.fillStyle = 'rgba(55,50,44,.45)';
          for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) c.fillRect(x * TS + 3 + k * ((TS - 6) / 4) + (r % 2) * 3, y * TS + 3 + r * ((TS - 6) / 4), 1.5, (TS - 6) / 4 - 1);
          for (let r = 1; r < 4; r++) c.fillRect(x * TS + 3, y * TS + 3 + r * ((TS - 6) / 4) - 0.75, TS - 6, 1.5);
        }
        continue;
      }
      if (rd === 2) {
        // a road: dressed stone the width of the tile, kerbs along it
        c.fillStyle = '#7d776c'; c.fillRect(x * TS, y * TS, TS, TS);
        c.fillStyle = '#a49d90'; c.fillRect(x * TS + 2, y * TS + 2, TS - 4, TS - 4);
        if (!far) { c.fillStyle = 'rgba(70,64,56,.35)'; c.fillRect(x * TS + TS / 2 - 1, y * TS + 4, 2, TS - 8); c.fillRect(x * TS + 4, y * TS + TS / 2 - 1, TS - 8, 2); }
        continue;
      }
      // a path: packed earth
      c.fillStyle = '#a58b5f'; c.fillRect(x * TS, y * TS, TS, TS);
      c.fillStyle = '#c2a877'; c.fillRect(x * TS + 3, y * TS + 3, TS - 6, TS - 6);
    }
    const grow = S.content.tuning.map.treeGrowSeconds;
    if (!far) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * w.w + x, t = w.tree[i];
      if (!t) continue;
      const h = hash01(i), cx = x * TS + TS / 2 + (h - 0.5) * 5, cy = y * TS + TS / 2 + (hash01(i + 9) - 0.5) * 5;
      const r = t === 2 ? TS * (0.38 + h * 0.08) : TS * (0.12 + (0.22 * w.grow[i]) / grow);
      // far out, a tree is one dark square: thousands of them stay cheap to draw
      if (cam.z < 0.4) { c.fillStyle = t === 2 ? '#2f5a36' : '#5e8d4a'; c.fillRect(cx - r, cy - r, r * 2, r * 2); continue; }
      c.fillStyle = 'rgba(16,30,18,.28)'; c.beginPath(); c.ellipse(cx + 2, cy + r * 0.7, r, r * 0.45, 0, 0, 7); c.fill();
      c.fillStyle = t === 2 ? (h < 0.5 ? '#2f5a36' : '#355f37') : '#5e8d4a'; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill();
      c.fillStyle = t === 2 ? '#43774a' : '#7aa960'; c.beginPath(); c.arc(cx - r * 0.3, cy - r * 0.3, r * 0.45, 0, 7); c.fill();
    }
    // the season on the land: whitening in winter, a warm cast in autumn
    const season = seasonOf(S);
    if (season === 'winter' || season === 'autumn') { c.fillStyle = season === 'winter' ? 'rgba(235,242,248,.32)' : 'rgba(210,140,60,.10)'; c.fillRect(x0 * TS, y0 * TS, (x1 - x0 + 1) * TS, (y1 - y0 + 1) * TS); }
    this.zones(S, x0, x1, y0, y1);
    for (const b of [...S.buildings].sort((p, q) => p.y - q.y)) this.building(S, b);
    if (S.hardship) this.hardship(S);
    if (v.overlay !== 'none') this.overlay(S, v.overlay, x0, x1, y0, y1);

    if (v.sel && !v.sel.dead) {
      const b = v.sel, B = S.content.blueprints[b.type];
      c.strokeStyle = '#f0c27a'; c.lineWidth = 2; this.rr(b.x * TS, b.y * TS, b.w * TS, b.h * TS, 6); c.stroke();
      if (B.harvest) this.ring(b, B.harvest.radius, 'rgba(127,194,138,.8)');
      if (B.couriers) this.ring(b, B.couriers.radius, 'rgba(240,194,122,.85)');
      if (B.guards) this.ring(b, B.guards.radius, 'rgba(140,190,230,.85)');
    }
    if (v.routes) {
      for (const b of S.buildings) { const B = S.content.blueprints[b.type]; if (B.couriers && !b.site) this.ring(b, B.couriers.radius, 'rgba(240,194,122,.45)'); }
      c.lineWidth = 1.5; c.setLineDash([3, 4]);
      for (const a of S.agents) if (a.task) {
        const tgt = a.state === 'toSrc' ? a.task.src : a.task.dst;
        if (tgt.dead) continue;
        const p = ctr(tgt);
        c.strokeStyle = S.content.goods[a.task.item]?.color ?? '#fff';
        c.beginPath(); c.moveTo(a.x * TS, a.y * TS); c.lineTo(p.x * TS, p.y * TS); c.stroke();
      }
      c.setLineDash([]);
    }
    for (const a of S.agents) this.agent(S, a);
    if (S.towns.length > 1 || cam.z < 0.6) this.townLabels(S, cam.z);
    if (v.tool?.startsWith('zone:') && v.hover) {
      c.strokeStyle = '#f0c27a'; c.lineWidth = 2; c.strokeRect((v.hover.x - 1) * TS, (v.hover.y - 1) * TS, 3 * TS, 3 * TS);
    } else if (v.tool && v.hover) {
      const B = S.content.blueprints[v.tool], rot = B.paves ? 0 : v.rot, o = B.paves ? v.hover : ghostOrigin(S, v.tool, v.hover, rot), ok = canPlace(S, v.tool, o.x, o.y, rot);
      const { w: gw, h: gh } = B.paves ? { w: 1, h: 1 } : dims(B, rot);
      c.fillStyle = ok ? 'rgba(127,194,138,.35)' : 'rgba(226,115,94,.4)';
      c.strokeStyle = ok ? '#7fc28a' : '#e2735e'; c.lineWidth = 1.5;
      this.rr(o.x * TS, o.y * TS, gw * TS, gh * TS, 4); c.fill(); c.stroke();
      const fake = { x: o.x, y: o.y, w: gw, h: gh, rot };
      // the side its door opens on: a bar along the door tile's outer edge
      if (!B.paves) {
        const d = door(fake), F = FACING[rot], cx = (d.x + 0.5 + F[0] * 0.5) * TS, cy = (d.y + 0.5 + F[1] * 0.5) * TS;
        c.fillStyle = ok ? '#e8f5ea' : '#ffd9d0';
        c.fillRect(cx - (F[0] ? 2 : TS * 0.35), cy - (F[1] ? 2 : TS * 0.35), F[0] ? 4 : TS * 0.7, F[1] ? 4 : TS * 0.7);
      }
      if (B.harvest) this.ring(fake, B.harvest.radius, 'rgba(127,194,138,.8)');
      if (B.couriers) this.ring(fake, B.couriers.radius, 'rgba(240,194,122,.85)');
      if (B.guards) this.ring(fake, B.guards.radius, 'rgba(140,190,230,.85)');
    }
  }

  /** Hardship on the map: flames, standing water and sickness on buildings; barbarian camps and their raiders. */
  private hardship(S: State) {
    const c = this.ctx;
    for (const b of S.buildings) {
      const px = b.x * TS, py = b.y * TS, pw = b.w * TS, ph = b.h * TS;
      if (b.flood > 0) { c.fillStyle = 'rgba(70,130,190,.45)'; this.rr(px + 1, py + 1, pw - 2, ph - 2, 4); c.fill(); }
      if (b.sick > 0) { c.fillStyle = 'rgba(150,190,80,.35)'; this.rr(px + 1, py + 1, pw - 2, ph - 2, 4); c.fill(); }
      if (b.site && b.reason === 'rebuilding after the fire') { c.fillStyle = 'rgba(30,24,20,.35)'; this.rr(px + 2, py + 2, pw - 4, ph - 4, 4); c.fill(); }
      if (b.burn > 0) {
        // flames that flicker with the game clock
        for (let k = 0; k < b.w + 1; k++) {
          const f = 0.6 + 0.4 * Math.sin(S.t * 9 + k * 2.1 + b.id), x = px + (k + 0.5) * pw / (b.w + 1), h = ph * 0.55 * f;
          c.fillStyle = 'rgba(232,110,40,.85)'; c.beginPath(); c.moveTo(x - 6, py + ph * 0.7); c.quadraticCurveTo(x, py + ph * 0.7 - h * 1.4, x + 6, py + ph * 0.7); c.fill();
          c.fillStyle = 'rgba(250,210,90,.9)'; c.beginPath(); c.moveTo(x - 3, py + ph * 0.7); c.quadraticCurveTo(x, py + ph * 0.7 - h * 0.8, x + 3, py + ph * 0.7); c.fill();
        }
      }
    }
    for (const camp of S.camps) {
      const x = camp.x * TS, y = camp.y * TS;
      // a tent for every few raiders, and a red pennant (white once a settlement sends them bread)
      const tents = Math.max(1, Math.min(4, Math.round(camp.strength / 2.5)));
      for (let k = 0; k < tents; k++) {
        const tx = x + (k - (tents - 1) / 2) * 14, ty = y + (k % 2) * 5;
        c.fillStyle = '#5b4a3a'; c.beginPath(); c.moveTo(tx - 7, ty + 6); c.lineTo(tx, ty - 7); c.lineTo(tx + 7, ty + 6); c.closePath(); c.fill();
        c.strokeStyle = '#2a2018'; c.lineWidth = 1; c.stroke();
      }
      c.strokeStyle = '#2a2018'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x, y - 20); c.stroke();
      c.fillStyle = camp.goodwill > 0 ? '#f2efe6' : '#c0392b'; c.beginPath(); c.moveTo(x, y - 20); c.lineTo(x + 10, y - 16); c.lineTo(x, y - 12); c.fill();
      const r = camp.raid;
      if (r) for (let k = 0; k < r.n; k++) {
        const ox = ((k % 3) - 1) * 5, oy = (Math.floor(k / 3) - 1) * 5;
        c.fillStyle = '#b03a2e'; c.beginPath(); c.arc(r.x * TS + ox, r.y * TS + oy, 3.2, 0, 7); c.fill();
        c.strokeStyle = '#1b1210'; c.lineWidth = 1; c.stroke();
      }
    }
  }

  private rr(x: number, y: number, w: number, h: number, r: number) {
    const c = this.ctx; c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
  }
  private bar(x: number, y: number, w: number, h: number, f: number, col: string) {
    const c = this.ctx;
    c.fillStyle = 'rgba(20,28,30,.55)'; c.fillRect(x, y, w, h);
    c.fillStyle = col; c.fillRect(x, y, w * Math.max(0, Math.min(1, f)), h);
  }
  private ring(b: { x: number; y: number; w: number; h: number }, r: number, col: string) {
    const c = this.ctx, p = ctr(b);
    c.strokeStyle = col; c.lineWidth = 1.5; c.setLineDash([5, 4]);
    c.beginPath(); c.arc(p.x * TS, p.y * TS, r * TS, 0, 7); c.stroke(); c.setLineDash([]);
  }
  private hut(px: number, py: number, pw: number, ph: number, wall: string, roof: string) {
    const c = this.ctx;
    c.fillStyle = wall; this.rr(px + 4, py + ph * 0.42, pw - 8, ph * 0.52, 3); c.fill();
    c.fillStyle = roof; this.rr(px + 2, py + 3, pw - 4, ph * 0.46, 4); c.fill();
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(px + 5, py + ph * 0.24, pw - 10, 2);
    // the door on its tile: the middle tile of the bottom row (the right-hand one of the middle two on an even width)
    c.fillStyle = '#5c3f2b'; c.fillRect(px + (Math.floor(Math.round(pw / TS) / 2) + 0.5) * TS - 3.5, py + ph - 13, 7, 10);
  }
  /** An ox: a brown body, a darker head ahead of it and two pale horns. */
  private ox(x: number, y: number, t: number) {
    const c = this.ctx, bob = Math.sin(t * 5) * 0.6;
    c.fillStyle = '#8a5a34'; c.beginPath(); c.ellipse(x, y + bob, 5.5, 3.4, 0, 0, 7); c.fill();
    c.fillStyle = '#5e3c22'; c.beginPath(); c.arc(x + 5.5, y - 1 + bob, 2.2, 0, 7); c.fill();
    c.strokeStyle = '#efe6cf'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 5, y - 3 + bob); c.lineTo(x + 4, y - 5 + bob); c.moveTo(x + 6.5, y - 3 + bob); c.lineTo(x + 7.5, y - 5 + bob); c.stroke();
  }
  private gear(x: number, y: number, r: number, rot: number, col: string) {
    const c = this.ctx;
    c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = col;
    for (let k = 0; k < 8; k++) { c.rotate(Math.PI / 4); c.fillRect(-1.6, -r - 2.5, 3.2, 4); }
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#3e4b51'; c.beginPath(); c.arc(0, 0, r * 0.4, 0, Math.PI * 2); c.fill(); c.restore();
  }

  private art(S: State, b: Building, px: number, py: number, pw: number, ph: number) {
    const c = this.ctx, B = S.content.blueprints[b.type], live = !b.site && b.status.l === 'ok';
    switch (b.type) {
      case 'storage': {
        c.fillStyle = '#8b7350'; this.rr(px + 2, py + 2, pw - 4, ph - 4, 4); c.fill();
        c.strokeStyle = '#6d583c'; c.lineWidth = 1.5; c.stroke();
        for (const [fx, fy] of [[0.12, 0.12], [0.45, 0.12], [0.12, 0.45]]) {
          const s = pw * 0.3, x = px + pw * fx, y = py + ph * fy;
          c.fillStyle = '#b88c55'; c.fillRect(x, y, s, s); c.strokeStyle = '#6d4f2e'; c.lineWidth = 1.2; c.strokeRect(x, y, s, s);
          c.beginPath(); c.moveTo(x, y); c.lineTo(x + s, y + s); c.moveTo(x + s, y); c.lineTo(x, y + s); c.stroke();
        }
        for (const [fx, fy] of [[0.62, 0.68], [0.8, 0.68], [0.71, 0.54]]) {
          c.fillStyle = '#8b5a33'; c.beginPath(); c.arc(px + pw * fx, py + ph * fy, 5, 0, 7); c.fill();
          c.fillStyle = '#c79a6a'; c.beginPath(); c.arc(px + pw * fx, py + ph * fy, 2.4, 0, 7); c.fill();
        }
        return;
      }
      case 'house': case 'family_house': case 'terrace': {
        this.hut(px, py, pw, ph, '#dccaa2', B.color);
        c.fillStyle = b.residents.length && b.status.l !== 'bad' ? '#f0c27a' : '#5e5446';
        // a window each side of every door-width of wall; terraces show a party wall between each home
        const bays = Math.max(1, Math.round(b.w / 2));
        for (let k = 0; k < bays; k++) {
          const bx = px + (pw / bays) * k;
          c.fillRect(bx + 9, py + ph * 0.58, 6, 6); c.fillRect(bx + pw / bays - 15, py + ph * 0.58, 6, 6);
          if (k) { c.fillStyle = 'rgba(60,40,30,.5)'; c.fillRect(bx - 1, py + ph * 0.4, 2, ph * 0.55); c.fillStyle = b.residents.length && b.status.l !== 'bad' ? '#f0c27a' : '#5e5446'; }
        }
        return;
      }
      case 'forester': {
        this.hut(px, py, pw, ph, '#b08f63', B.color);
        c.fillStyle = '#2f5a36'; c.beginPath(); c.moveTo(px + pw - 10, py + ph * 0.5); c.lineTo(px + pw - 3, py + ph - 4); c.lineTo(px + pw - 17, py + ph - 4); c.fill();
        return;
      }
      case 'sawmill': {
        this.hut(px, py, pw, ph, '#c3a882', B.color);
        c.save(); c.translate(px + pw * 0.78, py + ph * 0.7); c.rotate(live ? S.t * 9 : 0);
        c.fillStyle = '#cfd6d2'; c.beginPath(); c.arc(0, 0, 6, 0, 7); c.fill();
        c.strokeStyle = '#5b6b70'; c.lineWidth = 1.2;
        for (let k = 0; k < 6; k++) { c.rotate(Math.PI / 3); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -6); c.stroke(); }
        c.restore();
        return;
      }
      case 'farm': {
        c.fillStyle = '#7d5f35'; this.rr(px + 2, py + 2, pw - 4, ph - 4, 4); c.fill();
        const ripe = b.site ? 0.2 : 0.35 + 0.65 * (B.seconds ? b.timer / B.seconds : 0);
        // the farmhouse stands in the first two rows, by the door; grown fields stretch away behind
        const hy = py + ph - 2 * TS;
        c.fillStyle = `rgba(227,196,84,${ripe})`;
        for (let y = py + 6; y < py + ph - 5; y += 6) c.fillRect(y >= hy && y < hy + 22 ? px + 20 : px + 6, y, y >= hy && y < hy + 22 ? pw - 26 : pw - 12, 3);
        c.fillStyle = '#b5654a'; this.rr(px + 4, hy + 6, 12, 14, 2); c.fill();
        c.fillStyle = '#dccaa2'; c.fillRect(px + 6, hy + 14, 8, 6);
        return;
      }
      case 'garden': {
        c.fillStyle = '#5b4630'; this.rr(px + 2, py + 2, pw - 4, ph - 4, 4); c.fill();
        // beds of greens, fuller as the crop comes on; a shed by the door
        const hy = py + ph - 2 * TS, grow = b.site ? 0.3 : 0.5 + 0.5 * (B.seconds ? b.timer / B.seconds : 0);
        for (let y = py + 7; y < py + ph - 6; y += 7) for (let x = px + 8; x < px + pw - 6; x += 7) {
          if (x < px + 20 && y >= hy && y < hy + 22) continue;
          c.fillStyle = (x + y) % 3 ? '#79b54f' : '#d08a3c'; c.beginPath(); c.arc(x, y, 2.3 * grow, 0, 7); c.fill();
        }
        c.fillStyle = '#8d6b48'; this.rr(px + 4, hy + 8, 12, 12, 2); c.fill();
        return;
      }
      case 'orchard': {
        c.fillStyle = '#6f9a4a'; this.rr(px + 2, py + 2, pw - 4, ph - 4, 4); c.fill();
        // rows of trees, small while young; fruit on them once they bear
        const young = !b.site && B.ripens > 0 && b.plantT < B.ripens, r = b.site ? 3 : young ? 3 + 3 * (b.plantT / B.ripens) : 6.5;
        for (let y = py + TS / 2; y < py + ph; y += TS) for (let x = px + TS / 2; x < px + pw; x += TS) {
          c.fillStyle = '#6b4a2f'; c.fillRect(x - 1, y, 2, 6);
          c.fillStyle = '#3f7a3a'; c.beginPath(); c.arc(x, y - 1, r, 0, 7); c.fill();
          if (!b.site && !young && seasonOf(S) !== 'winter') { c.fillStyle = '#d5503f'; c.beginPath(); c.arc(x - 2.5, y - 2, 1.6, 0, 7); c.arc(x + 2.5, y + 1, 1.6, 0, 7); c.fill(); }
        }
        return;
      }
      case 'pasture': {
        c.fillStyle = '#8fbf62'; this.rr(px + 2, py + 2, pw - 4, ph - 4, 4); c.fill();
        // a fence round it, a byre by the door, and the herd grazing
        c.strokeStyle = '#7b5a3a'; c.lineWidth = 1.5; this.rr(px + 3, py + 3, pw - 6, ph - 6, 3); c.stroke();
        const hy = py + ph - 2 * TS;
        c.fillStyle = '#9b5a3e'; this.rr(px + 5, hy + 9, 14, 12, 2); c.fill();
        const cows = Math.max(2, Math.round((b.w * b.h) / 4));
        for (let k = 0; k < cows; k++) {
          const t = live ? S.t * 0.15 + k * 2.1 : k * 2.1;
          const x = px + 26 + ((k * 37) % Math.max(1, pw - 36)) + Math.sin(t) * 3, y = py + 10 + ((k * 23) % Math.max(1, ph - 20)) + Math.cos(t * 0.7) * 2;
          c.fillStyle = '#f2efe6'; c.beginPath(); c.ellipse(x, y, 5, 3.2, 0, 0, 7); c.fill();
          c.fillStyle = '#3d3a36'; c.beginPath(); c.arc(x + 1.5, y - 0.5, 1.4, 0, 7); c.arc(x + 5, y - 1, 1.6, 0, 7); c.fill();
        }
        return;
      }
      case 'field': {
        // new fields being laid: furrows turned in the bare earth
        c.fillStyle = '#8a6a42'; this.rr(px + 2, py + 2, pw - 4, ph - 4, 3); c.fill();
        c.strokeStyle = 'rgba(60,40,20,.45)'; c.lineWidth = 1;
        for (let x = px + 6; x < px + pw - 3; x += 5) { c.beginPath(); c.moveTo(x, py + 4); c.lineTo(x, py + ph - 4); c.stroke(); }
        return;
      }
      case 'bakery': {
        this.hut(px, py, pw, ph, '#d6b88c', B.color);
        c.fillStyle = '#5a3d30'; c.fillRect(px + pw * 0.68, py - 3, 6, 10);
        if (live) {
          c.fillStyle = 'rgba(236,230,214,.45)';
          for (let k = 0; k < 3; k++) { const p = (S.t * 0.7 + k / 3) % 1; c.beginPath(); c.arc(px + pw * 0.68 + 3 + p * 6, py - 4 - p * 16, 2 + p * 3, 0, 7); c.fill(); }
        }
        return;
      }
      case 'depot': {
        c.fillStyle = '#55666e'; this.rr(px + 2, py + 2, pw - 4, ph - 4, 5); c.fill();
        c.strokeStyle = '#7d9098'; c.lineWidth = 1.2; c.stroke();
        c.fillStyle = '#3e4b51'; c.beginPath(); c.arc(px + pw / 2, py + ph / 2, pw * 0.34, 0, 7); c.fill();
        this.gear(px + pw / 2, py + ph / 2, 7, b.site ? 0 : S.t * 1.5, '#d29b4a');
        return;
      }
      case 'dock': {
        // a boathouse with a jetty running out from its door to the water below
        this.hut(px, py, pw, ph * 0.8, '#b89c6c', '#7a5a3a');
        const jx = px + (pw * 3) / 4 - 4;
        c.fillStyle = '#8a6a44'; c.fillRect(jx, py + ph * 0.75, 8, ph * 0.5);
        c.strokeStyle = '#5a4020'; c.lineWidth = 1;
        for (let k = 0; k < 3; k++) { const y = py + ph * 0.8 + k * 5; c.beginPath(); c.moveTo(jx, y); c.lineTo(jx + 8, y); c.stroke(); }
        return;
      }
      case 'ox_barn': {
        // a barn on the left, and a fenced yard with the oxen at home
        this.hut(px, py, pw * 0.55, ph, '#c8a878', B.color);
        const yx = px + pw * 0.55, yw = pw * 0.45 - 3;
        c.fillStyle = '#a9b86a'; this.rr(yx, py + 4, yw, ph - 8, 3); c.fill();
        c.strokeStyle = '#7b5a3a'; c.lineWidth = 1.5; this.rr(yx, py + 4, yw, ph - 8, 3); c.stroke();
        let out = 0;
        for (const a of S.agents) if (a.cart === b.id) out++;
        for (let k = 0; k < Math.max(0, B.oxen - out); k++) this.ox(yx + yw / 2 - 2, py + ph * (0.35 + k * 0.32), 0);
        return;
      }
      default:
        // Any blueprint without bespoke art gets a hut in its own colour.
        this.hut(px, py, pw, ph, '#cdb892', B.color);
    }
  }

  /** Draw a building's art facing its way: the art is drawn facing south, turned about the footprint's centre. */
  private turned(S: State, b: Building, px: number, py: number, pw: number, ph: number) {
    const r = b.rot || 0;
    if (!r) { this.art(S, b, px, py, pw, ph); return; }
    const c = this.ctx, w = r % 2 ? ph : pw, h = r % 2 ? pw : ph;
    c.save(); c.translate(px + pw / 2, py + ph / 2); c.rotate((r * Math.PI) / 2);
    // the art sees the footprint as it was before turning
    this.art(S, r % 2 ? { ...b, w: b.h, h: b.w } : b, -w / 2, -h / 2, w, h);
    c.restore();
  }

  private building(S: State, b: Building) {
    const c = this.ctx, B = S.content.blueprints[b.type], px = b.x * TS, py = b.y * TS, pw = b.w * TS, ph = b.h * TS;
    if (B.bridge) { this.bridge(S, b, px, py, pw, ph); return; }
    c.fillStyle = 'rgba(16,26,22,.22)'; this.rr(px + 3, py + 4, pw - 4, ph - 4, 5); c.fill();
    if (b.site) {
      c.globalAlpha = 0.4; this.turned(S, b, px, py, pw, ph); c.globalAlpha = 1;
      c.save(); this.rr(px + 2, py + 2, pw - 4, ph - 4, 4); c.clip();
      c.strokeStyle = 'rgba(122,92,60,.55)'; c.lineWidth = 1.5;
      for (let k = -ph; k < pw; k += 7) { c.beginPath(); c.moveTo(px + k, py + ph); c.lineTo(px + k + ph, py); c.stroke(); }
      c.restore();
      c.setLineDash([4, 3]); c.strokeStyle = '#d29b4a'; c.lineWidth = 1.5; this.rr(px + 2, py + 2, pw - 4, ph - 4, 4); c.stroke(); c.setLineDash([]);
      const total = Object.values(B.cost).reduce((s, n) => s + n, 0);
      const have = Object.keys(B.cost).reduce((s, k) => s + Math.min(B.cost[k], b.inv[k] || 0), 0);
      const f = total ? have / total : 1;
      this.bar(px + 5, py + ph - 9, pw - 10, 4, f, '#d9b37a');
      if (f >= 1) this.bar(px + 5, py + ph - 15, pw - 10, 3, b.build / S.content.tuning.production.buildSeconds, '#7fc28a');
      return;
    }
    this.turned(S, b, px, py, pw, ph);
    if (b.paused) { c.fillStyle = 'rgba(20,28,30,.4)'; this.rr(px + 2, py + 2, pw - 4, ph - 4, 4); c.fill(); }
    if (B.workers && b.timer > 0 && b.status.l === 'ok') {
      c.strokeStyle = '#f0c27a'; c.lineWidth = 2; c.beginPath();
      c.arc(px + 8, py + 8, 4.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (b.timer / B.seconds)); c.stroke();
    }
    if (b.status.l === 'bad' || b.status.l === 'warn') {
      const x = px + pw - 5, y = py + 3;
      c.fillStyle = b.status.l === 'bad' ? '#e2735e' : '#e8b04a';
      c.beginPath(); c.arc(x, y, 6.5, 0, 7); c.fill(); c.strokeStyle = '#1b2326'; c.lineWidth = 1.2; c.stroke();
      c.fillStyle = '#1b2326'; c.font = 'bold 10px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', x, y + 0.5);
    }
  }

  /** The player's zones, tinted lightly; no-build land hatched. */
  private zones(S: State, x0: number, x1: number, y0: number, y1: number) {
    const c = this.ctx, w = S.world;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const z = w.zone[y * w.w + x];
      if (!z) continue;
      c.fillStyle = ZONE_TINT[z - 1]; c.fillRect(x * TS, y * TS, TS, TS);
      if (z === 4) { c.strokeStyle = 'rgba(176,65,62,.5)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x * TS, y * TS + TS); c.lineTo(x * TS + TS, y * TS); c.stroke(); }
    }
  }

  /** Overlays: how each home feels, where the saws are heard, whose district a tile is, where feet go, where bots and carts reach, what guards the homes. */
  private overlay(S: State, kind: View['overlay'], x0: number, x1: number, y0: number, y1: number) {
    const c = this.ctx, w = S.world;
    if (kind === 'traffic') {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const v = w.wear[y * w.w + x];
        if (v < 1) continue;
        c.fillStyle = `rgba(240,120,40,${Math.min(0.7, 0.1 + v / 60)})`; c.fillRect(x * TS, y * TS, TS, TS);
      }
    } else if (kind === 'districts') {
      const hubs = S.towns.flatMap(t => t.districts.map((id, k) => ({ b: S.bmap.get(id), hue: (t.id * 97 + k * 61) % 360 }))).filter(h => h.b);
      if (!hubs.length) return;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!w.ground[y * w.w + x]) continue;
        let best = hubs[0], bd = Infinity;
        for (const h of hubs) { const d = (h.b!.x + 1.5 - x) ** 2 + (h.b!.y + 1.5 - y) ** 2; if (d < bd) { bd = d; best = h; } }
        if (bd > 30 * 30) continue;
        c.fillStyle = `hsla(${best.hue},60%,55%,.18)`; c.fillRect(x * TS, y * TS, TS, TS);
      }
    } else if (kind === 'mood') {
      for (const b of S.buildings) {
        const B = S.content.blueprints[b.type];
        if (!B.homes || b.site) continue;
        const v = surroundings(S, b).score * (b.hunger > 0 ? 0.3 : 1);
        c.fillStyle = `hsla(${Math.round(v * 120)},70%,50%,.55)`; this.rr(b.x * TS + 2, b.y * TS + 2, b.w * TS - 4, b.h * TS - 4, 4); c.fill();
      }
    } else if (kind === 'cover') {
      // what keeps the homes safe: each counter's reach in the colour of its hazard, a bathhouse's in teal, and how far raiders range from their camps
      const hue: Record<string, string> = { fire: '226,115,94', flood: '90,155,212', sickness: '143,196,106', raids: '214,176,82' };
      for (const b of S.buildings) {
        const B = S.content.blueprints[b.type];
        if (b.site || (!B.guards && !B.sanitation)) continue;
        const col = B.guards ? hue[B.guards.hazard] : '127,209,199', r = B.guards ? B.guards.radius : B.sanitation!.radius;
        c.fillStyle = `rgba(${col},.14)`;
        c.beginPath(); c.arc((b.x + b.w / 2) * TS, (b.y + b.h / 2) * TS, r * TS, 0, 7); c.fill();
        this.ring(b, r, `rgba(${col},.85)`);
      }
      const reach = S.content.tuning.hardship.raidReach;
      for (const camp of S.camps) if (!(camp.friend !== null && camp.goodwill > 0)) this.ring({ x: camp.x - 0.5, y: camp.y - 0.5, w: 1, h: 1 }, reach, 'rgba(176,65,62,.8)');
    } else if (kind === 'nuisance' || kind === 'coverage') {
      for (const b of S.buildings) {
        // bots reach as far as their depot's radius; carts are fetched from a shed or barn within `cart_reach` of a carter
        const B = S.content.blueprints[b.type], r = kind === 'nuisance' ? B.nuisance?.radius : B.couriers?.radius ?? (B.carts || B.oxen ? S.content.tuning.logistics.cartReach : undefined);
        if (!r || b.site) continue;
        c.fillStyle = kind === 'nuisance' ? 'rgba(226,115,94,.18)' : 'rgba(240,194,122,.16)';
        c.beginPath(); c.arc((b.x + b.w / 2) * TS, (b.y + b.h / 2) * TS, r * TS, 0, 7); c.fill();
        this.ring(b, r, kind === 'nuisance' ? 'rgba(226,115,94,.8)' : 'rgba(240,194,122,.85)');
      }
    }
  }

  /** Planks across the water, rails along both sides; a site shows its first planks and the rest as an outline. */
  private bridge(S: State, b: Building, px: number, py: number, pw: number, ph: number) {
    const c = this.ctx, across = b.h === 1, n = across ? b.w : b.h;
    const have = b.site ? Math.min(1, (b.inv.planks || 0) / (S.content.blueprints[b.type].cost.planks || 1)) : 1;
    c.fillStyle = 'rgba(16,26,22,.25)'; c.fillRect(px + 2, py + 4, pw, ph);
    const planks = Math.ceil(n * 4 * have);
    for (let k = 0; k < planks; k++) {
      c.fillStyle = k % 2 ? '#9a7448' : '#a77f50';
      if (across) c.fillRect(px + k * (TS / 4), py + 3, TS / 4 - 1, ph - 6);
      else c.fillRect(px + 3, py + k * (TS / 4), pw - 6, TS / 4 - 1);
    }
    c.strokeStyle = b.site ? 'rgba(122,92,60,.7)' : '#6b4f30'; c.lineWidth = 2;
    if (b.site) c.setLineDash([4, 3]);
    c.beginPath();
    if (across) { c.moveTo(px, py + 3); c.lineTo(px + pw, py + 3); c.moveTo(px, py + ph - 3); c.lineTo(px + pw, py + ph - 3); }
    else { c.moveTo(px + 3, py); c.lineTo(px + 3, py + ph); c.moveTo(px + pw - 3, py); c.lineTo(px + pw - 3, py + ph); }
    c.stroke(); c.setLineDash([]);
  }

  /** Each settlement's name above its storage yard. */
  private townLabels(S: State, z: number) {
    const c = this.ctx;
    // names keep the same size on screen however far out the camera is, so villages can be found on a big map
    const k = Math.max(1, 1 / z);
    c.font = `700 ${13 * k}px "Alegreya Sans SC", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'bottom';
    for (const t of S.towns) {
      const b = S.bmap.get(t.store);
      if (!b) continue;
      const x = (b.x + b.w / 2) * TS, y = b.y * TS - 4 * k;
      if (z < 0.6) {
        c.fillStyle = '#f0c27a'; c.strokeStyle = '#1b2326'; c.lineWidth = 2 * k;
        c.beginPath(); c.arc(x, (b.y + b.h / 2) * TS, 5 * k, 0, 7); c.fill(); c.stroke();
      }
      c.lineWidth = 3 * k; c.strokeStyle = 'rgba(27,35,38,.85)'; c.strokeText(t.name, x, y);
      c.fillStyle = '#f0c27a'; c.fillText(t.name, x, y);
    }
  }

  private agent(S: State, a: Agent) {
    if (a.state === 'working') return;
    const c = this.ctx, x = a.x * TS, y = a.y * TS, w = S.world;
    if (!w.ground[Math.floor(a.y) * w.w + Math.floor(a.x)]) {
      // rowing: a small boat under the villager
      c.fillStyle = '#7a5a3a'; c.beginPath(); c.ellipse(x, y + 3, 8, 3.6, 0, 0, 7); c.fill();
      c.strokeStyle = '#4e3820'; c.lineWidth = 1; c.stroke();
    } else { c.fillStyle = 'rgba(16,26,22,.3)'; c.beginPath(); c.ellipse(x, y + 4, 4.5, 2, 0, 0, 7); c.fill(); }
    if (a.kind === 'bot') {
      const by = y - 3 + Math.sin(S.t * 6 + a.id) * 1.2;
      c.fillStyle = '#d29b4a'; this.rr(x - 4.5, by - 4.5, 9, 8, 2); c.fill(); c.strokeStyle = '#5a4020'; c.lineWidth = 1; c.stroke();
      c.fillStyle = '#2b3a3f'; c.fillRect(x - 2.5, by - 2, 5, 2);
      c.beginPath(); c.moveTo(x, by - 4.5); c.lineTo(x, by - 7.5); c.stroke();
    } else {
      // children are drawn smaller, in a lighter coat
      const s = a.role === 'child' ? 0.65 : 1;
      c.fillStyle = a.state === 'visit' ? '#b07cc6' : a.role === 'worker' ? '#6f9a4d' : a.role === 'child' ? '#8fb8d0' : '#4f86a8';
      c.beginPath(); c.arc(x, y + (1 - s) * 3, 3.8 * s, 0, 7); c.fill();
      c.fillStyle = '#f1d3b0'; c.beginPath(); c.arc(x, y - 4.5 * s + (1 - s) * 3, 2.4 * s, 0, 7); c.fill();
    }
    const shed = a.cart !== null ? S.bmap.get(a.cart) : undefined;
    if (shed && S.content.blueprints[shed.type].oxen) {
      // an ox cart: a long wagon on two big wheels behind the carter, the ox ahead pulling
      c.fillStyle = '#7a5a3a'; this.rr(x - 15, y - 3, 11, 6, 1); c.fill();
      c.fillStyle = '#3a2a1a'; c.beginPath(); c.arc(x - 12, y + 4, 2.2, 0, 7); c.arc(x - 7, y + 4, 2.2, 0, 7); c.fill();
      this.ox(x + 8, y + 1, S.t + a.id);
    } else if (a.cart !== null) {
      // a handcart: a small box on two wheels beside the carter
      c.fillStyle = '#8a6a4a'; this.rr(x + 3, y - 2, 8, 5, 1); c.fill();
      c.fillStyle = '#3a2a1a'; c.beginPath(); c.arc(x + 5, y + 4, 1.6, 0, 7); c.arc(x + 9, y + 4, 1.6, 0, 7); c.fill();
    }
    if (a.carry) {
      c.fillStyle = S.content.goods[a.carry.item]?.color ?? '#fff';
      this.rr(x - 3.5, y - (a.kind === 'bot' ? 15 : 12), 7, 5, 1); c.fill();
      c.strokeStyle = 'rgba(20,20,20,.5)'; c.lineWidth = 0.8; c.stroke();
    }
  }
}

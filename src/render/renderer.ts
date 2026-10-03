/** Canvas 2D renderer. Reads sim state; never changes it. */
import { canPlace, ctr, hash01, type Agent, type Building, type State } from '../sim/index.ts';

export const TS = 24;

export interface Camera { x: number; y: number; z: number }
export interface View {
  cam: Camera;
  hover: { x: number; y: number } | null;
  tool: string | null;
  sel: Building | null;
  routes: boolean;
}

type Ctx = CanvasRenderingContext2D;

export function ghostOrigin(S: State, type: string, t: { x: number; y: number }) {
  const B = S.content.blueprints[type];
  return { x: t.x - Math.floor((B.w - 1) / 2), y: t.y - Math.floor((B.h - 1) / 2) };
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: Ctx;
  private ground: HTMLCanvasElement | null = null;
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

  private buildGround(S: State) {
    const w = S.world, cv = document.createElement('canvas');
    cv.width = w.w * TS; cv.height = w.h * TS;
    const g = cv.getContext('2d')!;
    const near = (x: number, y: number) => {
      for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        const xx = x + k, yy = y + j;
        if (xx >= 0 && yy >= 0 && xx < w.w && yy < w.h && w.ground[yy * w.w + xx]) return true;
      }
      return false;
    };
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
      const i = y * w.w + x, v = hash01(i), gr = w.ground[i];
      g.fillStyle = !gr ? (near(x, y) ? '#2a6670' : '#1f5562') : gr === 1 ? (v < 0.5 ? '#d6c08a' : '#dcc794') : v < 0.33 ? '#6c9850' : v < 0.66 ? '#719d54' : '#77a258';
      g.fillRect(x * TS, y * TS, TS, TS);
      if (gr === 2) {
        g.fillStyle = 'rgba(40,70,30,.22)';
        for (let k = 0; k < 3; k++) g.fillRect(x * TS + hash01(i * 7 + k) * 20 + 2, y * TS + hash01(i * 13 + k) * 20 + 2, 2, 2);
      }
      if (!gr && near(x, y)) { g.fillStyle = 'rgba(236,240,226,.12)'; g.fillRect(x * TS + v * 12, y * TS + 6 + hash01(i + 3) * 10, 8, 1.5); }
    }
    this.ground = cv; this.groundOf = S;
  }

  draw(S: State, v: View) {
    if (this.groundOf !== S) this.buildGround(S);
    const c = this.ctx, { cam } = v, w = S.world, dpr = this.dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#1d4b57'; c.fillRect(0, 0, this.cw, this.ch);
    c.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (this.cw / 2 - cam.x * cam.z), dpr * (this.ch / 2 - cam.y * cam.z));
    c.drawImage(this.ground!, 0, 0);
    const a0 = this.toWorld(cam, 0, 0), a1 = this.toWorld(cam, this.cw, this.ch);
    const cl = (n: number, hi: number) => Math.max(0, Math.min(hi, n));
    const x0 = cl(Math.floor(a0.x / TS) - 1, w.w - 1), x1 = cl(Math.ceil(a1.x / TS) + 1, w.w - 1);
    const y0 = cl(Math.floor(a0.y / TS) - 1, w.h - 1), y1 = cl(Math.ceil(a1.y / TS) + 1, w.h - 1);

    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!w.road[y * w.w + x]) continue;
      c.fillStyle = '#a58b5f'; c.fillRect(x * TS, y * TS, TS, TS);
      c.fillStyle = '#c2a877'; c.fillRect(x * TS + 3, y * TS + 3, TS - 6, TS - 6);
    }
    const grow = S.content.tuning.map.treeGrowSeconds;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * w.w + x, t = w.tree[i];
      if (!t) continue;
      const h = hash01(i), cx = x * TS + TS / 2 + (h - 0.5) * 5, cy = y * TS + TS / 2 + (hash01(i + 9) - 0.5) * 5;
      const r = t === 2 ? TS * (0.38 + h * 0.08) : TS * (0.12 + (0.22 * w.grow[i]) / grow);
      c.fillStyle = 'rgba(16,30,18,.28)'; c.beginPath(); c.ellipse(cx + 2, cy + r * 0.7, r, r * 0.45, 0, 0, 7); c.fill();
      c.fillStyle = t === 2 ? (h < 0.5 ? '#2f5a36' : '#355f37') : '#5e8d4a'; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill();
      c.fillStyle = t === 2 ? '#43774a' : '#7aa960'; c.beginPath(); c.arc(cx - r * 0.3, cy - r * 0.3, r * 0.45, 0, 7); c.fill();
    }
    for (const b of [...S.buildings].sort((p, q) => p.y - q.y)) this.building(S, b);

    if (v.sel && !v.sel.dead) {
      const b = v.sel, B = S.content.blueprints[b.type];
      c.strokeStyle = '#f0c27a'; c.lineWidth = 2; this.rr(b.x * TS, b.y * TS, b.w * TS, b.h * TS, 6); c.stroke();
      if (B.harvest) this.ring(b, B.harvest.radius, 'rgba(127,194,138,.8)');
      if (B.couriers) this.ring(b, B.couriers.radius, 'rgba(240,194,122,.85)');
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
    if (S.towns.length > 1) this.townLabels(S);
    if (v.tool && v.hover) {
      const B = S.content.blueprints[v.tool], o = B.paves ? v.hover : ghostOrigin(S, v.tool, v.hover), ok = canPlace(S, v.tool, o.x, o.y);
      c.fillStyle = ok ? 'rgba(127,194,138,.35)' : 'rgba(226,115,94,.4)';
      c.strokeStyle = ok ? '#7fc28a' : '#e2735e'; c.lineWidth = 1.5;
      this.rr(o.x * TS, o.y * TS, B.w * TS, B.h * TS, 4); c.fill(); c.stroke();
      const fake = { x: o.x, y: o.y, w: B.w, h: B.h };
      if (B.harvest) this.ring(fake, B.harvest.radius, 'rgba(127,194,138,.8)');
      if (B.couriers) this.ring(fake, B.couriers.radius, 'rgba(240,194,122,.85)');
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
    c.fillStyle = '#5c3f2b'; c.fillRect(px + pw / 2 - 3.5, py + ph - 13, 7, 10);
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
      case 'house': {
        this.hut(px, py, pw, ph, '#dccaa2', B.color);
        c.fillStyle = b.residents.length && b.status.l !== 'bad' ? '#f0c27a' : '#5e5446';
        c.fillRect(px + 9, py + ph * 0.58, 6, 6); c.fillRect(px + pw - 15, py + ph * 0.58, 6, 6);
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
        c.fillStyle = `rgba(227,196,84,${ripe})`;
        for (let y = py + 6; y < py + ph - 5; y += 6) c.fillRect(px + 20, y, pw - 26, 3);
        c.fillStyle = '#b5654a'; this.rr(px + 4, py + 6, 12, 14, 2); c.fill();
        c.fillStyle = '#dccaa2'; c.fillRect(px + 6, py + 14, 8, 6);
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
      default:
        // Any blueprint without bespoke art gets a hut in its own colour.
        this.hut(px, py, pw, ph, '#cdb892', B.color);
    }
  }

  private building(S: State, b: Building) {
    const c = this.ctx, B = S.content.blueprints[b.type], px = b.x * TS, py = b.y * TS, pw = b.w * TS, ph = b.h * TS;
    c.fillStyle = 'rgba(16,26,22,.22)'; this.rr(px + 3, py + 4, pw - 4, ph - 4, 5); c.fill();
    if (b.site) {
      c.globalAlpha = 0.4; this.art(S, b, px, py, pw, ph); c.globalAlpha = 1;
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
    this.art(S, b, px, py, pw, ph);
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

  /** Each settlement's name above its storage yard. */
  private townLabels(S: State) {
    const c = this.ctx;
    c.font = '700 13px "Alegreya Sans SC", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'bottom';
    for (const t of S.towns) {
      const b = S.bmap.get(t.store);
      if (!b) continue;
      const x = (b.x + b.w / 2) * TS, y = b.y * TS - 4;
      c.lineWidth = 3; c.strokeStyle = 'rgba(27,35,38,.85)'; c.strokeText(t.name, x, y);
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
      c.fillStyle = a.state === 'visit' ? '#b07cc6' : a.role === 'worker' ? '#6f9a4d' : '#4f86a8';
      c.beginPath(); c.arc(x, y, 3.8, 0, 7); c.fill();
      c.fillStyle = '#f1d3b0'; c.beginPath(); c.arc(x, y - 4.5, 2.4, 0, 7); c.fill();
    }
    if (a.carry) {
      c.fillStyle = S.content.goods[a.carry.item]?.color ?? '#fff';
      this.rr(x - 3.5, y - (a.kind === 'bot' ? 15 : 12), 7, 5, 1); c.fill();
      c.strokeStyle = 'rgba(20,20,20,.5)'; c.lineWidth = 0.8; c.stroke();
    }
  }
}

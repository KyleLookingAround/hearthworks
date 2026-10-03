import { rand } from './rng.ts';
import { removeAgent } from './agents.ts';
import { add, bp, completeSite, ctr, emit, inB, plant } from './world.ts';
import type { Building, Level, State } from './types.ts';

const setStatus = (b: Building, t: string, l: Level) => { b.status.t = t; b.status.l = l; };

function nearestGrownTree(S: State, b: Building, r: number): number {
  const w = S.world, c = ctr(b);
  let best = -1, bd = Infinity;
  for (let y = Math.floor(c.y - r); y <= c.y + r; y++) for (let x = Math.floor(c.x - r); x <= c.x + r; x++) {
    if (!inB(w, x, y)) continue;
    const i = y * w.w + x;
    if (w.tree[i] !== 2) continue;
    const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y);
    if (d <= r && d < bd) { bd = d; best = i; }
  }
  return best;
}

function replant(S: State, b: Building, r: number) {
  const w = S.world, c = ctr(b), spots: number[] = [];
  let trees = 0;
  for (let y = Math.floor(c.y - r); y <= c.y + r; y++) for (let x = Math.floor(c.x - r); x <= c.x + r; x++) {
    if (!inB(w, x, y) || Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) > r) continue;
    const i = y * w.w + x;
    if (w.tree[i]) trees++;
    else if (w.ground[i] === 2 && w.bgrid[i] === -1 && !w.road[i]) spots.push(i);
  }
  if (trees < S.content.tuning.production.maxTreesNearForester && spots.length) {
    const i = spots[Math.floor(rand(S.rng) * spots.length)];
    plant(w, i);
  }
}

const itemsText = (S: State, items: string[]) => items.map(k => S.content.goods[k]?.name.toLowerCase() ?? k).join(' and ');

export function updateBuilding(S: State, b: Building, dt: number) {
  run(S, b, dt);
  if (b.noWay !== null && S.t - b.noWay < S.content.tuning.logistics.noWayRetrySeconds) setStatus(b, 'No way in: nobody can walk to its door', 'bad');
}

function run(S: State, b: Building, dt: number) {
  const B = bp(S, b), T = S.content.tuning;

  if (b.site) {
    const missing = Object.keys(B.cost).filter(k => (b.inv[k] || 0) < B.cost[k]);
    if (missing.length) {
      const n = missing.reduce((s, k) => s + B.cost[k] - (b.inv[k] || 0), 0);
      setStatus(b, `Waiting for ${n} ${itemsText(S, missing)}`, 'wait');
    } else {
      b.build += dt;
      setStatus(b, 'Builders at work', 'wait');
      if (b.build >= T.production.buildSeconds) completeSite(S, b, true);
    }
    return;
  }

  if (B.homes) {
    const r = b.residents.length;
    if (!r) { setStatus(b, 'Empty, waiting for newcomers', 'wait'); return; }
    const food = Object.keys(B.keepStocked)[0];
    b.eat += (dt * r) / T.needs.eatEverySeconds;
    if (b.eat >= 1) {
      if (food && (b.inv[food] || 0) > 0) { add(b.inv, food, -1); b.eat -= 1; b.hunger = 0; }
      else { b.eat = 1; b.hunger += dt; }
    }
    if (b.hunger > 0) {
      setStatus(b, `Out of ${itemsText(S, [food])}`, 'bad');
      if (b.hunger > T.needs.leaveAfterHungrySeconds) {
        const people = b.residents.map(id => S.amap.get(id)).filter(a => !!a);
        const leaver = people.find(a => a.role === 'carrier') ?? people[0];
        if (leaver) { removeAgent(S, leaver); S.stats.departures++; emit(S, 'bad', `A villager left: no ${itemsText(S, [food])} at home`); }
        b.hunger = 0; b.eat = 0;
      }
    } else if (!((b.inv[food] || 0) > 0)) setStatus(b, `Last of the ${itemsText(S, [food])} eaten`, 'warn');
    else setStatus(b, 'Fed and settled', 'ok');
    return;
  }

  if (!B.workers) {
    setStatus(b, B.couriers ? `${b.bots.length} bots hauling` : 'Open', 'ok');
    return;
  }
  if (B.harvest?.replant && !b.paused) {
    b.plantT += dt;
    if (b.plantT >= T.production.replantEverySeconds) { b.plantT = 0; replant(S, b, B.harvest.radius); }
  }
  if (b.paused) { setStatus(b, 'Paused', 'wait'); return; }
  const w = b.worker !== null ? S.amap.get(b.worker) : undefined;
  if (!w || w.state !== 'working') { setStatus(b, w ? 'Worker on the way' : 'No worker free', w ? 'wait' : 'bad'); return; }
  const lacking = Object.keys(B.input).filter(k => (b.inv[k] || 0) < B.input[k]);
  if (lacking.length) { setStatus(b, `Needs ${itemsText(S, lacking)}`, 'bad'); return; }
  if (Object.keys(B.output).some(k => (b.inv[k] || 0) >= T.logistics.outputCap)) { setStatus(b, 'Output full, waiting for a carrier', 'warn'); return; }
  let tree = -1;
  if (B.harvest) {
    tree = nearestGrownTree(S, b, B.harvest.radius);
    if (tree < 0) { setStatus(b, 'No grown trees nearby', 'bad'); return; }
  }
  setStatus(b, 'Working', 'ok');
  b.timer += dt;
  if (b.timer >= B.seconds) {
    b.timer = 0;
    for (const k in B.input) add(b.inv, k, -B.input[k]);
    if (tree >= 0) plant(S.world, tree);
    for (const k in B.output) { add(b.inv, k, B.output[k]); add(S.stats.made, k, B.output[k]); }
  }
}

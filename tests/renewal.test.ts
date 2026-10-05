import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadContent } from '../src/content/node.ts';
import { advise, createState, ctr, door, loadGame, placeBuilding, runFor, saveGame, type Content, type SaveFile, type State } from '../src/sim/index.ts';
import { centreOf, chooseSpot, hubs, renewalNote } from '../src/sim/planner.ts';
import { reachable } from '../src/sim/path.ts';

const content = loadContent();
const tuned = (edit: (c: Content) => void) => { const c = structuredClone(content); edit(c); return c; };
const text = (S: State) => JSON.stringify(saveGame(S));

/** Every door of the first settlement can still be walked to from its first storage yard. */
function walledIn(S: State): string[] {
  const w = S.world, d = door(S.bmap.get(S.towns[0].store)!), r = reachable(w, d.x, d.y);
  return S.buildings.filter(b => b.town === 0 && !S.content.blueprints[b.type].bridge && !r[door(b).y * w.w + door(b).x]).map(b => b.type);
}

test('renewal: a workplace idle for long comes down when the others make enough, salvaged, and never the last of its kind', () => {
  const S = createState(content, 7, { planner: true });
  runFor(S, 60);
  const town = S.towns[0], built: number[] = [];
  // four bakeries and four farms the planner built: far more bread than a hamlet eats
  for (const type of ['farm', 'bakery', 'farm', 'bakery', 'farm', 'bakery', 'farm', 'bakery']) {
    const at = chooseSpot(S, type, town)!;
    const b = placeBuilding(S, type, at.x, at.y, true)!;
    b.town = town.id; b.reason = 'bread is running low';
    if (type === 'bakery') built.push(b.id);
  }
  // one of the bakeries stands idle all along
  const idle = S.bmap.get(built[0])!;
  const stores = () => S.buildings.filter(b => b.town === 0 && S.content.blueprints[b.type].storage).reduce((n, b) => n + (b.inv.planks || 0), 0);
  for (let t = 0; t < 60 && !idle.dead; t++) {
    idle.idle = 1e6;
    if (t === 0) assert.match(renewalNote(S, idle) ?? '', /Idle for/);
    const before = stores();
    runFor(S, 10);
    if (idle.dead) assert.ok(stores() >= before, 'its planks salvaged into the stores');
  }
  assert.ok(idle.dead, 'the idle bakery came down');
  assert.ok(S.stats.pulledDown >= 1);
  assert.ok(S.buildings.some(b => b.type === 'bakery'), 'never the last bakery');
  assert.ok(S.chronicle.some(c => c.kind === 'pulled' && /pulled down a bakery: .* its other bakeries make the bread/.test(c.text)), 'the chronicle says why');
  assert.deepEqual(walledIn(S), []);
});

test('renewal: a hand-placed or paused workplace is never pulled down', () => {
  const S = createState(content, 7, { planner: true });
  runFor(S, 60);
  const town = S.towns[0], mine: number[] = [];
  for (let i = 0; i < 3; i++) {
    const at = chooseSpot(S, 'bakery', town)!;
    const b = placeBuilding(S, 'bakery', at.x, at.y, true)!;
    b.town = town.id; b.idle = 1e6;
    if (i === 1) { b.reason = 'bread is running low'; b.paused = true; }
    mine.push(b.id);
  }
  runFor(S, 400);
  assert.ok(mine.every(id => !S.bmap.get(id)?.dead && S.bmap.has(id)), 'the player\'s and the paused bakeries stand');
});

test('renewal: in a village a forester in the centre moves out, the old one comes down once the new one is built, and homes take the centre', () => {
  const S = createState(tuned(c => { c.tuning.planner.villageAt = 1; }), 42, { planner: true });
  const town = S.towns[0], hub = hubs(S, town)[0], c = ctr(hub);
  // a forester right beside the first storage yard, built by the planner
  let old = null;
  for (let r = 3; r <= 6 && !old; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
    const x = Math.round(c.x + dx - 1), y = Math.round(c.y + dy - 1);
    old ??= S.content.blueprints.forester && placeBuilding(S, 'forester', x, y, true) as ReturnType<typeof placeBuilding> | null;
    if (old) break;
  }
  assert.ok(old, 'a forester in the centre');
  old.town = town.id; old.reason = 'logs are running low';
  assert.ok(centreOf(S, town, old), 'it stands in the centre');
  runFor(S, 1800);
  assert.ok(S.stats.movedOut >= 1, `moved ${S.stats.movedOut}`);
  assert.ok(old.dead, 'the old forester came down');
  assert.ok(S.chronicle.some(c => c.kind === 'moved'), 'the chronicle says so');
  assert.ok(S.buildings.some(b => b.type === 'forester'), 'a forester still stands');
  assert.ok(S.buildings.some(b => b.id > old.id && S.content.blueprints[b.type].homes && centreOf(S, town, b)), 'new homes in the centre');
  assert.equal(S.stats.demolitionDepartures, 0);
  assert.deepEqual(walledIn(S), []);
});

test('the advisor names what was lately pulled down', () => {
  const S = createState(content, 7, { planner: true });
  S.chronicle.push({ t: S.t, town: 0, kind: 'pulled', text: 'Hearth pulled down a bakery: no worker for 12 minutes' });
  assert.ok(advise(S, S.towns[0], 9).some(l => l.startsWith('Renewing: Hearth pulled down a bakery')));
});

test('a version 29 save is upgraded to version 30: workplaces start with no idle time, nothing is being moved, and it plays on', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v29.json', import.meta.url), 'utf8')) as SaveFile;
  assert.equal(file.version, 29);
  const S = loadGame(content, file);
  assert.ok(S.buildings.length > 0 && S.buildings.every(b => b.idle === 0 && b.replaces === null));
  assert.ok(S.towns.every(t => t.planner.renewAt === 0));
  assert.equal(S.stats.pulledDown, 0);
  assert.equal(S.stats.movedOut, 0);
  runFor(S, 60);
  assert.equal(text(loadGame(content, text(S))), text(S));
});

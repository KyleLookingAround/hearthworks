import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, runFor, saveGame } from '../src/sim/index.ts';
import { jobBoard } from '../src/sim/logistics.ts';

const content = loadContent();
const NEW_GAME = { planner: true, seasons: true, trade: true, people: true, carts: true, settlers: true, hardship: true, plannedRoads: true, farms: true, map: 'islands', size: 'm', settlements: 2 } as const;

test('reusing the job board within a tick changes nothing but the time it takes', () => {
  for (const seed of [3, 1847]) {
    const run = (reuse: boolean) => {
      jobBoard.reuse = reuse;
      try {
        const S = createState(content, seed, NEW_GAME);
        runFor(S, 900);
        return JSON.stringify([saveGame(S), S.agents.map(a => [a.x, a.y, a.state])]);
      } finally { jobBoard.reuse = true; }
    };
    assert.equal(run(true), run(false), `seed ${seed}: the same world either way`);
  }
});

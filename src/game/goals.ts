import { countBuilt, hasBuilt, villagers, type State } from '../sim/index.ts';

export interface Goal { text: string; check: (S: State) => boolean }

/** Tutorial goals for the player-placed prototype. The planner will replace most of these. */
export const GOALS: Goal[] = [
  { text: 'Build a Forester beside a stand of trees', check: S => hasBuilt(S, 'forester') },
  { text: 'Build a Sawmill to turn logs into planks', check: S => hasBuilt(S, 'sawmill') },
  { text: 'Start bread: a Farm and a Bakery', check: S => hasBuilt(S, 'farm') && hasBuilt(S, 'bakery') },
  { text: 'Build a third House for newcomers', check: S => countBuilt(S, 'house') >= 3 },
  { text: 'Grow the town to 10 villagers', check: S => villagers(S).length >= 10 },
  { text: 'Build a Courier Depot and let machines haul', check: S => hasBuilt(S, 'depot') },
];

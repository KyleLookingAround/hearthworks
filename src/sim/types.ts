import type { Rng } from './rng.ts';

export type ItemId = string;
export type Stock = Record<ItemId, number>;

export interface GoodDef {
  id: ItemId;
  name: string;
  color: string;
  description: string;
  order: number;
}

/** A building the village knows how to make. Loaded from design/blueprints/*.md. */
export interface BlueprintDef {
  id: string;
  name: string;
  description: string;
  color: string;
  order: number;
  w: number;
  h: number;
  cost: Stock;
  workers: number;
  input: Stock;
  output: Stock;
  seconds: number;
  keepStocked: Stock;
  homes: number;
  harvest: { radius: number; replant: boolean } | null;
  couriers: { count: number; radius: number } | null;
  storage: boolean;
  paves: boolean;
}

/** Balance numbers. Loaded from the `tuning` block of design/systems/*.md. */
export interface Tuning {
  map: { width: number; height: number; treeGrowSeconds: number };
  start: { villagers: number; storage: Stock; houseStock: Stock };
  logistics: {
    villagerCarry: number; botCarry: number; villagerSpeed: number; botSpeed: number;
    roadSpeed: number; forestSpeed: number; outputCap: number; dumpAt: number;
  };
  needs: { eatEverySeconds: number; leaveAfterHungrySeconds: number; migrantEverySeconds: number; migrateMinMood: number };
  production: { buildSeconds: number; replantEverySeconds: number; maxTreesNearForester: number };
}

export interface Content {
  goods: Record<ItemId, GoodDef>;
  blueprints: Record<string, BlueprintDef>;
  tuning: Tuning;
  /** Short hash of the design files the content was built from. */
  hash: string;
}

export type Level = 'ok' | 'warn' | 'bad' | 'wait';

export interface Building {
  id: number;
  type: string;
  x: number; y: number; w: number; h: number;
  site: boolean;
  build: number;
  inv: Stock;
  incoming: Stock;
  reserved: Stock;
  worker: number | null;
  timer: number;
  plantT: number;
  paused: boolean;
  status: { t: string; l: Level };
  residents: number[];
  eat: number;
  hunger: number;
  bots: number[];
  dead: boolean;
}

export type AgentState = 'idle' | 'wander' | 'toSrc' | 'toDst' | 'toWork' | 'working';

export interface Task { src: Building; dst: Building; item: ItemId; n: number }

export interface Agent {
  id: number;
  kind: 'villager' | 'bot';
  x: number; y: number;
  path: [number, number][];
  state: AgentState;
  role: 'carrier' | 'worker' | 'bot';
  task: Task | null;
  carry: { item: ItemId; n: number } | null;
  home: Building | null;
  work: Building | null;
  depot: Building | null;
  cool: number;
  dead: boolean;
}

export interface World {
  w: number; h: number;
  /** 0 water, 1 sand, 2 grass */
  ground: Uint8Array;
  /** 0 none, 1 sapling, 2 grown */
  tree: Uint8Array;
  grow: Float32Array;
  road: Uint8Array;
  /** building id per tile, -1 when empty */
  bgrid: Int32Array;
}

export interface GameEvent { kind: 'good' | 'bad' | 'info'; text: string; t: number }

export interface Stats {
  made: Stock;
  deliveries: { villager: number; bot: number };
  arrivals: number;
  departures: number;
  peakVillagers: number;
}

export interface State {
  content: Content;
  seed: number;
  rng: Rng;
  t: number;
  world: World;
  buildings: Building[];
  agents: Agent[];
  bmap: Map<number, Building>;
  amap: Map<number, Agent>;
  nextId: number;
  mood: number;
  migT: number;
  secT: number;
  stats: Stats;
  events: GameEvent[];
}

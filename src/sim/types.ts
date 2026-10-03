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
  production: { buildSeconds: number; replantEverySeconds: number; maxTreesNearForester: number; sitePriorityTiles: number };
  planner: PlannerTuning;
}

export interface PlannerTuning {
  intervalSeconds: number; settleSeconds: number; confirmCycles: number; minSeverity: number;
  foodHeadroom: number; growthBeds: number; carrierShare: number; planksPerVillagerMinute: number; inputCover: number;
  costWeight: number; urgencyPriority: number;
  searchRadius: number; gap: number; minTrees: number;
  treeWeight: number; sharedTreeWeight: number; linkWeight: number; storeWeight: number; forestPenalty: number;
}

/** What the village planner is doing. Off unless the game or a scenario turns it on. */
export interface PlannerState {
  on: boolean;
  /** Seconds until the next look around. */
  t: number;
  /** Seconds to wait after a planned building finishes before planning again. */
  settle: number;
  /** The blueprint that topped the last looks, and for how many in a row. */
  streak: { type: string; n: number };
  /** The planner's own open site, if any. */
  site: number | null;
  /** One line for the player: what the planner is doing and why. */
  status: string;
  placed: number;
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
  /** Construction sites with a higher priority are supplied first. Hand-placed sites are 0. */
  priority: number;
  /** Why the village planned this building; empty when placed by hand. */
  reason: string;
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
  planner: PlannerState;
}

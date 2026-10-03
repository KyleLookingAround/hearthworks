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
  /** Not known at the start: a village invents it while it struggles with `need`. Null for founding knowledge. */
  discovery: { need: string; meanSeconds: number } | null;
}

export interface MapSize { width: number; height: number; settlements: number }

/** A kind of world the player can pick. Loaded from design/maps/*.md. */
export interface MapDef {
  id: string; name: string; description: string; order: number;
  shape: 'island' | 'landmass' | 'coast';
  /** Coast only: share of the width where the sea begins. */
  coastline: number;
  terrain: { largeCell: number; smallCell: number; large: number; small: number; base: number; falloff: number };
  shores: { grass: number; sand: number; seaBorder: boolean };
  start: { landRadius: number; clearRadius: number };
  forest: { cell: number; threshold: number; density: number; scatter: number; groveDensity: number };
}

/** The world a game was made with. */
export interface Setup { map: string; size: string; settlements: number }

/** Balance numbers. Loaded from the `tuning` block of design/systems/*.md. */
export interface Tuning {
  /** `width`/`height` are the standard size's; gates run on the standard map. */
  map: { width: number; height: number; treeGrowSeconds: number; standardType: string; standardSize: string; sizes: Record<string, MapSize> };
  start: { villagers: number; storage: Stock; houseStock: Stock; names: string[]; neighbourMinDistance: number; neighbourSpacing: number };
  logistics: {
    villagerCarry: number; botCarry: number; villagerSpeed: number; botSpeed: number;
    roadSpeed: number; forestSpeed: number; outputCap: number; dumpAt: number; requestAging: number;
  };
  needs: { eatEverySeconds: number; leaveAfterHungrySeconds: number; migrantEverySeconds: number; migrateMinMood: number };
  production: { buildSeconds: number; replantEverySeconds: number; maxTreesNearForester: number; sitePriorityTiles: number };
  planner: PlannerTuning;
  knowledge: {
    haulTarget: number; haulSmoothingSeconds: number; struggleSeverity: number;
    verifySeconds: number; forgetAfterSeconds: number; visitEverySeconds: number; visitMinVillagers: number;
  };
}

export interface PlannerTuning {
  intervalSeconds: number; settleSeconds: number; confirmCycles: number; minSeverity: number;
  foodHeadroom: number; growthBeds: number; growthWeight: number; carrierShare: number; planksPerVillagerMinute: number; inputCover: number;
  costWeight: number; urgencyPriority: number; savePatienceSeconds: number; haulWeight: number; coverWeight: number;
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
  /** The blueprint it is currently working towards (thinking about or saving for), if any. */
  want: string | null;
  /** The good it has been short of while saving up, and since when. */
  saving: { good: string; since: number } | null;
  /** One line for the player: what the planner is doing and why. */
  status: string;
  placed: number;
}

export interface Content {
  goods: Record<ItemId, GoodDef>;
  blueprints: Record<string, BlueprintDef>;
  maps: Record<string, MapDef>;
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
  /** The settlement it belongs to (index into State.towns). */
  town: number;
  /** Seconds it has spent running well; verifies its blueprint in use. */
  used: number;
  /** When each of its requests started waiting for a carrier (game time), for request aging. */
  waiting: Record<string, number>;
}

export type AgentState = 'idle' | 'wander' | 'toSrc' | 'toDst' | 'toWork' | 'working' | 'visit';

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
  /** A villager walking to a neighbouring settlement and back, carrying what their home has verified. */
  visit: Visit | null;
}

export interface Visit { from: number; to: number; back: boolean; carry: Record<string, Knowledge> }

/**
 * What one settlement knows about one blueprint. The fields mirror an OKF concept's
 * frontmatter: `by`/`at` are `generated`, `verified` lists the settlements that proved it
 * in use, and `used` is what `stale_after` counts from before it is forgotten.
 */
export interface Knowledge {
  /** 'founders', the inventing settlement's name, or 'hand' when the player built it first. */
  by: string;
  at: number;
  verified: { by: string; at: number }[];
  /** Settlement a visitor brought it from, or null if it was known, invented or built here. */
  from: string | null;
  learned: number;
  used: number;
}

/** A settlement: its storage yard, what it knows, its planner and its pressures. */
export interface Town {
  id: number;
  name: string;
  /** Building id of its first storage yard: the centre the planner builds around. */
  store: number;
  knows: Record<string, Knowledge>;
  planner: PlannerState;
  /** Smoothed share of its carriers busy hauling. */
  haul: number;
  /** Share of its villagers fed and settled, 0 to 1. */
  mood: number;
  visitT: number;
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
  /** 1 on a building's door tile: the only building tile that can be walked onto */
  door: Uint8Array;
  /** how many doors open onto this tile; placement keeps these tiles open */
  front: Uint8Array;
  /** Deterministic work counters: what the sim spent, for budgets that don't depend on the machine. */
  work: Work;
}

export interface Work { paths: number; pathFails: number; pathNodes: number; jobPairs: number; plannerSpots: number }

/** Something worth telling the player. `minor` marks routine news (a building finished, a newcomer) the UI can keep quiet. */
export interface GameEvent { kind: 'good' | 'bad' | 'info'; text: string; t: number; minor: boolean }

export interface Stats {
  made: Stock;
  deliveries: { villager: number; bot: number };
  arrivals: number;
  departures: number;
  peakVillagers: number;
  invented: number;
  taught: number;
  forgotten: number;
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
  towns: Town[];
  setup: Setup;
  /** The first settlement's planner (the player's village). Every settlement has its own in `towns`. */
  planner: PlannerState;
  /** Separate stream for discovery, so knowledge never shifts the main simulation's random numbers. */
  krng: Rng;
}

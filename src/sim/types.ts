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
/** How a settlement builds, by size: a roomy hamlet, a village of homes wall to wall, a town of streets and rows. */
export type Form = 'hamlet' | 'village' | 'town';

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
  /** Built on the shore: its door opens onto water, and boats are launched from it. */
  shore: boolean;
  /** The settlement form it takes before a planner builds it: homes climb a ladder as a hamlet becomes a village and a town. */
  form: Form;
  /** A bridge: spans up to `maxSpan` tiles of water in a straight line, land at both ends. */
  bridge: { maxSpan: number } | null;
  /** Bothers homes within `radius`: their surroundings lose `amount`. */
  nuisance: { radius: number; amount: number } | null;
  /** Not known at the start: a village invents it while it struggles with `need`. Null for founding knowledge. */
  discovery: { need: string; meanSeconds: number } | null;
}

/** A map size: `label` is what the player sees; sizes with `offered: false` exist for the gates only. */
export interface MapSize { width: number; height: number; settlements: number; label: string; offered: boolean }

/** A kind of world the player can pick. Loaded from design/maps/*.md. */
export interface MapDef {
  id: string; name: string; description: string; order: number;
  shape: 'island' | 'islands' | 'landmass' | 'coast';
  /** Land higher than `level` is rock: mountains. Null for none. */
  mountains: { level: number } | null;
  /** How common each deposit is: the share of suitable tiles, roughly. */
  deposits: { fertile: number; stone: number; clay: number; fish: number };
  /** The map sizes this type can be played at; null for every size. */
  sizes: string[] | null;
  /** Islands only: how many, and their radii as a share of half the map's shorter side. */
  islands: { countMin: number; countMax: number; radiusMin: number; radiusMax: number; minTiles: number; /** radii are a share of half the shorter side, up to this many tiles; bigger maps get more islands instead */ scaleTiles: number; countCap: number } | null;
  /** Small islands scattered in open sea (coast). */
  islets: number;
  /** Meandering rivers cut across the land, `width` tiles wide. */
  rivers: { count: number; width: number };
  /** Where neighbours may be founded: only somewhere reachable on foot, or anywhere (across water too). */
  neighbours: 'reachable' | 'anywhere';
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
  map: { width: number; height: number; treeGrowSeconds: number; standardType: string; standardSize: string; gameSize: string; sizes: Record<string, MapSize> };
  start: { villagers: number; storage: Stock; houseStock: Stock; names: string[]; neighbourMinDistance: number; neighbourSpacing: number; neighbourMinRoom: number; neighbourSpreadShare: number; startRoomShare: number; startWoodWeight: number };
  logistics: {
    villagerCarry: number; botCarry: number; villagerSpeed: number; botSpeed: number;
    roadSpeed: number; forestSpeed: number; boatSpeed: number; outputCap: number; dumpAt: number; requestAging: number; noWayRetrySeconds: number; slopeCost: number; rockCost: number;
  };
  needs: { eatEverySeconds: number; leaveAfterHungrySeconds: number; migrantEverySeconds: number; migrateMinMood: number; surroundingsWeight: number };
  surroundings: { base: number; treeRadius: number; treeAmenity: number; treeMax: number; waterRadius: number; waterAmenity: number; crowdRadius: number; crowdPenalty: number; sitePenalty: number };
  production: { buildSeconds: number; replantEverySeconds: number; maxTreesNearForester: number; sitePriorityTiles: number };
  planner: PlannerTuning;
  knowledge: {
    haulTarget: number; haulSmoothingSeconds: number; struggleSeverity: number;
    verifySeconds: number; forgetAfterSeconds: number; visitEverySeconds: number; visitMinVillagers: number;
  };
}

export interface PlannerTuning {
  intervalSeconds: number; replanMinAge: number; districtBuildings: number; districtSpacing: number; districtRoomWeight: number; replanEverySeconds: number; salvageShare: number; villageAt: number; townAt: number; rowWeight: number; streetWeight: number; streetEveryRows: number; streetEveryCols: number; streetRadius: number; detourRatio: number; detourWeight: number; bridgeReachWeight: number; bridgeMinGain: number; bridgeSpacing: number; paveWear: number; pavePerLook: number; wearHalfLifeSeconds: number; settleSeconds: number; confirmCycles: number; minSeverity: number;
  foodHeadroom: number; growthBeds: number; growthWeight: number; carrierShare: number; planksPerVillagerMinute: number; inputCover: number;
  costWeight: number; urgencyPriority: number; crossingWeight: number; savePatienceSeconds: number; noRoomRetrySeconds: number; haulWeight: number; coverWeight: number;
  searchRadius: number; searchRadiusMax: number; gap: number; minTrees: number;
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
  /** Does it pave the paths its people wear? */
  roads: boolean;
  /** When it last replanned a block. */
  replanAt: number;
  /** Blueprints it last found no room for, and when: it plans something else for `no_room_retry_seconds`. */
  noRoom: Record<string, number>;
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
  /** Game time a carrier last found no way to its door; it is left alone for `no_way_retry_seconds`. */
  noWay: number | null;
  /** Where its door is, when not the middle of its bottom row: a bridge's door is the near bank. */
  doorAt: { x: number; y: number } | null;
}

export type AgentState = 'idle' | 'wander' | 'toSrc' | 'toDst' | 'toWork' | 'working' | 'visit';

/** A delivery: `at` is the game time it was claimed, for delivery times. */
export interface Task { src: Building; dst: Building; item: ItemId; n: number; at: number; /** straight-line tiles: carrier to source to destination */ tiles: number }

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

export interface Visit { from: number; to: number; back: boolean; carry: Record<string, Knowledge>; /** rowed there, so has a boat to row home in */ boat: boolean }

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
  /** 1 while its nearest neighbour can't be reached without crossing water it has no way across. */
  cut: number;
  /** Share of its villagers fed, 0 to 1 (an empty shelf counts 0.6). */
  fed: number;
  /** Being fed, blended with the surroundings of its homes (`surroundings_weight`), 0 to 1. */
  mood: number;
  visitT: number;
  /** Smoothed pressure to bridge water: trips going the long way round, land nearby that cannot be walked to. */
  detour: number;
  /** Storage yards at the heart of each district, the first one first. */
  districts: number[];
  /** District centres that have had their street grid laid. */
  streets: number[];
  /** Recent trips that went the long way round: [from x, from y, to x, to y, tiles walked, when]. */
  detours: number[][];
}

export interface World {
  w: number; h: number;
  /** 0 water, 1 sand, 2 grass, 3 rock (mountains: walkable but slow, nothing is built on it) */
  ground: Uint8Array;
  /** height of the land, 0 (shore) to 255; climbing between tiles costs `slopeCost` per unit */
  height: Uint8Array;
  /** what lies in the ground, unused until goods need it: 0 none, 1 fertile soil, 2 stone, 3 clay, 4 fish */
  deposit: Uint8Array;
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
  /** 1 on a dock's door: where boats are launched */
  dock: Uint8Array;
  /** how many docks stand (or are being built); with none, nobody rows */
  docks: number;
  /** cost of a tile of water relative to a tile of open land on foot */
  waterCost: number;
  /** extra cost per unit of height climbed or descended between neighbouring tiles */
  slopeCost: number;
  /** cost of a tile of rock relative to open land */
  rockCost: number;
  /** cost of a road (or bridge) tile, and of a tile under grown trees, relative to open land: the inverse of their speeds */
  roadCost: number;
  forestCost: number;
  /** footsteps on each tile, fading over time: where people actually walk */
  wear: Float32Array;
  /** 1 on water spanned by a finished bridge: walked like a road, rowed under */
  bridge: Uint8Array;
  /** Deterministic work counters: what the sim spent, for budgets that don't depend on the machine. */
  work: Work;
}

export interface Work { paths: number; pathFails: number; pathNodes: number; jobPairs: number; plannerSpots: number }

/** Something worth telling the player. `minor` marks routine news (a building finished, a newcomer) the UI can keep quiet. */
export interface GameEvent { kind: 'good' | 'bad' | 'info'; text: string; t: number; minor: boolean }

export interface Stats {
  made: Stock;
  /** Delivery times: total seconds from claim to drop-off, and how many deliveries. */
  deliverySeconds: number;
  delivered: number;
  /** Straight-line tiles of those deliveries (carrier to source to destination), for their pace. */
  deliveryTiles: number;
  /** Blocks replanned, and people who left because their home came down. */
  replanned: number;
  demolitionDepartures: number;
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
  /** The world's share of villagers fed, without surroundings: what gates hold as `fed_min`. */
  fed: number;
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

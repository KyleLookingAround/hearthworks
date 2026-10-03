import type { Rng } from './rng.ts';

export type ItemId = string;
export type Stock = Record<ItemId, number>;

export interface GoodDef {
  id: ItemId;
  name: string;
  color: string;
  description: string;
  order: number;
  /** Share of a stock left out in a storage yard (not one that `keeps` it) lost each minute. */
  spoils: number;
}

/** A building the village knows how to make. Loaded from design/blueprints/*.md. */
/** How a settlement builds, by size: a roomy hamlet, a village of homes wall to wall, a town of streets and rows. */
export type Form = 'hamlet' | 'village' | 'town';

/** What the player has painted a tile for: the planner keeps buildings of that kind there, and builds nothing on no-build land. */
export type ZoneKind = 'homes' | 'farms' | 'workshops';
export const ZONES: (ZoneKind | 'nobuild')[] = ['homes', 'farms', 'workshops', 'nobuild'];

/** The player's levers on one settlement's planner. */
export interface Levers {
  /** Weight on each need's severity, by shortage key (a good, 'beds', 'hauling', 'crossing', 'detours'): 1 normal, more to put it first. */
  priority: Record<string, number>;
  /** A blueprint the settlement is encouraged to think of: likelier to be discovered. */
  encourage: string | null;
  /** How fast the planner looks and settles: 1 normal. */
  pace: number;
}

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
  /** For storage: how many goods it holds in all (0: no limit), and which goods it takes (null: any). */
  capacity: number;
  keeps: ItemId[] | null;
  /** Must stand within `radius` of a deposit of `kind` (fertile, stone, clay, fish, iron). */
  deposit: { kind: string; radius: number } | null;
  /** Works `speedup` times as fast while it holds tools, and wears one out every `wearCycles` cycles. */
  tools: { speedup: number; wearCycles: number } | null;
  paves: boolean;
  /** Built on the shore: its door opens onto water, and boats are launched from it. */
  shore: boolean;
  /** A crop: works from spring to autumn and rests in winter, when seasons are on. */
  seasonal: boolean;
  /** The custom for the dead it serves (burial, cremation, ship), if any. */
  rite: Custom | null;
  /** A place of learning: a library keeps knowledge, a school schools children, a university speeds invention. */
  learning: 'library' | 'school' | 'university' | null;
  /** How many of the dead it holds (a graveyard). */
  graves: number;
  /** The zone a planner keeps it in, when the player has painted one: homes (any home), farms or workshops. */
  zone: ZoneKind | null;
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
  deposits: { fertile: number; stone: number; clay: number; fish: number; iron: number };
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
    roadSpeed: number; forestSpeed: number; boatSpeed: number; outputCap: number; releaseAfterSeconds: number; dumpAt: number; requestAging: number; noWayRetrySeconds: number; slopeCost: number; rockCost: number;
  };
  needs: { eatEverySeconds: number; leaveAfterHungrySeconds: number; migrantEverySeconds: number; migrateMinMood: number; surroundingsWeight: number; tierTwo: ItemId[]; tierThree: ItemId[]; extrasEverySeconds: number; extrasStock: number; varietyBonus: number };
  people: {
    adultSeconds: number; elderSeconds: number; lifespanSeconds: number; lifespanJitterSeconds: number; founderAgeMaxSeconds: number; birthEverySeconds: number;
    practiceSeconds: number; apprenticeFactor: number; expertAt: number; skillSpeedup: number; riteGraceSeconds: number; ritePenalty: number;
    changeCustomAfterSeconds: number; pyreLogs: number; shipPlanks: number; customRadius: number; woodForPyre: number; waterForShip: number;
  };
  trade: { everySeconds: number; load: number; keep: number; minVillagers: number; smoothingSeconds: number; distanceWeight: number; minRate: number; maxRate: number; villagersPerPorter: number; exportDemand: number; wantCover: number; spareCover: number };
  seasons: { yearSeconds: number; firewoodEverySeconds: number; firewoodStock: number; coldPenalty: number; winterHeadroom: number; preserved: ItemId[] };
  surroundings: { base: number; treeRadius: number; treeAmenity: number; treeMax: number; waterRadius: number; waterAmenity: number; crowdRadius: number; crowdPenalty: number; sitePenalty: number };
  production: { buildSeconds: number; replantEverySeconds: number; maxTreesNearForester: number; sitePriorityTiles: number };
  planner: PlannerTuning;
  knowledge: {
    haulTarget: number; haulSmoothingSeconds: number; struggleSeverity: number; encourageFactor: number; encourageThreshold: number;
    verifySeconds: number; forgetAfterSeconds: number; visitEverySeconds: number; visitMinVillagers: number;
    copyEverySeconds: number; universityFactor: number; schoolFactor: number; forgettingMemorySeconds: number; learningWeight: number; schoolChildren: number;
  };
}

export interface PlannerTuning {
  intervalSeconds: number; sitePatienceSeconds: number; buildGoods: ItemId[]; comfortWeight: number; depositWeight: number; replanMinAge: number; districtBuildings: number; districtSpacing: number; districtRoomWeight: number; replanEverySeconds: number; salvageShare: number; villageAt: number; townAt: number; rowWeight: number; streetWeight: number; streetEveryRows: number; streetEveryCols: number; streetRadius: number; detourRatio: number; detourWeight: number; bridgeReachWeight: number; bridgeMinGain: number; bridgeSpacing: number; paveWear: number; pavePerLook: number; wearHalfLifeSeconds: number; settleSeconds: number; confirmCycles: number; minSeverity: number;
  foodHeadroom: number; growthBeds: number; storeFullShare: number; growthWeight: number; carrierShare: number; planksPerVillagerMinute: number; inputCover: number;
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
  /** When it first planned a building for each need, by shortage key. */
  firstFor: Record<string, number>;
  /** Blueprints it last found no room for, and when: it plans something else for `no_room_retry_seconds`. */
  noRoom: Record<string, number>;
  /** Goods it was short of at its last look, by how badly (0 to 1): what a porter goes out to trade for. */
  wants: Record<string, number>;
  /** What it uses of each good a second, at its last look: how long its stock lasts, for trade. */
  use: Stock;
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
  /** A home's clock for using its comforts (fish, cloth, tools), in seconds. */
  extra: number;
  /** Cycles worked since its tools last wore out. */
  wear: number;
  /** A home's firewood clock in winter, in logs owed. */
  fire: number;
  /** Seconds a workplace has stood with its output full; past `release_after_seconds` its worker goes carrying. */
  stall: number;
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
  /** Children neither work nor carry. */
  role: 'carrier' | 'worker' | 'bot' | 'child';
  task: Task | null;
  carry: { item: ItemId; n: number } | null;
  home: Building | null;
  work: Building | null;
  depot: Building | null;
  cool: number;
  dead: boolean;
  /** A villager walking to a neighbouring settlement and back, carrying what their home has verified. */
  visit: Visit | null;
  /** With people on: when they were born and at what age they die (game seconds), and their skill per workplace kind (0 to 1). */
  born: number;
  dies: number;
  skill: Record<string, number>;
  /** Went to school as a child: learns trades faster. */
  schooled: boolean;
}

export type Custom = 'burial' | 'cremation' | 'ship';

export interface Visit { from: number; to: number; back: boolean; carry: Record<string, Knowledge>; /** rowed there, so has a boat to row home in */ boat: boolean; /** a porter's errand: the good taken and the good wanted back */ trade?: { give: ItemId; want: ItemId } }

/** A settlement's trade: when it last sent a porter, smoothed imports per second, and running totals. */
export interface Ledger { t: number; imports: Stock; made: Stock; exported: Stock; imported: Stock }

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
  /** The player's levers on its planner. */
  levers: Levers;
  /** The form it was last seen in, for the chronicle. */
  form: Form;
  /** Storage yards at the heart of each district, the first one first. */
  districts: number[];
  /** District centres that have had their street grid laid. */
  streets: number[];
  /** Recent trips that went the long way round: [from x, from y, to x, to y, tiles walked, when]. */
  detours: number[][];
  /** What it made, traded away and traded for. */
  trade: Ledger;
  /** How it honours its dead, the deaths still waiting for their farewell (when each died), and how many lie in each graveyard. */
  custom: Custom;
  rites: number[];
  graves: Record<number, number>;
  /** Seconds since its library's scribe last copied records for the neighbours. */
  copyT: number;
}

export interface World {
  w: number; h: number;
  /** 0 water, 1 sand, 2 grass, 3 rock (mountains: walkable but slow, nothing is built on it) */
  ground: Uint8Array;
  /** height of the land, 0 (shore) to 255; climbing between tiles costs `slopeCost` per unit */
  height: Uint8Array;
  /** what lies in the ground: 0 none, 1 fertile soil, 2 stone, 3 clay, 4 fish, 5 iron */
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
  /** the player's zones: 0 none, then 1 + index in ZONES (homes, farms, workshops, no-build) */
  zone: Uint8Array;
  /** 1 on water spanned by a finished bridge: walked like a road, rowed under */
  bridge: Uint8Array;
  /** Deterministic work counters: what the sim spent, for budgets that don't depend on the machine. */
  work: Work;
}

export interface Work { paths: number; pathFails: number; pathNodes: number; jobPairs: number; plannerSpots: number }

/** Something worth telling the player. `minor` marks routine news (a building finished, a newcomer) the UI can keep quiet. */
export interface GameEvent { kind: 'good' | 'bad' | 'info'; text: string; t: number; minor: boolean }

/** One line of history. `kind` sorts it: founded, form, invented, taught, proven, forgotten, replanned, district, bridge. */
export interface Chronicle { t: number; town: number; kind: string; text: string }

export interface Stats {
  made: Stock;
  /** Porters' loads delivered between settlements. */
  trades: number;
  /** Delivery times: total seconds from claim to drop-off, and how many deliveries. */
  deliverySeconds: number;
  delivered: number;
  /** Straight-line tiles of those deliveries (carrier to source to destination), for their pace. */
  deliveryTiles: number;
  /** Goods lost to spoiling in storage. */
  spoiled: number;
  /** Blocks replanned, and people who left because their home came down. */
  replanned: number;
  demolitionDepartures: number;
  deliveries: { villager: number; bot: number };
  arrivals: number;
  departures: number;
  births: number;
  deaths: number;
  honoured: number;
  /** Longest wait of a death for its farewell, in seconds. */
  riteWaitMax: number;
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
  /** Seasons on: the year turns and winter comes. Off for scenarios that predate them. */
  seasons: boolean;
  /** Trade on: neighbours send porters to swap what they can spare for what they want. */
  trade: boolean;
  /** People on: villagers age, are born and die, learn trades, and honour their dead. */
  people: boolean;
  /** Newcomers arrive (off to grow by births alone). */
  newcomers: boolean;
  /** Separate stream for births, lifespans and the like, so people never shift the rest of the world. */
  prng: Rng;
  /** Each settlement's history as it happens: what the chronicle and its OKF export show. */
  chronicle: Chronicle[];
  /** Separate stream for discovery, so knowledge never shifts the main simulation's random numbers. */
  krng: Rng;
}

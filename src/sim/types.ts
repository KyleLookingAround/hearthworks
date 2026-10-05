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
  /** Paves a planned road rather than a path; planners lay it in long straight strips at `cost` a tile. */
  road: boolean;
  /** Paves a road in stone (with `road`): planners repave their busiest roads with it from stone they can spare. */
  stone: boolean;
  /** Lays a conveyor belt rather than paving (with `paves`): goods ride it between the buildings whose doors open beside it. */
  belt: boolean;
  /** Built on the shore: its door opens onto water, and boats are launched from it. */
  shore: boolean;
  /** A crop: works from spring to autumn and rests in winter, when seasons are on. */
  seasonal: boolean;
  /** The custom for the dead it serves (burial, cremation, ship), if any. */
  rite: Custom | null;
  /** A place of learning: a library keeps knowledge, a school schools children, a university mills invention. */
  learning: 'library' | 'school' | 'university' | null;
  /** A town hall: its planner at work lets the settlement keep more of its own sites open at once. */
  hall: boolean;
  /** Handcarts it keeps for long hauls (a cart shed). */
  carts: number;
  /** Ox carts it keeps for the longest hauls (an ox barn); each trip eats `ox_feed` of what it keeps stocked. */
  oxen: number;
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
  /** Answers a hardship (fire, flood, sickness, raids) for buildings within `radius`; `defence` against raiders (watchtowers and palisades). */
  guards: { hazard: Hazard; radius: number; defence: number } | null;
  /** Keeps homes within `radius` clean while its worker is in: they fall sick, and catch sickness, `clean_factor` as often. */
  sanitation: { radius: number } | null;
  /** Mills for the workplaces of these kinds within `radius` while its worker is at work: each batch they make yields `factor` times as much (a windmill and its bakeries). */
  mills: { types: string[]; radius: number; factor: number } | null;
  /** Not known at the start: a village invents it while it struggles with `need`. Null for founding knowledge. */
  discovery: { need: string; meanSeconds: number; /** blueprints the settlement must know first */ after: string[]; /** thought of only with a university at work */ university: boolean } | null;
  /** Grows in steps, one per name (farms that grow): each step adds a row of fields behind it and a place for a hand. */
  grows: { names: string[] } | null;
  /** New fields: a strip laid behind a farm that grows, which becomes part of it when finished. */
  field: boolean;
  /** Exists only with this option of the world on (farms that grow). */
  option: 'farms' | null;
  /** Seconds after it is built before it yields anything (an orchard's young trees). */
  ripens: number;
}

/** The hardships a settlement can be struck by. */
export type Hazard = 'fire' | 'flood' | 'sickness' | 'raids';
export const HAZARDS: Hazard[] = ['fire', 'flood', 'sickness', 'raids'];

/** The steward's laws for one settlement: rationing, working hours, and whether the hungry may leave. */
export interface Laws { rationing: boolean; hours: 'short' | 'normal' | 'long'; leave: boolean }

/** A barbarian camp in the wilds, and the raiding party it has out, if any. */
export interface Camp {
  id: number; x: number; y: number;
  /** How many raiders it can send. */
  strength: number;
  /** Seconds until it next raids. */
  raidT: number;
  raid: { town: number; path: [number, number][]; x: number; y: number; n: number; back: boolean; loot: number } | null;
  /** With trade on: the settlement that sends it gifts of bread, how far its goodwill has grown (1: they come in and settle), and seconds to the next gift. */
  friend: number | null;
  goodwill: number;
  giftT: number;
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
  /** Sea maps: shallows along every shore and reefs out at sea, on about `reefs` of the water where they may lie. Null for none. */
  sea: { reefs: number } | null;
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
    pathSpeed: number; roadSpeed: number; forestSpeed: number; boatSpeed: number; outputCap: number; releaseAfterSeconds: number; cartCarry: number; cartPathSpeed: number; cartRoadSpeed: number; cartRoughSpeed: number; cartMinTiles: number; roundTiles: number; cartReach: number; dumpAt: number; requestAging: number; noWayRetrySeconds: number; slopeCost: number; rockCost: number; stoneRoadSpeed: number; oxCarry: number; oxPathSpeed: number; oxRoadSpeed: number; oxRoughSpeed: number; oxMinTiles: number; oxFeed: number;
  };
  needs: { eatEverySeconds: number; leaveAfterHungrySeconds: number; migrantEverySeconds: number; migrateMinMood: number; surroundingsWeight: number; tierTwo: ItemId[]; tierThree: ItemId[]; extrasEverySeconds: number; extrasStock: number; varietyBonus: number };
  settling: { checkEverySeconds: number; minVillagers: number; cooldownSeconds: number; partySize: number; crowdedMinVillagers: number; storesShare: number; maxSettlements: number };
  sea: { shallowTiles: number; shallowSpeed: number; reefFromTiles: number; reefToTiles: number; reefCell: number; sightTiles: number; lookEverySeconds: number; exploreEverySeconds: number };
  people: {
    adultSeconds: number; elderSeconds: number; lifespanSeconds: number; lifespanJitterSeconds: number; founderAgeMaxSeconds: number; birthEverySeconds: number;
    practiceSeconds: number; apprenticeFactor: number; expertAt: number; skillSpeedup: number; riteGraceSeconds: number; ritePenalty: number;
    changeCustomAfterSeconds: number; pyreLogs: number; shipPlanks: number; customRadius: number; woodForPyre: number; waterForShip: number; feastSeconds: number; feastMood: number; harvestBread: number; fireLogs: number; woodForFire: number; feastSpread: number; names: Record<Naming, string[]>;
  };
  trade: { everySeconds: number; load: number; keep: number; minVillagers: number; smoothingSeconds: number; distanceWeight: number; minRate: number; maxRate: number; villagersPerPorter: number; exportDemand: number; wantCover: number; spareCover: number; kinBonus: number; importPatienceSeconds: number; importShare: number };
  conveyors: { speed: number; carry: number; gapSeconds: number; reach: number; roughCost: number; lookEverySeconds: number; villagersPerBelt: number; minTiles: number; maxTiles: number; minStops: number };
  farms: { diet: ItemId[]; dietShare: number; dietStock: number; dietSeconds: number; dietFull: number; dietBonus: number; dietWeight: number; growRoomWeight: number };
  seasons: { yearSeconds: number; firewoodEverySeconds: number; firewoodStock: number; coldPenalty: number; winterHeadroom: number; preserved: ItemId[] };
  surroundings: { base: number; treeRadius: number; treeAmenity: number; treeMax: number; waterRadius: number; waterAmenity: number; crowdRadius: number; crowdPenalty: number; sitePenalty: number };
  production: { buildSeconds: number; replantEverySeconds: number; maxTreesNearForester: number; sitePriorityTiles: number; surplusSeconds: number; surplusMin: number; surplusFullSeconds: number; freshSeconds: number };
  planner: PlannerTuning;
  hardship: {
    fireEverySeconds: number; spreadGap: number; spreadChance: number; burnSeconds: number; douseSeconds: number; rebuildShare: number; fireLoss: number; fireproof: ItemId[];
    floodChance: number; floodReach: number; floodHeight: number; floodSeconds: number; floodLoss: number;
    sicknessEverySeconds: number; sickAt: number; sickSeconds: number; sickSpreadGap: number; sickSpreadChance: number; sickDeath: number; healedSeconds: number; healedDeath: number; sickMood: number;
    wildDistance: number; wildTilesPerCamp: number; campEverySeconds: number; campStrength: number; campGrowSeconds: number; campMax: number; raidEverySeconds: number; raidReach: number; raidSpeed: number; raidTake: number; raidLoss: number; giftEverySeconds: number; giftBread: number; giftsToSettle: number;
    militiaShare: number; surprisedShare: number;
    memorySeconds: number; guardWeight: number; cleanFactor: number;
    rationFactor: number; rationMood: number; longPace: number; longMood: number; shortPace: number; shortMood: number; stayMood: number; starveFactor: number;
  };
  roads: { trafficFrom: number; trafficSpan: number; villagersPerRoad: number; lookEverySeconds: number; minTraffic: number; margin: number; minLength: number; demolishWeight: number; homeWeight: number; spacing: number; frontWeight: number; nearWeight: number; nearTiles: number; districtWeight: number; districtReach: number };
  knowledge: {
    haulTarget: number; haulSmoothingSeconds: number; struggleSeverity: number; encourageFactor: number; encourageThreshold: number;
    verifySeconds: number; forgetAfterSeconds: number; visitEverySeconds: number; visitMinVillagers: number;
    copyEverySeconds: number; universityFactor: number; universityThreshold: number; schoolFactor: number; forgettingMemorySeconds: number; learningWeight: number; schoolChildren: number; distanceFrom: number; distanceSpan: number; longHaulFrom: number; reachSmoothing: number;
  };
}

export interface PlannerTuning {
  intervalSeconds: number; sitePatienceSeconds: number; buildGoods: ItemId[]; comfortWeight: number; depositWeight: number; replanMinAge: number; districtBuildings: number; districtSpacing: number; districtRoomWeight: number; replanEverySeconds: number; salvageShare: number; clearReach: number; clearTries: number; villageAt: number; townAt: number; rowWeight: number; streetWeight: number; streetEveryRows: number; streetEveryCols: number; streetRadius: number; detourRatio: number; detourWeight: number; bridgeReachWeight: number; bridgeMinGain: number; bridgeSpacing: number; paveWear: number; pavePerLook: number; wearHalfLifeSeconds: number; settleSeconds: number; confirmCycles: number; minSeverity: number; hallWeight: number; hallSites: number; hallMasterSites: number; millWeight: number; millMin: number;
  foodHeadroom: number; newcomerFoodShare: number; growthBeds: number; storeFullShare: number; villagersPerCartShed: number; villagersPerOxBarn: number; growthWeight: number; carrierShare: number; planksPerVillagerMinute: number; inputCover: number;
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

/** An era: a group of discoveries; a settlement knowing `share` of them (and every earlier era) is in its age. */
export interface EraDef { id: string; name: string; order: number; discoveries: string[]; share: number; /** blueprints of its own: thought of only by a settlement of this age or later */ unlocks: string[] }

export interface Content {
  goods: Record<ItemId, GoodDef>;
  blueprints: Record<string, BlueprintDef>;
  maps: Record<string, MapDef>;
  /** The ages, in order (design/eras/). */
  eras: EraDef[];
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
  /** Its first hand; `hands` are the rest, when it has places for more (a grown farm). */
  worker: number | null;
  hands: number[];
  timer: number;
  /** A forester's replanting clock; an orchard's ripening clock. */
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
  extra: number; /* a home: comforts owed; a workplace by a mill: the part of a good its batches have yielded beyond the whole */
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
  /** Where its door is, when not the middle of the side it faces: a bridge's door is the near bank. */
  doorAt: { x: number; y: number } | null;
  /** Which way it faces, its door in the middle of that side: 0 south (the bottom row), 1 west, 2 north, 3 east. Turned a quarter, its footprint turns with it. */
  rot: number;
  /** Hardship: seconds left burning, flooded, and (a home) sick; 0 when none. */
  burn: number;
  flood: number;
  sick: number;
  /** Farms that grow: how many steps it has grown, and (a new fields site) the farm it grows. */
  size: number;
  of: number | null;
  /** Everything it has made, counted one by one. */
  made: number;
  /** A home: when it last ate each food (game time). */
  ate: Stock;
}

export type AgentState = 'idle' | 'wander' | 'toSrc' | 'toDst' | 'toWork' | 'working' | 'visit';

/** A delivery: `at` is the game time it was claimed, for delivery times. */
export interface Task { src: Building; dst: Building; item: ItemId; n: number; at: number; /** straight-line tiles: carrier to source to destination */ tiles: number; /** tiles stepped on the way, and of those on a road and on a path */ steps: number; road: number; path: number; /** a cart's round: more drops of the same good after `dst`, in turn */ round: { dst: Building; n: number }[] }

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
  /** Went to school as a child: learns trades faster, and reads. */
  schooled: boolean;
  /** With people on: their given name, by their settlement's naming custom ('' for a bot). */
  name: string;
  /** The cart shed whose cart they have out, if any. */
  cart: number | null;
}

export type Custom = 'burial' | 'cremation' | 'ship';
/** Where a settlement takes its children's names from: the sea, the trees, or the fields. */
export type Naming = 'sea' | 'trees' | 'fields';
/** The feasts a settlement may keep: a harvest festival as autumn comes, a fire as winter comes. */
export type Feast = 'harvest' | 'midwinter';

export interface Visit { from: number; to: number; back: boolean; carry: Record<string, Knowledge>; /** rowed there, so has a boat to row home in */ boat: boolean; /** a porter's errand: the good taken and the good wanted back */ trade?: { give: ItemId; want: ItemId }; /** with charts on: the islands seen from the boat on the way, to chart at the end of the leg */ seen?: number[]; /** an explorer's voyage: the shore tile they row for */ explore?: [number, number] }

/** A settlement's trade: when it last sent a porter, smoothed imports per second, and running totals. */
export interface Ledger { t: number; imports: Stock; made: Stock; exported: Stock; imported: Stock; /** when it first chose to trade for a good rather than make it */ waits: Stock }

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
  /** The feasts it keeps through the year (with people and seasons on), and until when the last one lifts its mood. */
  feasts: Feast[];
  /** Its naming custom, from its land (with people on). */
  naming: Naming;
  feastUntil: number;
  graves: Record<number, number>;
  /** Seconds since its library's scribe last copied records for the neighbours. */
  copyT: number;
  /** Smoothed tiles its deliveries go (walk to the goods plus the haul): the strain of distance. */
  reach: number;
  /** The settlement that sent its founding party, if any, and when it last sent one of its own. */
  mother: number | null;
  /** Founded across water from its mother: a colony. */
  overseas: boolean;
  /** Its age: the index of the latest era it has reached in content.eras. */
  age: number;
  /** The steward's laws, and when each hardship last struck it (game time). */
  laws: Laws;
  struck: Record<string, number>;
  /** Seconds since its planner last looked for a road to lay, and the roads it laid: [x0, y0, x1, y1, when]. */
  roadT: number;
  roads: number[][];
  /** Seconds since its planner last looked for a conveyor to lay, and the belts it laid: [x0, y0, x1, y1, when]. */
  beltT: number;
  belts: number[][];
  sentAt: number;
  settleT: number;
  /** With charts on: the islands it has charted (ids from `islesOf`), seconds since it last looked out from its shores, whether it wants an explorer out, and when it last sent one. */
  charted: number[];
  lookT: number;
  explore: boolean;
  voyageAt: number;
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
  /** 0 none, 1 a path (worn by feet and paved, laid by hand, or a town's streets), 2 a planned road */
  road: Uint8Array;
  /** building id per tile, -1 when empty */
  bgrid: Int32Array;
  /** 1 on a building's door tile: the only building tile that can be walked onto */
  door: Uint8Array;
  /** how many doors open onto this tile; placement keeps these tiles open */
  front: Uint8Array;
  /** the sea on sea maps: 0 open water (or land), 1 shallows (rowed slowly), 2 a reef (never rowed over) */
  sea: Uint8Array;
  /** cost of a tile of shallows relative to open water */
  shallowCost: number;
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
  /** cost of a path (or bridge) tile, of a road tile, and of a tile under grown trees, relative to open land: the inverse of their mills */
  pathCost: number;
  roadCost: number;
  /** Route cost of a road of stone, and how many tiles are paved in stone (`roads` counts every road tile, stone or not). */
  stoneCost: number;
  stone: number;
  /** how many road tiles are laid */
  roads: number;
  forestCost: number;
  /** 1 where a conveyor belt runs (over open ground, a path or a road: people step across it) */
  belt: Uint8Array;
  /** how many belt tiles are laid */
  belts: number;
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

/** One line of history. `kind` sorts it: founded, form, invented, taught, proven, forgotten, replanned, district, bridge, farm. */
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
  /** Feasts held, and feasts missed for want of what they need. */
  feasts: number;
  feastsMissed: number;
  /** Deliveries made with a cart; deliveries of at least `cart_min_tiles`, and of those how many by cart. */
  cartDeliveries: number;
  /** Goods delivered, counted one by one (a cart's six count six). */
  goodsDelivered: number;
  /** Goods delivered over at least `cart_min_tiles`, and of those how many by cart. */
  longGoods: number;
  longGoodsByCart: number;
  /** Seconds from claim to drop-off of those long deliveries, on foot and by cart. */
  longFootSeconds: number;
  longCartSeconds: number;
  longDeliveries: number;
  longByCart: number;
  /** Ox carts: trips set out (each eating its feed), and of the long goods by cart those by ox cart and their seconds. */
  oxTrips: number;
  longGoodsByOx: number;
  longOxSeconds: number;
  peakVillagers: number;
  /** Meals eaten, by food, and fields laid (farms grown a size). */
  eaten: Stock;
  grown: number;
  invented: number;
  taught: number;
  forgotten: number;
  /** Hardship: each kind struck, buildings burnt out, raids beaten off, goods raiders took, and people lost to sickness and hunger with leaving forbidden. */
  /** Roads: strips laid and their tiles, buildings they cut through and people moved for them; deliveries mostly along roads and mostly along paths (time and straight-line tiles). */
  roadsLaid: number; roadTiles: number; roadCut: number; roadMoved: number;
  roadDeliveries: number; roadDeliverySeconds: number; roadDeliveryTiles: number; pathDeliveries: number; pathDeliverySeconds: number; pathDeliveryTiles: number;
  /** Conveyors: belts laid and their tiles; loads that rode them, the goods in them and their seconds on the belt. */
  beltsLaid: number; beltTiles: number; beltLoads: number; beltGoods: number; beltSeconds: number;
  fires: number; burnt: number; floods: number; outbreaks: number; raids: number; repelled: number; looted: number; sickDeaths: number; starved: number; camps: number; gifts: number; campsSettled: number; barbariansSettled: number;
  /** With charts on: explorers' voyages, and islands charted by settlements (each settlement counts its own). */
  voyages: number; charted: number;
}

/**
 * A load riding a conveyor belt from one building to another: it left `src` (by the belt tile `from`) at `at`
 * and comes off at `dst` (by the tile `to`) `secs` later. Buildings are kept as ids: a load outlives neither end.
 */
export interface Parcel { item: ItemId; n: number; src: number; dst: number; from: number; to: number; at: number; secs: number }

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
  /** Carts on: cart sheds can be thought of, and lend handcarts for long hauls. */
  carts: boolean;
  /** Settling on: crowded settlements send founding parties to found daughter towns. */
  settlers: boolean;
  /** Charts on: a settlement knows only the islands it has seen, and settles only on charted land; explorers chart the rest. */
  charts: boolean;
  /** Newcomers arrive (off to grow by births alone). */
  newcomers: boolean;
  /** Separate stream for births, lifespans and the like, so people never shift the rest of the world. */
  prng: Rng;
  /** Planned roads on: settlements think of roads and lay them as long straight strips. */
  plannedRoads: boolean;
  /** Hardship on: fire, flood, sickness and barbarians strike, and the laws can be set. */
  hardship: boolean;
  /** Separate stream for hardship, so hazards never shift the rest of the world. */
  hrng: Rng;
  /** Barbarian camps in the wilds. */
  camps: Camp[];
  /** Seconds since the wilds were last looked over for a new camp. */
  campT: number;
  /** Each settlement's history as it happens: what the chronicle and its OKF export show. */
  chronicle: Chronicle[];
  /** Separate stream for discovery, so knowledge never shifts the main simulation's random numbers. */
  krng: Rng;
  /** Loads riding the conveyor belts. */
  parcels: Parcel[];
  /** Farms that grow on: farms grow fields and hands, and homes eat a varied diet of the foods they grow. */
  farms: boolean;
}

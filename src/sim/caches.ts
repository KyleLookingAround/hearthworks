/**
 * Every cache of one game, in one place: what is worked out from the state and kept to save working it out again.
 * None of it is saved, and none of it changes what happens: a cache holds what asking afresh would give, for as long
 * as what it was worked out from stays the same. Each entry below says what it depends on and what forgets it.
 *
 * The caches belong to the game's world (`S.world`, which a game never shares or replaces), as the path search and the
 * terrain are handed only the world. Caches of a tick are filled by whichever system asks first in that tick: that
 * order is part of the game (see `SYSTEMS` in tick.ts).
 *
 * The ways a cache is forgotten:
 * - **fixed**: never. The content, the world's options and its ground (land and sea never change once a world is made).
 * - **the ground** (`reshaped`): a tile anyone may walk, row or land on changed (a footprint, a door, a dock, a bridge).
 * - **the belts** (`beltsChanged`): a tile of belt was laid or taken up.
 * - **a building turned** (`turned`): its door may now open beside a belt, or no longer.
 * - **the buildings**: one was placed or came down, told by the list of buildings, its length and `S.nextId`.
 * - **a new tick**: the clock moved on (`S.t`), so everything worked out once a tick is asked again (`thisTick`).
 * - **the job board**: opened and closed around the agents' turns in each step (logistics.ts).
 * - **a save** (`saved`): what a saved game cannot carry is forgotten in the game that goes on too, so that a game
 *   loaded from the save does the same work as the one that was saved.
 *
 * One memo stays with the value it is about instead: logistics.ts `asked`, each gathering of the requests sorted by
 * settlement, which lives exactly as long as that list of requests.
 */
import type { BlueprintDef, Building, ItemId, State, Stock, World } from './types.ts';
import type { Buffers, CutOff } from './path.ts';
import type { Net } from './belts.ts';
import type { Board, Seen, Shape } from './logistics.ts';
import type { Isles } from './sea.ts';

/** A settlement's stores and people, as production.ts counts them. */
export interface Stocks { goods: Stock; pop: number; beds: number; held: number; room: number }
/** Every standing building beside a belt, with the tile it uses and that tile's line, and the buildings of each line. */
export interface Besides { net: Net; key: string; by: Map<Building, { tile: number; line: number }>; lines: Map<number, [Building, { tile: number; line: number }][]> }

/** What is worked out once a tick: all of it is asked again when the clock moves on. */
export interface Tick {
  t: number;
  /** production.ts `wants`: what each building wants kept in stock (also asked again if its settlement's form, custom or rites change) */
  wanted: Map<Building, { form: string; custom: string | undefined; rites: boolean; out: Stock }>;
  /** production.ts `stocks`: each settlement's stores and people */
  stocks: Map<number, Stocks>;
  /** farms.ts `dietOf`: the foods of the diet each settlement's homes can get */
  diets: Map<number, Set<ItemId>>;
  /** logistics.ts `harvestBehind`: whether each settlement's winter store has fallen behind */
  behind: Map<number, boolean>;
  /** logistics.ts `hasSheds`: the settlements with a cart shed standing */
  sheds: Set<number> | null;
  /** logistics.ts `hubOf`: each home's and workplace's hub */
  hubs: Map<Building, Building | null>;
  /** logistics.ts `offerersOf`: each settlement's buildings that can offer goods (also gathered again as buildings come or go) */
  offerers: { all: Building[]; n: number; by: Map<number | null, Building[]> } | null;
}

/** The job board of a step (logistics.ts): open while the agents take their turns. */
export interface JobBoard {
  /** is the board open (requests gathered once and kept until something changes them)? */
  open: boolean;
  board: Board | null;
  /** each settlement's look over the board, while none of its buildings has been touched */
  looks: Map<number | null, { board: Board; at: number; seen: Seen }>;
  /** a count of touches, for telling which looks are stale */
  stamps: number;
}

export interface Caches {
  // ---- fixed ----
  /** logistics.ts: what each blueprint's requests and offers turn on */
  shapes: Map<BlueprintDef, Shape>;
  /** logistics.ts: the foods homes keep */
  homeFoods: Set<ItemId> | null;
  /** production.ts `foodChainOf`: what homes eat and everything that goes into making it */
  foodChain: Set<string> | null;
  /** production.ts: the kinds of workplace something mills */
  milled: Set<string> | null;
  /** surroundings.ts: the furthest any blueprint's nuisance reaches */
  nuisanceReach: number | null;
  /** trade.ts: the goods homes eat */
  tradeFoods: Set<ItemId> | null;
  /** planner/core.ts `basics`, by whether seasons are on */
  basics: { seasons: boolean; set: Set<ItemId> }[];
  /** sea.ts `islesOf`: the islands (by the ground and the shallows) */
  isles: Isles | null;
  /** sea.ts `horizon`: the islands in sight from each island's shores */
  horizons: Map<number, number[]>;
  /** path.ts: the search's working memory (it means nothing between searches) */
  buffers: Buffers | null;
  // ---- the ground ----
  /** path.ts: searches that found no way, kept as everything they could reach (also forgotten on a save) */
  cutOff: CutOff[] | null;
  // ---- the belts ----
  /** belts.ts: each belt tile's line, and the walks along it */
  net: Net | null;
  // ---- the belts, the buildings, or a building turned ----
  /** belts.ts: the buildings beside each belt (also worked out again when `net` or the buildings change) */
  besides: Besides | null;
  // ---- the buildings ----
  /** logistics.ts `yardsOf`: each settlement's storage yards, sites too */
  yards: { all: Building[]; key: string; by: Map<number, Building[]> } | null;
  // ---- kept up as things change (each rebuilt from the world when missing) ----
  /** terrain.ts: the saplings still growing */
  saplings: Set<number> | null;
  /** terrain.ts: the tiles feet have worn that have not faded back */
  worn: Set<number> | null;
  /** knowledge.ts: the settlements whose university has had scholars at work (read once from the chronicle) */
  opened: Set<number> | null;
  // ---- a new tick ----
  tick: Tick;
  // ---- the job board ----
  jobs: JobBoard;
}

const newTick = (t: number): Tick => ({ t, wanted: new Map(), stocks: new Map(), diets: new Map(), behind: new Map(), sheds: null, hubs: new Map(), offerers: null });

const owners = new WeakMap<World, Caches>();

/** The caches of the game whose world this is. */
export function caches(w: World): Caches {
  let c = owners.get(w);
  if (!c) {
    c = {
      shapes: new Map(), homeFoods: null, foodChain: null, milled: null, nuisanceReach: null, tradeFoods: null, basics: [], isles: null, horizons: new Map(), buffers: null,
      cutOff: null, net: null, besides: null, yards: null, saplings: null, worn: null, opened: null,
      tick: newTick(NaN), jobs: { open: false, board: null, looks: new Map(), stamps: 0 },
    };
    owners.set(w, c);
  }
  return c;
}

/** What is worked out once a tick: a fresh set as soon as anything asks in a new tick. */
export function thisTick(S: State): Tick {
  const c = caches(S.world);
  if (c.tick.t !== S.t) c.tick = newTick(S.t);
  return c.tick;
}

/** The tiles anyone may walk, row or land on have changed: forget every search that found no way. */
export function reshaped(w: World) { caches(w).cutOff = null; }

/** A tile of belt was laid or taken up: the lines are worked out again. */
export function beltsChanged(w: World) { caches(w).net = null; }

/** A building turned where it stands: its door may now open beside a belt, or no longer. */
export function turned(S: State) { caches(S.world).besides = null; }

/**
 * The game was saved. A save carries the state, not the caches, and every cache but one is worked out again just as
 * it was: the remembered searches that found no way only save work, and a loaded game starts without them. So the
 * game that goes on forgets them too, and both count the same work from here.
 */
export function saved(S: State) { caches(S.world).cutOff = null; }

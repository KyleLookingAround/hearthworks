---
type: System
title: Logistics
description: The job board — requests, offers, reservations, carriers and courier bots, carts, and deliveries in legs through each district's yard.
tags: [logistics, core]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-06T05:27:23Z }
tuning:
  villager_carry: 2
  bot_carry: 3
  villager_speed: 3
  bot_speed: 4.9
  path_speed: 1.7
  road_speed: 2.4
  stone_road_speed: 3
  forest_speed: 0.65
  boat_speed: 4
  output_cap: 6
  release_after_seconds: 20
  cart_carry: 6
  cart_path_speed: 1.3
  cart_road_speed: 1.6
  cart_rough_speed: 0.9
  cart_min_tiles: 20
  cart_reach: 30
  ox_carry: 12
  ox_path_speed: 1.2
  ox_road_speed: 1.4
  ox_rough_speed: 0.8
  ox_min_tiles: 40
  ox_feed: 1
  hub_reach: 20
  relay_min_tiles: 20
  hub_stock: 12
  relay_min_load: 4
  relay_bonus: 20
  advise_long_hauls: 300
  advise_foot_share: 0.6
  round_tiles: 8
  dump_at: 3
  surplus_penalty: 12
  harvest_priority: 4
  request_aging: 0.5
  no_way_retry_seconds: 30
  slope_cost: 0.006
  rock_cost: 2.5
  idle_look_seconds: 0.5
  idle_look_jitter: 0.4
  wander_chance: 0.3
---

# Rules

1. Every item is physically carried. There is no global stockpile.
2. Buildings post **requests**: construction sites want their `cost`, workplaces and houses want their `keep_stocked` goods. A home at least `cart_min_tiles` from every storage yard of its settlement asks for its food once a pair of hands' worth is missing, or when it has run out, not a loaf at a time: on Gate 16's seed an hour had held 4596 trips across town with a single loaf. Near a yard a loaf at a time stays: a hamlet whose every home waited for a pair went hungry.
3. Buildings post **offers**: a producer offers its outputs, a storage yard offers everything it holds.
4. An idle carrier looks for work every `idle_look_seconds` and up to `idle_look_jitter` more (a new one first within `idle_look_seconds`); finding none, it wanders off near a store at `wander_chance`, as children do. It scores every request against every building offering that good (offers are indexed by good, so pairs that could never match are not scored) by walking distance (houses get a priority bonus; storage a small penalty) and claims the cheapest. A villager only takes jobs within their own settlement. While the agents take their turns in a tick, the board stands: after a job is claimed or goods are picked up or dropped, only the buildings touched ask again, and the carriers of a settlement share one look at it until one of its own buildings is touched. None of this changes any choice, only the work of making it. The board belongs to its game, with every other cache of the simulation (`src/sim/caches.ts`, which says what each depends on and what makes it be worked out again).
6. **No way in.** When a carrier finds no way to a building's door, and its own settlement's storage cannot reach that door either, the building shows "No way in" and nobody is sent there for `no_way_retry_seconds`, so one cut-off building cannot keep every carrier searching. If storage can reach it, the carrier is the one cut off and waits out the same time. A storage yard is never closed so: everyone else walks from it, so the one who failed is the one cut off. Someone left out on open water (their row cut short) rows on from where they are. A worker who cannot walk to a workplace no longer works it from afar. Route searches may look at every tile of the map once on foot (twice when rowing), so long trips on big maps are found. A search that finds no way because it ran out of tiles to try remembers every tile it reached, so a later search from one of them for a tile beyond them fails at once, until land opens up (a building comes down or turns, a bridge is finished, a dock is built) or the game is saved (a loaded game starts without them, so the game that plays on forgets them too and both count the same work: [saves](/systems/saves.md)).
5. **Surplus.** A workplace's output piling up (`dump_at` or more) goes to the nearest storage yard with room, scored `surplus_penalty` tiles behind a request so it never crowds out what someone is waiting for. With [seasons](/systems/seasons.md), in summer and autumn while a settlement's winter store has fallen behind, its harvest (the goods of the food chain that keep: grain, smoked fish) comes in as readily as a home's food (`harvest_priority` tiles ahead instead): on Gate 12's seed 1 the first frost found 59 wheat standing at full farms, three farms idle for it, and the yards with 0.82 of the winter's meals.
5. **Waiting requests come closer.** A request nobody has started serving counts as `request_aging` tiles nearer for every second it waits, so a far forester's logs are fetched in the end even while short surplus runs keep coming up.
6. Claiming **reserves** the goods at the source and marks them **incoming** at the destination, so no two carriers chase the same stack.
7. A producer holding at least `dump_at` of an output nobody asked for sends it to the nearest [storage yard](/blueprints/storage.md).
8. A producer whose output reaches `output_cap` stalls. Once it has stood full for `release_after_seconds`, its worker leaves to carry, and the job is filled again by the next idle carrier.

# Carts

With carts on (every new game, off in older scenarios), a [Cart Shed](/blueprints/cart_shed.md) lends handcarts. A villager taking a job of at least `cart_min_tiles` within `cart_reach` of a shed with a cart free takes one: `cart_carry` goods instead of `villager_carry`, `cart_road_speed` times as fast on [roads](/blueprints/road.md), `cart_path_speed` on paths and bridges and `cart_rough_speed` elsewhere. The cart goes back when the load is delivered.

- **Rounds.** A carrier taking a cart fills it: after the first drop, the same good for others asking within `round_tiles` of it, nearest first, delivered in turn. A home far from every yard that holds back a request worth less than a pair of hands is still topped up by a cart passing on its round; those small requests are never scored on their own, so they cost the job board nothing.
- **Cartloads.** A cart bound for a workshop that uses the good brings it a cartload, beyond its usual shelf: a bakery across town gets six sacks of wheat at once, not one or two.

- **Ox carts.** An [Ox Barn](/blueprints/ox_barn.md) keeps ox carts for the longest hauls. A job of at least `ox_min_tiles` within `cart_reach` of a barn with an ox free and `ox_feed` wheat in its stock takes an ox cart: `ox_carry` goods, at `ox_road_speed` on roads, `ox_path_speed` on paths and bridges and `ox_rough_speed` elsewhere, the feed eaten as it sets out. Rounds and cartloads fill it as they fill a handcart; a load that a handcart could take goes by handcart, which is quicker. A long job with no ox to be had takes a handcart.

# Hubs: deliveries in legs

With carts on, a long haul may go in legs: by cart to the storage yard of the district it is bound for, and from there on foot. Each home and workplace has a **hub**: its settlement's finished storage yard nearest it, if within `hub_reach` tiles. Carriers hand loads on at hubs rather than one carrier walking every load the whole way, and only where that beats the single trip: by cart, and from a source at least `relay_min_tiles` from the hub (nearer, and the source stands in the hub's own district). A hub holds up to `hub_stock` of a good brought on for its district, as its room allows.

- **The rest of a cartload.** A carter whose load and round leave room in the cart, bound for a home or workplace whose hub lies far from the source, takes the rest of a cartload to the hub after the last drop: the next of the district's homes to ask walks a few tiles to its yard, not across the settlement to the source. A load two hands could carry goes no further than its own drops.
- **Stocking up by the cartload.** A hub whose district asks for a good from far off asks for it in turn, as urgently as the most urgent of them and `relay_bonus` tiles nearer, from a maker or a yard at least `relay_min_tiles` away with `relay_min_load` or more of it to spare (a yard whose own district asks for the good keeps `hub_stock` back for it). Only a carrier with a cart takes that job, and only for `relay_min_load` goods or more; a round fills the cart with the district's homes on the way.
- **Waiting for the cart.** A home or workplace that still has at least half of what it keeps of the good on its shelf, and whose hub is stocking up, does not have it walked from beyond `relay_min_tiles` of its hub one at a time: it waits for the cart. One whose shelf runs lower is served as before, whichever way is quickest.
- **Along a belt.** A home or workplace off the belt whose hub stands beside one is served the same way along it: the belt brings a load from a building beside the same line at least `relay_min_tiles` from the asker to its hub ([conveyors](/systems/conveyors.md)).

Each delivery counts the way it went (on foot, by handcart, by ox cart, by bot, along a belt), every leg on its own, and the goods handed on at a hub, in the stats and in each settlement's count. The Steward panel shows how a settlement's goods go and how many it handed on at its yards; a yard's inspector says whose hub it is and what is coming to it; a cart shed's says which of its carts are going on to a hub; the advisor points at hauling when a settlement's long hauls go mostly on foot (`advise_foot_share` of them, once it has seen `advise_long_hauls`).

On Gate 16's world, long hauls on foot spent more of their tiles walking to the goods (22 on average) than carrying them (16), and the goods they carried were made one at a time and taken as soon as made: there is little slack to gather into a cartload. See the [log](/log.md) for what the legs carry.

# River boats

Not built: within one settlement, water almost never gives a shorter way. Measured on the main branch (2026-10-06) over the long hauls under way every 30 seconds for an hour, a trip rowing from any shore (as if every shore had a landing) beat walking by 15% or more on 0.5 to 1.8% of them on Landmass L and M, 0.4 to 0.9% on the Islands at M, and none on the Coast at M; a boat (`boat_speed` 4) is slower than a walker on a path, the planner builds only where it can walk from its storage, and bridges cross rivers up to six tiles wide. The Islands have no rivers. Their place is with deliveries to districts across the water ([roadmap](/roadmap.md) Phase 24), or a map whose towns grow along a broad river: Kyle's call.

# Walls and doors

Buildings are solid. A building is entered only through its door, the middle of the side it faces; every other tile of it blocks walking, and nobody cuts a corner past a wall or water. Every building faces one of four ways (south, west, north or east: a quarter turn swaps its width and height), and the tile beyond its door, the door front, must stay open. The player turns a building while placing it (R, Shift+R back, or the Turn button by the hint) and turns one already standing from its inspector, about its centre, when its turned footprint and door fit there. The planner turns a [dock](/blueprints/dock.md) to face whichever shore it finds; everything else it builds faces south. Someone caught on a tile where a new building goes (or turns) steps out to its door front, and anyone whose route crossed it finds a new one. Walking around buildings made trips 20 to 35% longer, so `villager_speed` rose from 2.2 to 3 and `bot_speed` from 3.6 to 4.9 to keep the economy's pace (see the [log](/log.md)).

# Boats

Water is crossed by rowing boat. Boats are launched from a [dock](/blueprints/dock.md)'s door and can land on any shore; someone who landed by boat has it with them and can launch again from wherever they are. Route finding plans walking and rowing together (walk to the dock, row, land, walk on), rowing at `boat_speed`. With no dock in the world nobody rows, so maps without docks route exactly as before.

# Terrain, roads and bridges

Route finding and walking speed agree: a [path](/blueprints/path.md) or [bridge](/blueprints/bridge.md) tile costs `1 / path_speed`, a [road](/blueprints/road.md) tile `1 / road_speed`, a [stone road](/blueprints/stone_road.md) tile `1 / stone_road_speed`, a tile under grown trees `1 / forest_speed`, rock `rock_cost`, and every step up or down costs `slope_cost` per unit of height more (both read from this tuning; before, two of them were copies in code). Feet wear the tiles they cross; the wear fades with a half-life of the [planner](/systems/planner.md)'s `wear_half_life_seconds`, and planners pave the most worn tiles into paths. Deliveries also count the tiles they step on roads and on paths, so receipts can compare the pace of those mostly along roads with those mostly along paths. Every delivery records its time from claim to drop-off and its straight-line length (carrier to source to destination), so receipts can report `mean_delivery_seconds` and the pace per tile.

# Storage and spoiling

A store holds at most its blueprint's `capacity` goods in all, and takes only the goods it `keeps` if it lists them: a [Storage Yard](/blueprints/storage.md) 300 of anything, a [Warehouse](/blueprints/warehouse.md) 600, a [Granary](/blueprints/granary.md) 400 of food. Surplus goes to the nearest store with room that takes it. Every `spoil_every_seconds` ([production](/systems/production.md)), food left in a store that does not keep it loses the whole units of its `spoils` share of the pile ([bread](/goods/bread.md) 2%, [fish](/goods/fish.md) 5%), so only large piles go off. A home's food is delivered before its comforts.

# Carriers

| Carrier | Capacity | Speed (tiles/s) | Limits |
| --- | --- | --- | --- |
| Villager | `villager_carry` | `villager_speed` | Slowed in forest, faster on roads |
| Courier bot | `bot_carry` | `bot_speed` | Only jobs inside its [depot](/blueprints/depot.md) radius |
| [Conveyor](/blueprints/conveyor.md) belt | [conveyors](/systems/conveyors.md) `carry` | `speed` | Only between buildings beside the same belt; served first each tick |

# Code

`src/sim/logistics.ts`, `src/sim/agents.ts`, `src/sim/path.ts`

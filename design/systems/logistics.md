---
type: System
title: Logistics
description: The job board — requests, offers, reservations, carriers and courier bots.
tags: [logistics, core]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-04T12:49:27Z }
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
  round_tiles: 8
  dump_at: 3
  request_aging: 0.5
  no_way_retry_seconds: 30
  slope_cost: 0.006
  rock_cost: 2.5
---

# Rules

1. Every item is physically carried. There is no global stockpile.
2. Buildings post **requests**: construction sites want their `cost`, workplaces and houses want their `keep_stocked` goods. A home at least `cart_min_tiles` from every storage yard of its settlement asks for its food once a pair of hands' worth is missing, or when it has run out, not a loaf at a time: on Gate 16's seed an hour had held 4596 trips across town with a single loaf. Near a yard a loaf at a time stays: a hamlet whose every home waited for a pair went hungry.
3. Buildings post **offers**: a producer offers its outputs, a storage yard offers everything it holds.
4. An idle carrier scores every request against every building offering that good (offers are indexed by good, so pairs that could never match are not scored) by walking distance (houses get a priority bonus; storage a small penalty) and claims the cheapest. A villager only takes jobs within their own settlement.
6. **No way in.** When a carrier finds no way to a building's door, and its own settlement's storage cannot reach that door either, the building shows "No way in" and nobody is sent there for `no_way_retry_seconds`, so one cut-off building cannot keep every carrier searching. If storage can reach it, the carrier is the one cut off and waits out the same time. A storage yard is never closed so: everyone else walks from it, so the one who failed is the one cut off. Someone left out on open water (their row cut short) rows on from where they are. A worker who cannot walk to a workplace no longer works it from afar. Route searches may look at every tile of the map once on foot (twice when rowing), so long trips on big maps are found.
5. **Waiting requests come closer.** A request nobody has started serving counts as `request_aging` tiles nearer for every second it waits, so a far forester's logs are fetched in the end even while short surplus runs keep coming up.
6. Claiming **reserves** the goods at the source and marks them **incoming** at the destination, so no two carriers chase the same stack.
7. A producer holding at least `dump_at` of an output nobody asked for sends it to the nearest [storage yard](/blueprints/storage.md).
8. A producer whose output reaches `output_cap` stalls. Once it has stood full for `release_after_seconds`, its worker leaves to carry, and the job is filled again by the next idle carrier.

# Carts

With carts on (every new game, off in older scenarios), a [Cart Shed](/blueprints/cart_shed.md) lends handcarts. A villager taking a job of at least `cart_min_tiles` within `cart_reach` of a shed with a cart free takes one: `cart_carry` goods instead of `villager_carry`, `cart_road_speed` times as fast on [roads](/blueprints/road.md), `cart_path_speed` on paths and bridges and `cart_rough_speed` elsewhere. The cart goes back when the load is delivered.

- **Rounds.** A carrier taking a cart fills it: after the first drop, the same good for others asking within `round_tiles` of it, nearest first, delivered in turn. A home far from every yard that holds back a request worth less than a pair of hands is still topped up by a cart passing on its round; those small requests are never scored on their own, so they cost the job board nothing.
- **Cartloads.** A cart bound for a workshop that uses the good brings it a cartload, beyond its usual shelf: a bakery across town gets six sacks of wheat at once, not one or two.

- **Ox carts.** An [Ox Barn](/blueprints/ox_barn.md) keeps ox carts for the longest hauls. A job of at least `ox_min_tiles` within `cart_reach` of a barn with an ox free and `ox_feed` wheat in its stock takes an ox cart: `ox_carry` goods, at `ox_road_speed` on roads, `ox_path_speed` on paths and bridges and `ox_rough_speed` elsewhere, the feed eaten as it sets out. Rounds and cartloads fill it as they fill a handcart; a load that a handcart could take goes by handcart, which is quicker. A long job with no ox to be had takes a handcart.

River boats between jetties and multi-leg deliveries through hubs come later.

# Walls and doors

Buildings are solid. A building is entered only through its door, the middle of the side it faces; every other tile of it blocks walking, and nobody cuts a corner past a wall or water. Every building faces one of four ways (south, west, north or east: a quarter turn swaps its width and height), and the tile beyond its door, the door front, must stay open. The player turns a building while placing it (R, Shift+R back, or the Turn button by the hint) and turns one already standing from its inspector, about its centre, when its turned footprint and door fit there. The planner turns a [dock](/blueprints/dock.md) to face whichever shore it finds; everything else it builds faces south. Someone caught on a tile where a new building goes (or turns) steps out to its door front, and anyone whose route crossed it finds a new one. Walking around buildings made trips 20 to 35% longer, so `villager_speed` rose from 2.2 to 3 and `bot_speed` from 3.6 to 4.9 to keep the economy's pace (see the [log](/log.md)).

# Boats

Water is crossed by rowing boat. Boats are launched from a [dock](/blueprints/dock.md)'s door and can land on any shore; someone who landed by boat has it with them and can launch again from wherever they are. Route finding plans walking and rowing together (walk to the dock, row, land, walk on), rowing at `boat_speed`. With no dock in the world nobody rows, so maps without docks route exactly as before.

# Terrain, roads and bridges

Route finding and walking speed agree: a [path](/blueprints/path.md) or [bridge](/blueprints/bridge.md) tile costs `1 / path_speed`, a [road](/blueprints/road.md) tile `1 / road_speed`, a [stone road](/blueprints/stone_road.md) tile `1 / stone_road_speed`, a tile under grown trees `1 / forest_speed`, rock `rock_cost`, and every step up or down costs `slope_cost` per unit of height more (both read from this tuning; before, two of them were copies in code). Feet wear the tiles they cross; the wear fades with a half-life of the [planner](/systems/planner.md)'s `wear_half_life_seconds`, and planners pave the most worn tiles into paths. Deliveries also count the tiles they step on roads and on paths, so receipts can compare the pace of those mostly along roads with those mostly along paths. Every delivery records its time from claim to drop-off and its straight-line length (carrier to source to destination), so receipts can report `mean_delivery_seconds` and the pace per tile.

# Storage and spoiling

A store holds at most its blueprint's `capacity` goods in all, and takes only the goods it `keeps` if it lists them: a [Storage Yard](/blueprints/storage.md) 300 of anything, a [Warehouse](/blueprints/warehouse.md) 600, a [Granary](/blueprints/granary.md) 400 of food. Surplus goes to the nearest store with room that takes it. Once a minute, food left in a store that does not keep it loses the whole units of its `spoils` share of the pile ([bread](/goods/bread.md) 2%, [fish](/goods/fish.md) 5%), so only large piles go off. A home's food is delivered before its comforts.

# Carriers

| Carrier | Capacity | Speed (tiles/s) | Limits |
| --- | --- | --- | --- |
| Villager | `villager_carry` | `villager_speed` | Slowed in forest, faster on roads |
| Courier bot | `bot_carry` | `bot_speed` | Only jobs inside its [depot](/blueprints/depot.md) radius |

# Code

`src/sim/logistics.ts`, `src/sim/agents.ts`, `src/sim/path.ts`

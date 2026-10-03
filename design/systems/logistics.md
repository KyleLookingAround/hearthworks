---
type: System
title: Logistics
description: The job board — requests, offers, reservations, carriers and courier bots.
tags: [logistics, core]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T15:06:44Z }
tuning:
  villager_carry: 2
  bot_carry: 3
  villager_speed: 3
  bot_speed: 4.9
  road_speed: 1.7
  forest_speed: 0.65
  boat_speed: 4
  output_cap: 6
  dump_at: 3
  request_aging: 0.5
  no_way_retry_seconds: 30
  slope_cost: 0.006
  rock_cost: 2.5
---

# Rules

1. Every item is physically carried. There is no global stockpile.
2. Buildings post **requests**: construction sites want their `cost`, workplaces and houses want their `keep_stocked` goods.
3. Buildings post **offers**: a producer offers its outputs, a storage yard offers everything it holds.
4. An idle carrier scores every request against every building offering that good (offers are indexed by good, so pairs that could never match are not scored) by walking distance (houses get a priority bonus; storage a small penalty) and claims the cheapest. A villager only takes jobs within their own settlement.
6. **No way in.** When a carrier finds no way to a building's door, and its own settlement's storage cannot reach that door either, the building shows "No way in" and nobody is sent there for `no_way_retry_seconds`, so one cut-off building cannot keep every carrier searching. If storage can reach it, the carrier is the one cut off and waits out the same time. A worker who cannot walk to a workplace no longer works it from afar. Route searches may look at every tile of the map once on foot (twice when rowing), so long trips on big maps are found.
5. **Waiting requests come closer.** A request nobody has started serving counts as `request_aging` tiles nearer for every second it waits, so a far forester's logs are fetched in the end even while short surplus runs keep coming up.
6. Claiming **reserves** the goods at the source and marks them **incoming** at the destination, so no two carriers chase the same stack.
7. A producer holding at least `dump_at` of an output nobody asked for sends it to the nearest [storage yard](/blueprints/storage.md).
8. A producer whose output reaches `output_cap` stalls.

# Walls and doors

Buildings are solid. A building is entered only through its door (the middle of its bottom row); every other tile of it blocks walking, and nobody cuts a corner past a wall or water. Someone caught on a tile where a new building goes steps out to its door front, and anyone whose route crossed it finds a new one. Walking around buildings made trips 20 to 35% longer, so `villager_speed` rose from 2.2 to 3 and `bot_speed` from 3.6 to 4.9 to keep the economy's pace (see the [log](/log.md)).

# Boats

Water is crossed by rowing boat. Boats are launched from a [dock](/blueprints/dock.md)'s door and can land on any shore; someone who landed by boat has it with them and can launch again from wherever they are. Route finding plans walking and rowing together (walk to the dock, row, land, walk on), rowing at `boat_speed`. With no dock in the world nobody rows, so maps without docks route exactly as before.

# Terrain, roads and bridges

Route finding and walking speed agree: a road or [bridge](/blueprints/bridge.md) tile costs `1 / road_speed`, a tile under grown trees `1 / forest_speed`, rock `rock_cost`, and every step up or down costs `slope_cost` per unit of height more (both read from this tuning; before, two of them were copies in code). Feet wear the tiles they cross; the wear fades with a half-life of the [planner](/systems/planner.md)'s `wear_half_life_seconds`, and planners pave the most worn tiles into roads. Every delivery records its time from claim to drop-off and its straight-line length (carrier to source to destination), so receipts can report `mean_delivery_seconds` and the pace per tile.

# Carriers

| Carrier | Capacity | Speed (tiles/s) | Limits |
| --- | --- | --- | --- |
| Villager | `villager_carry` | `villager_speed` | Slowed in forest, faster on roads |
| Courier bot | `bot_carry` | `bot_speed` | Only jobs inside its [depot](/blueprints/depot.md) radius |

# Code

`src/sim/logistics.ts`, `src/sim/agents.ts`, `src/sim/path.ts`

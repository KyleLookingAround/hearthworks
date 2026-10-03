---
type: System
title: Logistics
description: The job board — requests, offers, reservations, carriers and courier bots.
tags: [logistics, core]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T12:27:37Z }
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
---

# Rules

1. Every item is physically carried. There is no global stockpile.
2. Buildings post **requests**: construction sites want their `cost`, workplaces and houses want their `keep_stocked` goods.
3. Buildings post **offers**: a producer offers its outputs, a storage yard offers everything it holds.
4. An idle carrier scores every request/offer pair by walking distance (houses get a priority bonus; storage a small penalty) and claims the cheapest. A villager only takes jobs within their own settlement.
5. **Waiting requests come closer.** A request nobody has started serving counts as `request_aging` tiles nearer for every second it waits, so a far forester's logs are fetched in the end even while short surplus runs keep coming up.
6. Claiming **reserves** the goods at the source and marks them **incoming** at the destination, so no two carriers chase the same stack.
7. A producer holding at least `dump_at` of an output nobody asked for sends it to the nearest [storage yard](/blueprints/storage.md).
8. A producer whose output reaches `output_cap` stalls.

# Walls and doors

Buildings are solid. A building is entered only through its door (the middle of its bottom row); every other tile of it blocks walking, and nobody cuts a corner past a wall or water. Someone caught on a tile where a new building goes steps out to its door front, and anyone whose route crossed it finds a new one. Walking around buildings made trips 20 to 35% longer, so `villager_speed` rose from 2.2 to 3 and `bot_speed` from 3.6 to 4.9 to keep the economy's pace (see the [log](/log.md)).

# Boats

Water is crossed by rowing boat. Boats are launched from a [dock](/blueprints/dock.md)'s door and can land on any shore; someone who landed by boat has it with them and can launch again from wherever they are. Route finding plans walking and rowing together (walk to the dock, row, land, walk on), rowing at `boat_speed`. With no dock in the world nobody rows, so maps without docks route exactly as before.

# Carriers

| Carrier | Capacity | Speed (tiles/s) | Limits |
| --- | --- | --- | --- |
| Villager | `villager_carry` | `villager_speed` | Slowed in forest, faster on roads |
| Courier bot | `bot_carry` | `bot_speed` | Only jobs inside its [depot](/blueprints/depot.md) radius |

# Code

`src/sim/logistics.ts`, `src/sim/agents.ts`, `src/sim/path.ts`

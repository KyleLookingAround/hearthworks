---
type: System
title: Logistics
description: The job board — requests, offers, reservations, carriers and courier bots.
tags: [logistics, core]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T11:46:25Z }
tuning:
  villager_carry: 2
  bot_carry: 3
  villager_speed: 2.2
  bot_speed: 3.6
  road_speed: 1.7
  forest_speed: 0.65
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

# Carriers

| Carrier | Capacity | Speed (tiles/s) | Limits |
| --- | --- | --- | --- |
| Villager | `villager_carry` | `villager_speed` | Slowed in forest, faster on roads |
| Courier bot | `bot_carry` | `bot_speed` | Only jobs inside its [depot](/blueprints/depot.md) radius |

# Code

`src/sim/logistics.ts`, `src/sim/agents.ts`, `src/sim/path.ts`

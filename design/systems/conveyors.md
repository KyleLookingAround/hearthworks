---
type: System
title: Conveyors
description: Belts laid along the lanes from a storage yard's door; goods ride them between the buildings beside them with no hands.
tags: [logistics, automation, ages]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-05T03:35:56Z }
tuning:
  speed: 6
  carry: 2
  gap_seconds: 1.5
  reach: 2
  rough_cost: 3
  look_every_seconds: 120
  villagers_per_belt: 20
  min_tiles: 8
  max_tiles: 32
  min_stops: 4
---

# Idea

The machine tier after [courier bots](/blueprints/depot.md), and the second blueprint an age unlocks: the [Conveyor](/blueprints/conveyor.md) of the [Age of Clockwork](/eras/clockwork.md). Bots stay within a short reach of their depot, so on a grown island most of them stand idle while carriers walk the long hauls (on default new games, an hour in: 15 to 34% of bots busy against 61 to 85% of carriers). A belt carries goods as far as it runs. Code: `src/sim/belts.ts`.

# The belt

Belt tiles join their neighbours (side by side, not corner to corner) into one line, which may branch where two strips cross. A building is **beside** a belt when the tile in front of its door lies within `reach` tiles of one. Any two buildings beside the same line can send goods along it:

1. **Requests.** A request (the [job board](/systems/logistics.md)'s: a home's food, a workshop's input, a site's materials) from a building beside a belt is met from the nearest building beside the same line, along the belt, that offers the good (a store, or a workshop's output), in its settlement.
2. **Surplus.** A workshop beside a belt holding `dump_at` of an output nobody asked for sends it to the nearest store beside the line with room for it.
3. A load is up to `carry` goods. It leaves at once (the goods are gone from the source, and counted as incoming at the destination, so no carrier comes for them too) and rides at `speed` tiles a second along the belt, a tile on and a tile off included: about as fast as someone walks a road, without the walk to fetch it. A building sends at most one load every `gap_seconds` onto the belt from each belt tile it uses.
4. A load for a building that is gone by the time it arrives is lost.

The belt is served before the carriers look for work each tick, so what its buildings ask of each other it carries, and the carriers take everything else. Belts need no hands and eat nothing.

# Laying belts

Every `look_every_seconds`, a self-planning settlement that knows the Conveyor and has fewer belts than one, and another for every `villagers_per_belt` people, looks for the best belt to lay: from the tile in front of one of its storage yards' doors, along its lanes (its [paths](/blueprints/path.md) and [roads](/blueprints/road.md)) and across the tiles in front of doors, to the door of a building no belt serves yet, at most `max_tiles` long. A belt never takes land a building could stand on, and never runs through a building, water or rock. Of the routes to each door it takes the cheapest, a tile of lane counting 1, of belt already laid a half (so later belts branch off the first) and any other open tile `rough_cost`. A belt is worth laying with at least `min_tiles` new tiles and `min_stops` buildings beside it that no belt serves yet; the best serves the most of them, each counted by how far along it lies from the yard (the walking it saves). It is paid at the Conveyor's `cost` a tile from the stores at once, as a road is. Belts in use keep the Conveyor in mind.

A first belt laid in straight strips from a yard's door, as roads are, was tried and dropped: hamlets wind, and a straight strip passed few doors (none at all on some seeds); laid over open land, it also took land a building could stand on ([log](/log.md), 2026-10-05).

# Not yet

Belts that climb hills slower, that wear and need mending, that carry over bridges, and rail, the tier after belts, come later.

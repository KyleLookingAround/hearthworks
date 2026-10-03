---
type: System
title: Starting settlement
description: What a new game begins with, per settlement — a storage yard, two houses, a road and five villagers.
tags: [world, balance]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T11:46:25Z }
tuning:
  villagers: 5
  storage: { planks: 30, bread: 12, logs: 4 }
  house_stock: { bread: 3 }
  names: [Hearth, Brook, Ashby, Fenwick]
  neighbour_min_distance: 12
  neighbour_spacing: 30
---

# Layout

A [Storage Yard](/blueprints/storage.md) at the island centre, a [House](/blueprints/house.md) either side and a road along the south edge.

# Neighbours

A game founds as many settlements as the player picks (the [map](/systems/map.md) size sets the default, two), named from `names` in order: the first at the centre of the map, each further one with the same layout on open grass at least `neighbour_min_distance` tiles from every other and reachable on foot. Among those spots it takes the farthest from its nearest neighbour, up to `neighbour_spacing` tiles, then the one with the most land around it; on large maps that keeps villages apart without pushing them into corners. Gates found one unless their scenario asks for more. Each settlement has its own [knowledge](/systems/knowledge.md) and [planner](/systems/planner.md).

On the small island the neighbour lands 13 to 17 tiles from the centre on the swept seeds.

# Each settlement runs itself

A settlement's villagers haul, staff workplaces and pay for building from its own stock only, and each settlement has its own mood. Newcomers choose, among the settlements happy enough to draw them, the one with the most free beds. Settlements share knowledge through visitors; sharing goods is [Phase 13](/roadmap.md).

# Balance intent

Thirty planks cover a Forester, Sawmill, Farm and Bakery (22) with enough left for one more house. The 18 starting loaves last about two and a half minutes once the first newcomer arrives, which is the time a new player has to start the bread chain. [Gate 1](/gates/01-first-plank.md) runs without bread and sees the first departure just before three minutes.

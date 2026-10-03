---
type: System
title: Starting settlement
description: What a new game begins with, per settlement — a storage yard, two houses, a road and five villagers.
tags: [world, balance]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T12:35:18Z }
tuning:
  villagers: 5
  storage: { planks: 30, bread: 12, logs: 4 }
  house_stock: { bread: 3 }
  names: [Hearth, Brook, Ashby, Fenwick]
  neighbour_min_distance: 12
  neighbour_spacing: 30
  neighbour_min_room: 160
  start_room_share: 0.85
  start_wood_weight: 2
---

# Layout

A [Storage Yard](/blueprints/storage.md), a [House](/blueprints/house.md) either side and a road along the south edge. Each settlement gets a grove planted north-west of it and its centre cleared of trees.

# Neighbours

A game founds as many settlements as the player picks (the [map](/systems/map.md) size sets the default, two), named from `names` in order. The **first** is placed by the seed: every spot where the starting layout fits on open grass scores its room to grow (grass within 8 tiles) plus `start_wood_weight` per grown tree within 10, and the seed picks one of the spots scoring at least `start_room_share` of the best, so a village starts near wood. Each further one goes with the same layout on open grass at least `neighbour_min_distance` tiles from every other, with at least `neighbour_min_room` tiles of grass to grow into, and reachable on foot unless the map allows neighbours across water (`neighbours: anywhere`). Among those spots it takes the farthest from its nearest neighbour, up to `neighbour_spacing` tiles, then the one with the most land around it; on large maps that keeps villages apart without pushing them into corners. A map with no such spot founds fewer settlements, and the new-game screen says so. Gates found one unless their scenario asks for more. Each settlement has its own [knowledge](/systems/knowledge.md) and [planner](/systems/planner.md).

On the small island the neighbour lands 13 to 17 tiles from the centre on the swept seeds.

# Each settlement runs itself

A settlement's villagers haul, staff workplaces and pay for building from its own stock only, and each settlement has its own mood. Newcomers choose, among the settlements happy enough to draw them, the one with the most free beds. Settlements share knowledge through visitors; sharing goods is [Phase 13](/roadmap.md).

# Balance intent

Thirty planks cover a Forester, Sawmill, Farm and Bakery (22) with enough left for one more house. The 18 starting loaves last about two and a half minutes once the first newcomer arrives, which is the time a new player has to start the bread chain. [Gate 1](/gates/01-first-plank.md) runs without bread and sees the first departure just before three minutes.

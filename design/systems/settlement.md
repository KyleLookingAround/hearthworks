---
type: System
title: Starting settlement
description: What a new game begins with, per settlement — a storage yard, two houses, a road and five villagers.
tags: [world, balance]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T10:29:28Z }
tuning:
  villagers: 5
  storage: { planks: 30, bread: 12, logs: 4 }
  house_stock: { bread: 3 }
  names: [Hearth, Brook, Ashby, Fenwick]
  neighbour_min_distance: 12
  game_settlements: 2
---

# Layout

A [Storage Yard](/blueprints/storage.md) at the island centre, a [House](/blueprints/house.md) either side and a road along the south edge.

# Neighbours

The game founds `game_settlements` settlements, named from `names` in order: the first at the island centre, each further one with the same layout on open grass at least `neighbour_min_distance` tiles from every other, as far off as the island allows (then the most land around it), and reachable on foot. Gates found one unless their scenario asks for more. Each settlement has its own [knowledge](/systems/knowledge.md) and [planner](/systems/planner.md).

The island is small: on the swept seeds the neighbour lands 13 to 17 tiles from the centre.

# Balance intent

Thirty planks cover a Forester, Sawmill, Farm and Bakery (22) with enough left for one more house. The 18 starting loaves last about two and a half minutes once the first newcomer arrives, which is the time a new player has to start the bread chain. [Gate 1](/gates/01-first-plank.md) runs without bread and sees the first departure just before three minutes.

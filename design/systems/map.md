---
type: System
title: Map
description: Map types and sizes, seeded generation, the standard map, trees and regrowth.
tags: [world]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T12:27:37Z }
tuning:
  standard_type: island
  standard_size: small
  game_size: medium
  sizes: { small: { width: 56, height: 40, settlements: 2 }, medium: { width: 112, height: 80, settlements: 2 }, large: { width: 192, height: 144, settlements: 2 } }
  tree_grow_seconds: 40
---

# Map types

Each kind of world is a concept in [maps](/maps/): [Islands](/maps/islands.md) (several islands; the first choice for players), [Landmass](/maps/landmass.md) (with rivers), [Coast](/maps/coast.md) (with islets and a river) and [Lone isle](/maps/island.md) (the standard). Its frontmatter drives the generator: noise scales, how height falls off (from the centre, from each island's centre, from one side, or not at all), islets, rivers, water and sand levels, whether the border is sea, forest density, and whether neighbours may start across water. Tiles are water, sand or grass. A new kind of world is written, not coded.

The same seed and type always give the same world; the [gates](/gates/) depend on it.

# Sizes

`sizes` lists the sizes a player can pick (a new game starts at `game_size`), each with its width, height and the settlements a new game starts with (two on every size, so the player can watch two villages grow apart and trade).

# Standard map

`standard_type` at `standard_size` (Lone isle, small: the original island's land, reproduced exactly) is the standard map: every gate runs on it unless its scenario names another. [Roadmap](/roadmap.md) Phase 7 plans to move the standard to Island at medium size once the sim scales.

# New-game screen

Before a game starts the player picks the type, the size, one to four settlements, a seed (or a random one) and whether the villagers plan, with a live preview of the generated land and where each settlement will be founded. "New world" in the HUD reopens it; the last choice is remembered in the browser.

# Trees

Saplings become grown trees after `tree_grow_seconds`. Grown trees slow walkers (see [logistics](/systems/logistics.md)).

# Code

`src/sim/world.ts`

---
type: System
title: Map
description: Map types and sizes, seeded generation, the standard map, trees and regrowth.
tags: [world]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T15:06:44Z }
tuning:
  standard_type: island
  standard_size: standard
  game_size: m
  sizes:
    isle: { width: 56, height: 40, settlements: 2, label: Isle, offered: false }
    standard: { width: 112, height: 80, settlements: 2, label: Standard, offered: false }
    s: { width: 192, height: 144, settlements: 2, label: S }
    m: { width: 288, height: 216, settlements: 2, label: M }
    l: { width: 384, height: 288, settlements: 3, label: L }
    xl: { width: 512, height: 384, settlements: 4, label: XL }
  tree_grow_seconds: 40
---

# Map types

Each kind of world is a concept in [maps](/maps/): [Islands](/maps/islands.md) (several islands; the first choice for players), [Landmass](/maps/landmass.md) (with rivers), [Coast](/maps/coast.md) (with islets and a river) and [Lone isle](/maps/island.md) (the standard). Its frontmatter drives the generator: noise scales, how height falls off (from the centre, from each island's centre, from one side, or not at all), islets, rivers, water and sand levels, whether the border is sea, forest density, and whether neighbours may start across water. Tiles are water, sand or grass. A new kind of world is written, not coded.

The same seed and type always give the same world; the [gates](/gates/) depend on it.

# Sizes

`sizes` lists every size. The player picks S (192 by 144), M (288 by 216, where a new game starts: `game_size`), L (384 by 288) or XL (512 by 384), shown by their `label`; each gives the settlements a new game starts with (two, three on L, four on XL), and the new-game screen offers one to four. Sizes with `offered: false` exist for the gates only: `isle` (56 by 40, the original island) and `standard` (112 by 80). A map type may list the `sizes` it can be played at; Islands leaves out the isle, too small for two villages. Kyle asked for every size two steps bigger than the first S, M and L.

The renderer draws the ground in pieces of 32 by 32 tiles as they come into view, and far out draws the whole world from a small overview, so even XL stays smooth. The player can zoom out until the whole world fits.

# Standard map

`standard_type` at `standard_size` (Lone isle, `standard`, 112 by 80) is the standard map, and every gate names the world it runs on with `map` and `size` parameters. Gates 1 and 4 to 7 run on the standard map; Gates 2 and 3 keep the `isle` their scripted layouts were written for. [Gate 7](/gates/07-worlds.md) runs every type at every size it offers.

# New-game screen

Before a game starts the player picks the type, the size, one to four settlements, a seed (or a random one) and whether the villagers plan, with a live preview of the generated land and where each settlement will be founded. "New world" in the HUD reopens it; the last choice is remembered in the browser.

# Terrain

Every tile of land has a height (0 to 255) from the same noise that shapes the land. Climbing or descending between tiles costs `slope_cost` per unit of height, in route finding and in walking speed alike ([logistics](/systems/logistics.md)). Map types may have `mountains`: land above `mountains.level` is rock, walked at a crawl (`rock_cost`) and never built on (Landmass above 0.85, about 3% of the land; Coast above 1.0, about 10%). Rivers carve through everything.

Deposits lie in the ground, drawn from their own random stream so adding them moved nothing else: fertile soil in patches of grass, stone on and beside rock (small outcrops on maps without mountains), clay on banks beside water, and fish in water near land. Each map type sets how common each is (`deposits`). They are shown on the map and used by nothing yet: goods that need them arrive in [roadmap](/roadmap.md) Phase 11.

# Trees

Saplings become grown trees after `tree_grow_seconds`. Grown trees slow walkers (see [logistics](/systems/logistics.md)).

# Code

`src/sim/world.ts`

---
type: System
title: Map
description: Seeded island generation, terrain, trees and regrowth.
tags: [world]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T08:15:00Z }
tuning:
  width: 56
  height: 40
  tree_grow_seconds: 40
---

# Generation

A seeded island: two octaves of value noise minus a radial falloff, with the centre forced to land. Tiles are water, sand or grass. Forest clusters come from a third noise layer, plus a guaranteed grove north-west of the start so the first [Forester](/blueprints/forester.md) always has trees.

The same seed always gives the same island; the [gates](/gates/) depend on it.

# Trees

Saplings become grown trees after `tree_grow_seconds`. Grown trees slow walkers (see [logistics](/systems/logistics.md)).

# Code

`src/sim/world.ts`

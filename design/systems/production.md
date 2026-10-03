---
type: System
title: Production and construction
description: Construction sites, worker assignment and recipe cycles.
tags: [production, core]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T08:15:00Z }
tuning:
  build_seconds: 3
  replant_every_seconds: 6
  max_trees_near_forester: 9
---

# Construction

A new building starts as a site that requests its `cost` through the [job board](/systems/logistics.md). Once everything is delivered, builders finish it in `build_seconds`.

# Workers

Each second, staffed buildings without a worker take the nearest idle carrier. One villager always stays a carrier until a [Courier Depot](/blueprints/depot.md) exists.

# Recipes

A staffed building with its worker present, all inputs on hand and room in its output buffer runs one cycle every `recipe.seconds`. Status explains any stall: no worker, missing input, output full, no trees.

# Known issues

- **No site priority.** Carriers fill whichever site scores best, so an expensive site can absorb every plank while a cheaper, more urgent one waits. Found by the first draft of [Gate 3](/gates/03-couriers.md); see the [log](/log.md). The [planner](/systems/planner.md) will need priorities anyway.

---
type: System
title: Production and construction
description: Construction sites and their priority queue, worker assignment and recipe cycles.
tags: [production, core]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T11:59:22Z }
tuning:
  build_seconds: 3
  replant_every_seconds: 6
  max_trees_near_forester: 9
  site_priority_tiles: 2
---

# Placement

A building needs open land under every tile, must not cover any other building's **door front** (the tile below a door), and its own door front must be open land. The player is told why a spot is refused ("it would block another building's door"). The [planner](/systems/planner.md) also keeps a ring of open land around what it builds.

# Construction

A new building starts as a site that requests its `cost` through the [job board](/systems/logistics.md). Once everything is delivered, builders finish it in `build_seconds`.

# Site priority

Sites queue for materials: highest priority first, oldest first within a priority. Sites the player places have priority 0; the [planner](/systems/planner.md) gives its sites 1 or more, by how urgent the shortage is.

1. **Promised supply.** Going down the queue, each site is promised its outstanding need from the goods free on offer (in storage or producers' outputs, not yet claimed). A site only requests what is left after every site ahead of it, so an expensive site cannot soak up the planks a cheaper, more urgent one is waiting for. When goods are plentiful every site is served at once, as before.
2. **Carrier preference.** Carriers score a site's request as `site_priority_tiles` tiles nearer per priority level, so an urgent site across town still beats a short dump run to storage.

Code: `siteRequests` in `src/sim/logistics.ts`.

# Workers

Each second, staffed buildings without a worker take the nearest idle carrier. One villager always stays a carrier until a [Courier Depot](/blueprints/depot.md) exists.

# Recipes

A staffed building with its worker present, all inputs on hand and room in its output buffer runs one cycle every `recipe.seconds`. Status explains any stall: no worker, missing input, output full, no trees.

# Resolved issues

- **No site priority** (found by the first draft of [Gate 3](/gates/03-couriers.md)): an expensive site could absorb every plank while a cheaper, more urgent one waited. Fixed by the site priority queue above; see the [log](/log.md).

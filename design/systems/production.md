---
type: System
title: Production and construction
description: Construction sites and their priority queue, worker assignment and recipe cycles.
tags: [production, core]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-05T05:40:58Z }
tuning:
  build_seconds: 3
  replant_every_seconds: 6
  max_trees_near_forester: 9
  site_priority_tiles: 2
  surplus_seconds: 900
  surplus_min: 40
  surplus_full_seconds: 120
  fresh_seconds: 120
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

Each second, staffed buildings without a worker take the nearest idle carrier. One villager always stays a carrier until a [Courier Depot](/blueprints/depot.md) exists. Nobody is sent to a workplace whose output stands full (its worker went carrying after `release_after_seconds`): before, the freed worker was sent straight back, and a hamlet of 15 had 3 carriers while seven workplaces stood full. In a self-planning settlement:

- hands go first where its planner is shortest: open workplaces by how badly it wants what they make;
- while goods stand waiting at a full workplace it keeps the planner's `carrier_share` of its grown villagers carrying, unless it goes hungry and the workplace feeds it;
- a hungry settlement, or one whose winter store has fallen behind, moves to its food chain the worker whose trade it wants least.

# Enough in store

In a self-planning settlement, a workplace whose every good is *enough* rests between cycles, and after `release_after_seconds` its worker goes carrying; nobody is sent to it until the stock runs down. A good is enough while the settlement's stores hold its **stock** and its planner wants no more of it. Farms rest when the granaries are full, as sawmills and quarries do when the yards are: labour goes where the shortages are. Scripted scenarios without a planner are unchanged.

A settlement stocks each good for what it is for:

- **Building goods and the rest** (planks, stone, logs, tools): `surplus_seconds` of what its planner uses, for the builds ahead (at least `surplus_min`). While its open yards are `store_full_share` full, `surplus_full_seconds` will do, so that logs and planks leave room for the harvest.
- **The food chain** (what homes eat and what goes into it): `fresh_seconds` of use, for the days ahead: bread is baked for the week, not the season, and nothing is hoarded to spoil. In autumn, with seasons on, the food chain keeps `surplus_seconds` like the rest: the bakeries bake ahead for the winter, when every hand is carrying and a loaf in store is one leg from a home where grain is two.
- **The winter store**, with seasons on: outside winter, a good of the food chain that keeps (grain, smoked fish; not bread, milk or fish, which [spoil](/systems/logistics.md) in a yard) is enough only once the stores hold the coming winter's meals with `winter_headroom`, for everyone housed and everyone the free beds will bring. The grain is the store.

The planner does not count a good it holds its stock of as short, whatever the rates. Measured on default new games (Islands M, every system on, an hour; twelve worlds, each run three times with the luck drawn afresh): when the food chain kept 900 seconds of use like everything else, the bakeries baked bread all year to fill the yards, and a third of all bread baked went off or stood in store at the hour (24824 goods spoiled in 36 games); stocked for their purpose, 9085 spoiled and the bakeries baked a third less bread for 3% more people. Baking only for the week through autumn as well left small towns without farms hungry at the end of winter, their carriers all busy fetching grain to the bakeries and bread to the homes (Gates 12 and 20 on twelve seeds: 8 departures against 1).

# Recipes

A staffed building with its worker present, all inputs on hand and room in its output buffer runs one cycle every `recipe.seconds`. Status explains any stall: no worker, missing input, output full, no trees.

With [farms that grow](/systems/farms.md), a workplace that has grown has a place for a hand per step beyond its `workers`. Every hand at work adds their pace to the cycle (an estate of three makes three times a smallholding's wheat), its output buffer holds `output_cap` for each place, and hands go to a second place anywhere only after every first place has been offered.

# Resolved issues

- **No site priority** (found by the first draft of [Gate 3](/gates/03-couriers.md)): an expensive site could absorb every plank while a cheaper, more urgent one waited. Fixed by the site priority queue above; see the [log](/log.md).

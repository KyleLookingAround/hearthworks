---
type: System
title: Village planner
description: Each settlement senses its shortages, chooses from what it knows what to build and where, and queues one site at a time, so towns grow on their own.
tags: [ai, planner, core]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T10:29:28Z }
tuning:
  interval_seconds: 3
  settle_seconds: 6
  confirm_cycles: 2
  min_severity: 0.15
  food_headroom: 1.3
  growth_beds: 3
  growth_weight: 0.7
  carrier_share: 0.2
  planks_per_villager_minute: 0.7
  input_cover: 0.6
  cost_weight: 0.01
  urgency_priority: 10
  save_patience_seconds: 180
  haul_weight: 3
  cover_weight: 0.5
  search_radius: 15
  gap: 1
  min_trees: 8
  tree_weight: 0.5
  shared_tree_weight: 0.3
  link_weight: 1
  store_weight: 0.4
  forest_penalty: 6
---

# Goal

The player stops placing buildings. The village notices a shortage, chooses a [blueprint](/blueprints/) that solves it from what it knows, picks a site and builds it. See the [vision](/vision.md). [Gate 4](/gates/04-village-plans.md) holds it to [Gate 2's](/gates/02-sustain-town.md) scripted result.

The code is `src/sim/planner.ts`. It names no building type: what a blueprint relieves is read from its recipe, `homes`, `harvest` and `couriers` fields, so a new blueprint joins in by being written.

Every settlement has its own planner. It looks only at its own people and buildings, builds around its own storage yard, and only proposes blueprints its settlement [knows](/systems/knowledge.md).

# Loop

Every `interval_seconds` the planner:

1. **Waits** while its own site is open, then for `settle_seconds` after it finishes, so the new building shows up in the numbers before the next decision. Sites the player places do not block it.
2. **Senses** each shortage as a severity from 0 to 1:
   - *A good*: the rate it is made against the rate it is used. Producers count at the share their trees (`min_trees` grown trees in range for full rate) and inputs allow; sites count already. Bread is wanted for everyone housed plus everyone the free beds will bring, times `food_headroom`. Planks are wanted at `planks_per_villager_minute` per villager. Recipe inputs are wanted at what their consumers can use.
   - *Beds*: fewer than `growth_beds` free beds, halved while mood is below the newcomer threshold, and zero while bread is short: the village does not invite people it cannot feed. Growth is a want, not a need, so this is scaled by `growth_weight`.
   - *Hauling*: the settlement's hauling pressure ([knowledge](/systems/knowledge.md)) times `haul_weight`. Relieved by a blueprint with `couriers`, in proportion to the share of the settlement's buildings no bots reach yet (ignored below `min_severity`).
   - *Hands*: a finished workplace with no worker and no free bed to bring one is a beds shortage at full severity.
3. **Proposes** for the worst shortage that something it knows can relieve (going down the list) the blueprint with the best `severity × relief − cost_weight × cost`, where relief is the share of the gap it closes. Two follow-ups make chains work:
   - if the choice would idle for lack of an input (spare supply below `input_cover` of what it uses), plan that input's maker first: bread short and no wheat spare means a Farm before the Bakery;
   - if it needs a worker and fewer than one villager is spare after keeping `carrier_share` of the town hauling, wait for newcomers when beds are free, otherwise plan a House.
4. **Confirms**: the same blueprint must top `confirm_cycles` looks in a row.
5. **Checks the cost** against free supply, after every open site's outstanding need. If short and nothing makes the missing good, it plans that maker instead; otherwise it says what it is saving for.
6. **Places** it by scoring every spot within `search_radius` of the storage yard that leaves a `gap`-tile ring of open land (buildings never wall each other in) and can be walked to from storage. Lower is better:
   - `store_weight` × distance to storage, to keep the town compact;
   - harvesters: minus `tree_weight` × grown trees in range, trees already in another harvester's range at `shared_tree_weight`; spots under `min_trees` are skipped;
   - everything else: +1 per grown tree it would clear and `forest_penalty` inside a forester's ground;
   - `link_weight` × distance to the nearest maker of each input and the mean distance to the users of each output. A Bakery lands between its Farm and the houses; a Sawmill beside its Forester;
   - homes: `link_weight` × distance to the nearest house;
   - courier buildings: minus `cover_weight` per building of its settlement its bots would newly reach; a spot that reaches none is skipped.
7. **Commits** a construction site through the [job board](/systems/logistics.md) with priority `1 + severity × urgency_priority` (see [site priority](/systems/production.md)) and records why on the building.

# Not thrashing

- One planned site open at a time, and a settle pause after it finishes.
- A choice must win `confirm_cycles` looks running before it is built.
- Capacity already on the way (sites, unstaffed workplaces) counts as relief.
- The planner never cancels or demolishes; it only adds.

# Player

The **Village plans** toggle in the HUD is on by default. Off, the planner stops and the player places everything; on, the player can still place buildings by hand alongside it. A line under the HUD says what the planner is doing ("Planning a Bakery: bread is running low"), and the inspector shows why each planned building was built.

# Limits

- It plans the goods economy, housing and, once known, [Courier Depots](/blueprints/depot.md). [Storage](/blueprints/storage.md) and [roads](/blueprints/road.md) relieve nothing it measures yet, so they stay with the player.
- Planks are counted island-wide when checking cost, so two settlements saving for a depot wait on the same pile.
- It never stops growing while land and food allow. Towns reach 20 villagers at 6 to 7.5 minutes; on five of the six swept seeds the buildable land within `search_radius` runs out between 24 and 30 minutes, at 82 to 100 villagers.

# Knowledge

The planner chooses only from what its settlement knows: see [knowledge](/systems/knowledge.md) for invention, proving, visitors and forgetting.

# Open questions

- What does the player still control: priorities, zoning, laws, or nudging discoveries?
- When should a town stop growing, and what should the planner do with spare planks then?
- How do new settlements split off, and what do they take with them? ([Phase 15](/roadmap.md))
- Which shortages need new goods (stone, tools, cloth) before the planner has interesting choices?

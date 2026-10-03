---
type: System
title: Village planner
description: Villagers sense shortages, choose what to build and where, and queue one site at a time, so the town grows on its own.
tags: [ai, planner, core]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T08:55:13Z }
tuning:
  interval_seconds: 3
  settle_seconds: 6
  confirm_cycles: 2
  min_severity: 0.15
  food_headroom: 1.3
  growth_beds: 3
  carrier_share: 0.2
  planks_per_villager_minute: 0.7
  input_cover: 0.6
  cost_weight: 0.01
  urgency_priority: 10
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

The code is `src/sim/planner.ts`. It names no building type: what a blueprint relieves is read from its recipe, `homes` and `harvest` fields, so a new blueprint joins in by being written.

# Loop

Every `interval_seconds` the planner:

1. **Waits** while its own site is open, then for `settle_seconds` after it finishes, so the new building shows up in the numbers before the next decision. Sites the player places do not block it.
2. **Senses** each shortage as a severity from 0 to 1:
   - *A good*: the rate it is made against the rate it is used. Producers count at the share their trees (`min_trees` grown trees in range for full rate) and inputs allow; sites count already. Bread is wanted for everyone housed plus everyone the free beds will bring, times `food_headroom`. Planks are wanted at `planks_per_villager_minute` per villager. Recipe inputs are wanted at what their consumers can use.
   - *Beds*: fewer than `growth_beds` free beds, halved while mood is below the newcomer threshold, and zero while bread is short: the village does not invite people it cannot feed.
   - *Hands*: a finished workplace with no worker and no free bed to bring one is a beds shortage at full severity.
3. **Proposes** for the worst shortage the blueprint with the best `severity × relief − cost_weight × cost`, where relief is the share of the gap it closes. Two follow-ups make chains work:
   - if the choice would idle for lack of an input (spare supply below `input_cover` of what it uses), plan that input's maker first: bread short and no wheat spare means a Farm before the Bakery;
   - if it needs a worker and fewer than one villager is spare after keeping `carrier_share` of the town hauling, wait for newcomers when beds are free, otherwise plan a House.
4. **Confirms**: the same blueprint must top `confirm_cycles` looks in a row.
5. **Checks the cost** against free supply, after every open site's outstanding need. If short and nothing makes the missing good, it plans that maker instead; otherwise it says what it is saving for.
6. **Places** it by scoring every spot within `search_radius` of the storage yard that leaves a `gap`-tile ring of open land (buildings never wall each other in) and can be walked to from storage. Lower is better:
   - `store_weight` × distance to storage, to keep the town compact;
   - harvesters: minus `tree_weight` × grown trees in range, trees already in another harvester's range at `shared_tree_weight`; spots under `min_trees` are skipped;
   - everything else: +1 per grown tree it would clear and `forest_penalty` inside a forester's ground;
   - `link_weight` × distance to the nearest maker of each input and the mean distance to the users of each output. A Bakery lands between its Farm and the houses; a Sawmill beside its Forester;
   - homes: `link_weight` × distance to the nearest house.
7. **Commits** a construction site through the [job board](/systems/logistics.md) with priority `1 + severity × urgency_priority` (see [site priority](/systems/production.md)) and records why on the building.

# Not thrashing

- One planned site open at a time, and a settle pause after it finishes.
- A choice must win `confirm_cycles` looks running before it is built.
- Capacity already on the way (sites, unstaffed workplaces) counts as relief.
- The planner never cancels or demolishes; it only adds.

# Player

The **Village plans** toggle in the HUD is on by default. Off, the planner stops and the player places everything; on, the player can still place buildings by hand alongside it. A line under the HUD says what the planner is doing ("Planning a Bakery: bread is running low"), and the inspector shows why each planned building was built.

# Limits

- It plans the goods economy and housing. The [Courier Depot](/blueprints/depot.md), [storage](/blueprints/storage.md) and [roads](/blueprints/road.md) relieve nothing it measures yet, so they stay with the player.
- It never stops growing while land and food allow. Towns reach 20 villagers at 6 to 7.5 minutes; on five of the six swept seeds the buildable land within `search_radius` runs out between 24 and 30 minutes, at 82 to 100 villagers.

# Knowledge

What the village knows is itself an OKF-style bundle: each blueprint carries who invented it, which settlements have verified it in use, and when it is forgotten if unused. That makes discovery, spreading between settlements and forgetting fall out of the same format as these design docs. See [decision 0001](/decisions/0001-okf-design-bundle.md). This is [Phase 5](/roadmap.md).

# Open questions

- What does the player still control: priorities, zoning, laws, or nudging discoveries?
- When should a town stop growing, and what should the planner do with spare planks then?
- How do new settlements split off, and what do they take with them?
- Which shortages need new goods (stone, tools, cloth) before the planner has interesting choices?

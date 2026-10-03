---
type: System
title: Village planner
description: Each settlement senses its shortages, chooses from what it knows what to build and where, and queues one site at a time, so towns grow on their own.
tags: [ai, planner, core]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T17:39:15Z }
tuning:
  interval_seconds: 3
  site_patience_seconds: 120
  build_goods: [planks]
  comfort_weight: 0.5
  deposit_weight: 0.3
  replan_min_age: 300
  district_buildings: 30
  district_spacing: 18
  district_room_weight: 0.05
  replan_every_seconds: 240
  salvage_share: 0.5
  village_at: 40
  town_at: 90
  row_weight: 1
  street_weight: 4
  street_every_rows: 3
  street_every_cols: 13
  street_radius: 10
  detour_ratio: 1.8
  detour_weight: 1
  bridge_reach_weight: 0.25
  bridge_min_gain: 40
  bridge_spacing: 10
  pave_wear: 25
  pave_per_look: 6
  wear_half_life_seconds: 600
  settle_seconds: 6
  confirm_cycles: 2
  min_severity: 0.15
  food_headroom: 1.3
  growth_beds: 3
  growth_weight: 0.7
  carrier_share: 0.4
  planks_per_villager_minute: 0.7
  input_cover: 0.6
  cost_weight: 0.01
  urgency_priority: 10
  crossing_weight: 1
  save_patience_seconds: 180
  no_room_retry_seconds: 120
  haul_weight: 3
  cover_weight: 0.5
  search_radius: 15
  search_radius_max: 40
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
   - *Crossing*: the neighbours are across water nobody can cross, times `crossing_weight`. Relieved by a blueprint with `shore` (the dock) while the settlement has none; the dock goes on a shore whose water reaches the nearest neighbour's land.
   - *Hauling*: the settlement's hauling pressure ([knowledge](/systems/knowledge.md)) times `haul_weight`. Relieved by a blueprint with `couriers`, in proportion to the share of the settlement's buildings no bots reach yet (ignored below `min_severity`).
   - *Hands*: a finished workplace with no worker and no free bed to bring one is a beds shortage at full severity.
3. **Proposes** for the worst shortage that something it knows can relieve (going down the list) the blueprint with the best `severity × relief − cost_weight × cost`, where relief is the share of the gap it closes. Two follow-ups make chains work:
   - if the choice would idle for lack of an input (spare supply below `input_cover` of what it uses), plan that input's maker first: bread short and no wheat spare means a Farm before the Bakery;
   - if it needs a worker and fewer than one villager is spare after keeping `carrier_share` of the town hauling, wait for newcomers when beds are free, otherwise plan a House. A carrier share of 0.4 is what the job board needs: at 0.2, small villages ran out of hands to haul and stalled (see the [log](/log.md)).
4. **Confirms**: the same blueprint must top `confirm_cycles` looks in a row.
5. **Checks the cost** against its own settlement's free supply, after its open sites' outstanding needs. If short, and nothing makes the missing good or the settlement has been short of it for more than `save_patience_seconds` (whatever it was saving for), it plans that good's maker instead; otherwise it says what it is saving for. What it is thinking about or saving for counts as use, so the settlement does not [forget](/systems/knowledge.md) it meanwhile.
6. **Places** it by scoring every spot within `search_radius` beyond the settlement's farthest building from the storage yard (at most `search_radius_max` from it) that leaves a `gap`-tile ring of open land (buildings never wall each other in) and can be walked to from storage. Lower is better:
   - `store_weight` × distance to storage, to keep the town compact;
   - harvesters: minus `tree_weight` × grown trees in range, trees already in another harvester's range at `shared_tree_weight`; spots under `min_trees` are skipped;
   - everything else: +1 per grown tree it would clear and `forest_penalty` inside a forester's ground;
   - `link_weight` × distance to the nearest maker of each input and the mean distance to the users of each output. A Bakery lands between its Farm and the houses; a Sawmill beside its Forester;
   - homes: `link_weight` × distance to the nearest house;
   - courier buildings: minus `cover_weight` per building of its settlement its bots would newly reach; a spot that reaches none is skipped.
   A spot is refused if building there would cut storage off from the door of any of the settlement's buildings, or from the tile in front of its own door: on a big landmass a farm was once sealed onto a patch of sand by the next building down. If no spot qualifies, it remembers that it found no room for that blueprint and, for `no_room_retry_seconds`, plans for its next shortage instead, so one building it cannot place (a dock with no suitable shore) never holds up the bread.
7. **Commits** a construction site through the [job board](/systems/logistics.md) with priority `1 + severity × urgency_priority` (see [site priority](/systems/production.md)) and records why on the building.

# Village to town

A settlement's form follows its people: a **hamlet** below `village_at`, a **village** from `village_at`, a **town** from `town_at`.

- **The ladder of homes.** For beds it plans the densest home its form allows: [Cottages](/blueprints/house.md) (0.75 beds a tile) in a hamlet, [Family Houses](/blueprints/family_house.md) (1) in a village, [Terraces](/blueprints/terrace.md) (1.5) in a town. A blueprint's `form` says which.
- **Rows.** In a village or town, homes need no ring of open land from other homes (a gap of 0; anything else keeps its ring), and score `row_weight` better for each tile of wall shared with another home, and `street_weight` better with their door onto a road.
- **Streets.** A town lays a street grid around each district centre once: rows every `street_every_rows` tiles (a terrace two tiles deep fits between, door on the street) and cross streets every `street_every_cols`, within `street_radius`, on open land only.
- **Replanning.** A town with free beds renews an old block at most every `replan_every_seconds`: it tears down homes of a sparser rung where its densest home would stand, as one block, and plans that home there. Every home covered must be finished and at least `replan_min_age` seconds in use, at least one of each kind must remain, the new home must add beds, and everyone living there must fit in free beds elsewhere. They move before anything comes down, so nobody leaves; `salvage_share` of the cost goes back into storage. The block that adds most beds nearest its district centre goes first.
- **Districts.** Each district has a storage yard at its heart. Once the newest district holds `district_buildings` buildings, a new district is founded: a storage yard on open land storage can walk to, about `district_spacing` from every other centre, where most grass lies around (`district_room_weight`). The settlement grows in its newest district: placement searches only there (`search_radius` beyond that district's farthest building), so planning cost follows district size, not town size. Paving covers every district.
- **Never wall anyone in.** Every placement, replanned block and district centre is refused if it would cut the settlement's first storage yard off from the door of any building it reaches today, of any settlement: two towns growing into each other once sealed a house of one inside a pocket made by the other's homes.

# The steward

The player steers each settlement's planner with levers (the Steward panel in the menu), and hand placement stays.

- **Priorities.** Each need (a good, homes for newcomers, hauling, reaching the neighbours, getting across water) has a weight on its severity: Low 0.5, Normal 1, High 2, First 4. A need put first is answered first: raising logs to First got the first forester planned 2 to 10 minutes sooner on six seeds ([Gate 10](/gates/10-steward.md)).
- **Encouragement.** One undiscovered blueprint can be encouraged: the settlement thinks of it at `encourage_threshold` of the usual strain and `encourage_factor` times as fast ([knowledge](/systems/knowledge.md)). Once thought of, the encouragement lapses.
- **Pace.** Unhurried, Normal or Brisk (0.5, 1, 2): divides how long the planner waits between looks and settles after a building.
- **Zones.** The player paints land from the build bar: homes, farms, workshops, or no building. A blueprint's `zone` (homes for any home) says which zone it keeps to. While a zone of its kind belongs to the settlement and has room, a building is placed only inside it, wherever in the settlement's reach it lies; with none, or none with room, it stays off other kinds' zones. Nothing is ever built, paved or laid out as a street on no-build land. A zoned tile belongs to the settlement whose first storage yard is nearest, so neighbours keep off each other's zones.
- **The chronicle** records each settlement's history as it happens: founded, its form, inventions, teachings and learning by hand, proving, forgetting, replanned blocks, new districts and bridges. It reads in the menu and exports as an OKF log (dated sections newest first; Creation, Update and Deprecation bullets; game minutes for dates).
- **The advisor** reads the planners and the chronicle and suggests a lever: bread first when a settlement goes hungry, encouraging the blueprint that would answer a need nobody knows how to meet, a zone when there is no room, keeping homes and workshops apart, and the latest page of history.

Overlays in the menu show how each home feels (surroundings, hunger), the reach of noise, districts, traffic and courier coverage.

# A deeper economy

- **Chains.** Goods beyond bread and planks come from chains several steps deep ([Quarry](/blueprints/quarry.md), [Mason](/blueprints/mason.md), [Clay Pit](/blueprints/clay_pit.md), [Brickworks](/blueprints/brickworks.md), [Mine](/blueprints/mine.md), [Smithy](/blueprints/smithy.md), [Fishery](/blueprints/fishery.md), [Flax Farm](/blueprints/flax_farm.md), [Weaver](/blueprints/weaver.md)). Only the `build_goods` (planks) are wanted as a steady flow; other materials are made when the planner saves for something that costs them, and comforts when homes want them.
- **Comforts.** From a village, homes want fish and cloth; in a town, tools; workplaces that use tools want them too ([needs](/systems/needs.md)). Their shortages count at `comfort_weight`, and not at all while bread is short or anyone goes hungry: food first.
- **Deposits.** A blueprint with a `deposit` is placed only within its radius of a deposit of that kind, the more the better (`deposit_weight` per tile).
- **Never waiting on the work it plans.** A home built to bring a worker is the densest the settlement can pay for today. A site starved for `site_patience_seconds` of a good nobody has no longer holds up the planner, and its beds no longer count as on the way.
- **Keep back for the maker.** Until something in the settlement makes a good, the planner keeps back enough of it to build the cheapest building that makes it: it never spends the last planks before a sawmill.
- **Food workers first.** A hungry settlement takes a worker off a workplace outside the food chain to staff one in it.
- **Follow what it can afford.** When a choice needs an input nobody makes, the planner plans that input's maker first, but only if it can pay for it today; otherwise it builds the maker of what it lacks.

# Seasons

With [seasons](/systems/seasons.md) on, the planner plans for winter all year:

- **Grain.** It wants a quarter more grain than the bakeries use, at `winter_headroom`, since three growing seasons must feed four. Before the frost it adds the gap: the winter's meals less the food already in store, over the time left.
- **Firewood.** Logs at the winter rate, one per villager every `firewood_every_seconds`.
- **Room for the store.** In summer and autumn it wants room for the winter's food at `winter_headroom`: a store's room is its capacity less the planks, logs and stone already in it, so a yard full of timber does not count as a granary.
- **Growth waits.** Homes for newcomers wait through autumn and winter, when nobody comes. In summer a newcomer comes only while the stores keep pace with the winter's meals for one more mouth (none at the start of summer, half by its end), and a settlement whose store has fallen behind moves workers to its food chain as a hungry one does.

# Desire paths

Every look, before anything else, a planner whose `roads` is on (the default) paves up to `pave_per_look` tiles around the settlement that feet have worn past `pave_wear`, most worn first. Roads end up where people really walk. [Gate 8](/gates/08-lie-of-the-land.md) plays a village with and without it: paved, deliveries were 20 to 32% faster per tile on six seeds.

# Bridges

Under the `detours` shortage (water keeps the village from grass close by, or trips go the long way round water; see [knowledge](/systems/knowledge.md)) the planner plans a [Bridge](/blueprints/bridge.md) once known. It looks at every straight run of open water up to `max_span` tiles from a bank storage can reach to land on the other side, and scores it: `bridge_reach_weight` per tile of grass within 12 of the far bank that the bridge would connect and nobody can reach today, plus the tiles it would save on recent long trips whose straight line passes it, less `store_weight` × its distance from storage. It builds the best span scoring at least `bridge_min_gain`, at least `bridge_spacing` from any other bridge. A settlement forgets the long trips it recorded when one of its bridges is finished.

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
- It never stops growing while land and food allow. The search widens as the village spreads, up to `search_radius_max`; past that a village needs a second centre, which is [roadmap](/roadmap.md) Phase 9.

# Knowledge

The planner chooses only from what its settlement knows: see [knowledge](/systems/knowledge.md) for invention, proving, visitors and forgetting.

# Open questions

- What does the player still control: priorities, zoning, laws, or nudging discoveries?
- When should a town stop growing, and what should the planner do with spare planks then?
- How do new settlements split off, and what do they take with them? ([Phase 17](/roadmap.md))
- Which shortages need new goods (stone, tools, cloth) before the planner has interesting choices?

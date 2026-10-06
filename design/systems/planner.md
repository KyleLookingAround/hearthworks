---
type: System
title: Village planner
description: Each settlement senses its shortages, chooses from what it knows what to build and where, and queues one site at a time, so towns grow on their own.
tags: [ai, planner, core]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-06T12:00:00Z }
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
  renew_every_seconds: 180
  idle_seconds: 600
  keep_cover: 1.25
  centre_radius: 6
  move_max_size: 0
  yard_weight: 0
  packed_homes: 6
  salvage_share: 0.5
  clear_reach: 3
  clear_tries: 6
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
  hall_weight: 0.3
  hall_sites: 1
  hall_master_sites: 1
  mill_weight: 0.3
  mill_min: 2
  food_headroom: 1.3
  newcomer_food_share: 0.85
  growth_beds: 3
  store_full_share: 0.9
  villagers_per_cart_shed: 12
  villagers_per_ox_barn: 40
  growth_weight: 0.7
  carrier_share: 0.4
  planks_per_villager_minute: 0.7
  input_cover: 0.6
  spoil_full_per_minute: 10
  spoil_weight: 0.5
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
  detour_min_tiles: 6
  detour_memory_seconds: 300
  detour_memory_trips: 15
  bridge_reach_tiles: 12
  bridge_trip_tiles: 2.5
  wear_floor: 0.05
  district_spacing_min: 0.8
  district_spacing_max: 1.4
  district_room_tiles: 8
  district_tries: 8
  site_tries: 24
  open_store_capacity: 300
  shared_tree_yield: 0.5
  replan_hub_weight: 0.05
  move_out_hub_weight: 0.01
  winter_gap_min_seconds: 60
  low_mood_growth: 0.5
  saving_want: 0.5
  road_weight: 0.6
  belt_weight: 0.6
  district_weight: 1
  replan_weight: 0.5
  move_out_weight: 0.7
  wish_list_size: 12
---

# Goal

The player stops placing buildings. The village notices a shortage, chooses a [blueprint](/blueprints/) that solves it from what it knows, picks a site and builds it. See the [vision](/vision.md). [Gate 4](/gates/04-village-plans.md) holds it to [Gate 2's](/gates/02-sustain-town.md) scripted result.

The code is `src/sim/planner.ts`. It names no building type: what a blueprint relieves is read from its recipe, `homes`, `harvest` and `couriers` fields, so a new blueprint joins in by being written.

Every settlement has its own planner. It looks only at its own people and buildings, builds around its own storage yard, and only proposes blueprints its settlement [knows](/systems/knowledge.md).

# The wish list

Each look leaves one scored list, kept on the settlement (`wishes`, at most `wish_list_size`): every need it sees, how badly (its severity, after the [steward's](#the-steward) priorities), the building that answers it, and a verdict:

- **going ahead**: its site is planned (or its road laid);
- **thinking about it**: it tops the list, not yet for `confirm_cycles` looks in a row;
- **saving**: it cannot pay yet ("Bakery: saving planks, 6 of 10"), and it holds back the needs below it;
- **waiting for hands**, **waiting for an input**, **trading for it**: it cannot go ahead now, and the next need may;
- **no room**: nowhere to put it, lately (`no_room_retry_seconds`);
- **waits its turn**: below the one going ahead or saved for;
- **nothing known would help**, and **not pressing** (below `min_severity`).

The works that once went before every need are wishes on the same list, each at its own weight, confirmed and paid for like any building, and food comes first for all of them (while food is short, every need of the food chain goes before every work; worth nothing while it was short, they were put off a third of the time and a world lost twelve villagers): a **road** (`road_weight`) and a **conveyor** (`belt_weight`), laid from the stores with no site, so they may go ahead while the settlement's sites are all taken; a **new district** (`district_weight`, its yard where `districtSpot` finds room, else "no room"); a **replanned block** (`replan_weight`, the densest home paid for before anything comes down); and a **workplace moved out of a centre** (`move_out_weight`). On a tie a work goes first. Pulling down what no longer pays costs nothing and is not a wish: it is done, and the look goes on.

The status line is the list's top entry: the wish that decided the look (the one going ahead, thought about or saved for; else what holds the rest back: hands or an input, then no room, then trade, then nothing known), written once a look. Nothing else writes it. Other systems read the verdicts: [settling](/systems/settling.md) counts a settlement crowded once a "no room" verdict for something it needs (not a university, a bridge or a district) has stood on its list for `crowded_hold_seconds`, and the [advisor](/systems/advisor.md) reads what nothing answers and what has no room from the list. The player reads the top of the list on the settlement card and in the Steward panel.

Each need has a key of its own, so each priority and each first plan has its own target: `hauling` (couriers), `carts` and `oxen`; `library`, `school`, `university` and `press`; `stores_full` (room wanted to bring the stores back under `store_full_share`, which any store answers) and `winter_store` (room for the winter's grain, which a store that keeps wheat answers). A save of version 33 or earlier carries an old key's priority and first plan over to each new one.

A blueprint it lately found no room for gives way to the next best that answers the same need: a [Warehouse](/blueprints/warehouse.md), denser, where a yard has no room.

# Loop

Every `interval_seconds` the planner:

1. **Waits** while its own site is open, then for `settle_seconds` after it finishes, so the new building shows up in the numbers before the next decision. Sites the player places do not block it.
2. **Senses** each shortage as a severity from 0 to 1:
   - *A good*: the rate it is made against the rate it is used. Producers count at the share their trees (`min_trees` grown trees in range for full rate, trees in another harvester's range at `shared_tree_yield`) and inputs allow; sites count already. Bread is wanted for everyone housed plus everyone the free beds will bring, times `food_headroom`. Planks are wanted at `planks_per_villager_minute` per villager. Recipe inputs are wanted at what their consumers can use.
   - *Beds*: fewer than `growth_beds` free beds, times `low_mood_growth` while mood is below the newcomer threshold, and zero while bread is short: the village does not invite people it cannot feed. Growth is a want, not a need, so this is scaled by `growth_weight`.
   - *Crossing*: the neighbours are across water nobody can cross, times `crossing_weight`. Relieved by a blueprint with `shore` (the dock) while the settlement has none; the dock goes on a shore whose water reaches the nearest neighbour's land, looked for around every district, newest first, and it may stand on and beside worn paths. A settlement with no such shore left clears one: of its finished workshops within `clear_reach` tiles of water (never a home, a storage yard, a workplace of the food chain, a bridge, a place of rites or of learning), the cheapest of the first `clear_tries` whose ground would take the dock comes down, its carriers' jobs cancelled and `salvage_share` of its cost back in storage, and the chronicle says so.
   - *Hauling*: the settlement's hauling pressure ([knowledge](/systems/knowledge.md)) times `haul_weight`. Relieved by a blueprint with `couriers`, in proportion to the share of the settlement's buildings no bots reach yet (ignored below `min_severity`).
   - *Hands*: a finished workplace with no worker and no free bed to bring one is a beds shortage at full severity, except while bread is short (newcomers would not come). A workplace resting (fields in winter, or with [enough in store](/systems/production.md)) needs no hands, and its worker counts as a spare one.
3. **Proposes** for the worst shortage that something it knows can relieve (going down the list) the blueprint with the best `severity × relief − cost_weight × cost`, where relief is the share of the gap it closes. Two follow-ups make chains work:
   - if the choice would idle for lack of an input (spare supply below `input_cover` of what it uses), plan that input's maker first: bread short and no wheat spare means a Farm before the Bakery;
   - if it needs a worker and fewer than one villager is spare after keeping `carrier_share` of the grown villagers hauling, wait for newcomers when beds are free, otherwise plan a House. A carrier share of 0.4 is what the job board needs: at 0.2, small villages ran out of hands to haul and stalled (see the [log](/log.md)). Newcomers are only waited for while they would come: mood at the newcomer threshold, and with seasons on, spring or summer (in summer while the winter store keeps pace) with its bakeries making at least `newcomer_food_share` of what its people and one more eat (stores hide a shortfall until the winter; without seasons it shows at once as hunger, which keeps newcomers away by itself). While they would not, a workplace of the food chain is built anyway when the settlement is short of food or anyone goes hungry, and so is one making another of the basics (building materials and firewood), and a hand moves to it from carrying or from outside the chain: the basics do not wait on newcomers who are not coming (a village growing by births alone held a forester waiting for them for half an hour).
   - with no maker to plan for that input (none known, or no room for one lately), a workplace still goes ahead with the stock there is, unless the workplaces already using the input stand short of it (made and imported below what they use): then it waits, "Trading with Brook for iron ore before a Smithy" when a neighbour can spare some, else "No iron ore to spare". The same holds for a maker planned to pay for something it saves for. A town with no room for a mine once built eight smithies that stood needing iron ore, and another seven masons with no stone;
   - a choice that waits for hands does not hold back the needs after it: the planner goes down the list to the next it can act on, and says what it waits for only when nothing can go ahead. A town waiting for a miner for its five smithies left its bread short by half.
4. **Confirms**: the same blueprint must top `confirm_cycles` looks in a row.
5. **Checks the cost** against its own settlement's free supply, after its open sites' outstanding needs. If short, and nothing makes the missing good or the settlement has been short of it for more than `save_patience_seconds` (whatever it was saving for), it plans that good's maker instead; otherwise it says what it is saving for, and wants that good at least `saving_want` (for its porters to trade for; with people on, no children are born while a good of its food chain is wanted that badly). What it is thinking about or saving for counts as use, so the settlement does not [forget](/systems/knowledge.md) it meanwhile.
6. **Places** it by scoring every spot within `search_radius` beyond the settlement's farthest building from the storage yard (at most `search_radius_max` from it) that leaves a `gap`-tile ring of open land (buildings never wall each other in; the ring may be a planned [road](/systems/roads.md), never a path, except beside a dock) and can be walked to from storage. Lower is better:
   - `store_weight` × distance to storage, to keep the town compact;
   - harvesters: minus `tree_weight` × grown trees in range, trees already in another harvester's range at `shared_tree_weight`; spots under `min_trees` are skipped;
   - everything else: +1 per grown tree it would clear and `forest_penalty` inside a forester's ground;
   - `link_weight` × distance to the nearest maker of each input and the mean distance to the users of each output. A Bakery lands between its Farm and the houses; a Sawmill beside its Forester;
   - homes: `link_weight` × distance to the nearest house;
   - yards (a granary, a warehouse or another storage yard, not a district's heart): `yard_weight` × the mean distance to the makers of what they keep (of anything, for a yard that takes anything). It is 0: yards beside their makers cost default games a seventh of their trade and a few people ([log](/log.md), 2026-10-05), so a yard goes where any building would, near its district's heart and, when moved, beyond every centre;
   - courier buildings: minus `cover_weight` per building of its settlement its bots would newly reach; a spot that reaches none is skipped.
   A spot is refused if building there would cut storage off from the door of any of the settlement's buildings, or from the tile in front of its own door: on a big landmass a farm was once sealed onto a patch of sand by the next building down. It path-checks the best `site_tries` spots in turn before it says so. If no spot qualifies, it remembers that it found no room for that blueprint and, for `no_room_retry_seconds`, plans for its next shortage instead, so one building it cannot place (a dock with no suitable shore) never holds up the bread.
7. **Commits** a construction site through the [job board](/systems/logistics.md) with priority `1 + severity × urgency_priority` (see [site priority](/systems/production.md)) and records why on the building.

# Village to town

A settlement's form follows its people: a **hamlet** below `village_at`, a **village** from `village_at`, a **town** from `town_at`.

- **The ladder of homes.** For beds it plans the densest home its form allows: [Cottages](/blueprints/house.md) (0.75 beds a tile) in a hamlet, [Family Houses](/blueprints/family_house.md) (1) in a village, [Terraces](/blueprints/terrace.md) (1.5) in a town. A blueprint's `form` says which.
- **Rows.** In a village or town, homes need no ring of open land from other homes (a gap of 0; anything else keeps its ring), and score `row_weight` better for each tile of wall shared with another home, and `street_weight` better with their door onto a road.
- **Streets.** A town lays a street grid around each district centre once: rows every `street_every_rows` tiles (a terrace two tiles deep fits between, door on the street) and cross streets every `street_every_cols`, within `street_radius`, on open land only.
- **Replanning.** A village or town with free beds renews an old block at most every `replan_every_seconds`: it tears down homes of a sparser rung where its densest home would stand, as one block, and plans that home there (cottages make way for family houses in a village, for terraces in a town). Every home covered must be finished and at least `replan_min_age` seconds in use, at least one of each kind must remain, the new home must add beds, and everyone living there must fit in free beds elsewhere. They move before anything comes down, so nobody leaves; `salvage_share` of the cost goes back into storage. The block that adds most beds nearest its district centre goes first (`replan_hub_weight` a bed per tile from it).
- **Renewal.** At most every `renew_every_seconds` a settlement looks over what its planner has built (never what the player or the founders placed, a paused building, a yard at a district's heart, a home, or a building that answers a need of its own rather than a good: bridges, docks, places of rites and learning, the hall, counters, depots, sheds, barns, mills, shipyards) and does one of two things:
  - *Selective.* A workplace that no longer pays comes down: one that has stood `idle_seconds` without work (no worker, nothing to work with, or resting with enough in store; fields resting through winter and young orchards do not count), or, in a town, one taking up a district centre (the town has outgrown it), while the settlement's other makers of everything it makes cover `keep_cover` times what is wanted of it and none of it is short or saved for. Never the last of its kind. Carriers' jobs to and from it are cancelled; what it held and `salvage_share` of its cost go into the nearest storage yard; its workers go back to carrying. The one idle longest goes first.
  - *Denser.* In a village or town that wants homes and is fed, a workplace that needs land or makes noise (a farm, garden or pasture not grown past `move_max_size`, a forester, a sawmill or another nuisance) or a yard that is not a district's heart, standing within `centre_radius` of a district centre, moves out. A new one is planned where the planner would put one today, beyond every centre (farms and foresters out where their land is, a yard in the newest district), and the old one keeps working until the new one is finished, then comes down as above. The largest goes first, then the nearest its centre (`move_out_hub_weight` a tile per tile from it).
  - *Homes take the centre.* In a village or town, a home is placed first on open land within `centre_radius` of a district centre, oldest district first (rows and streets score as ever), and only elsewhere when no centre has room. Land freed in the centre becomes homes in rows.
  - The chronicle says what came down or moved and why; the inspector says when a workplace has stood idle and may come down, and which building is being moved and what takes over from it; the advisor names what was lately pulled down or moved, and warns when `packed_homes` or more homes stand in the centres with nothing to fight a fire.
- **Districts.** Each district has a storage yard at its heart. Once the newest district holds `district_buildings` buildings, a new district is founded: a storage yard on open land storage can walk to, about `district_spacing` from every other centre (from `district_spacing_min` to `district_spacing_max` times it), where most grass lies within `district_room_tiles` around (`district_room_weight`); of the best `district_tries` spots, the first that walls nothing off. The settlement grows in its newest district: placement searches only there (`search_radius` beyond that district's farthest building), so planning cost follows district size, not town size. Paving covers every district.
- **Never wall anyone in.** Every placement, replanned block and district centre is refused if it would cut the settlement's first storage yard off from the door of any building it reaches today, of any settlement: two towns growing into each other once sealed a house of one inside a pocket made by the other's homes.

# The steward

The player steers each settlement's planner with levers (the Steward panel in the menu), and hand placement stays.

- **Priorities.** Each need (a good, homes for newcomers, hauling, reaching the neighbours, getting across water) has a weight on its severity: Low 0.5, Normal 1, High 2, First 4. A need put first is answered first: raising logs to First got the first forester planned 2 to 10 minutes sooner on six seeds ([Gate 10](/gates/10-steward.md)).
- **Encouragement.** One undiscovered blueprint can be encouraged: the settlement thinks of it at `encourage_threshold` of the usual strain and `encourage_factor` times as fast ([knowledge](/systems/knowledge.md)). Once thought of, the encouragement lapses.
- **Pace.** Unhurried, Normal or Brisk (0.5, 1, 2): divides how long the planner waits between looks and settles after a building.
- **Zones.** The player paints land from the build bar: homes, farms, workshops, or no building. A blueprint's `zone` (homes for any home) says which zone it keeps to. While a zone of its kind belongs to the settlement and has room, a building is placed only inside it, wherever in the settlement's reach it lies; with none, or none with room, it stays off other kinds' zones. Nothing is ever built, paved or laid out as a street on no-build land. A zoned tile belongs to the settlement whose first storage yard is nearest, so neighbours keep off each other's zones.
- **The chronicle** records each settlement's history as it happens: founded, its form, inventions, teachings and learning by hand, proving, forgetting, replanned blocks, new districts and bridges. It reads in the menu and exports as an OKF log (dated sections newest first; Creation, Update and Deprecation bullets; game minutes for dates).
- **The advisor** ([advisor](/systems/advisor.md)) reads the planners and the settlements and ranks what the player could do: bread first when a settlement's fed share falls below `advise_hungry_below` ([needs](/systems/needs.md)), encouraging the blueprint that would answer a need nobody knows how to meet, a zone when there is no room and land to zone, the Cart Shed or Ox Barn when deliveries run long and neither is known, wheat when the oxen wait for feed, a garden, orchard or pasture when a settlement of `advise_diet_homes` homes or more eats nothing but bread (with [farms that grow](/systems/farms.md)), and keeping homes and workshops apart. It offers the lever or law that answers a tip, gives only advice the player can act on, and does not repeat itself while nothing has changed. Raiders count only from camps the settlement does not send bread to, as those never raid it.

Overlays in the menu show how each home feels (surroundings, hunger), the reach of noise, districts, traffic, how far bots and carts reach, and what protects the homes (each counter's reach in the colour of its hazard, a bathhouse's, and how far raiders range from camps not at peace).

# A deeper economy

- **Chains.** Goods beyond bread and planks come from chains several steps deep ([Quarry](/blueprints/quarry.md), [Mason](/blueprints/mason.md), [Clay Pit](/blueprints/clay_pit.md), [Brickworks](/blueprints/brickworks.md), [Mine](/blueprints/mine.md), [Smithy](/blueprints/smithy.md), [Fishery](/blueprints/fishery.md), [Flax Farm](/blueprints/flax_farm.md), [Weaver](/blueprints/weaver.md)). Only the `build_goods` (planks) are wanted as a steady flow; other materials are made when the planner saves for something that costs them, and comforts when homes want them.
- **Comforts.** From a village, homes want fish and cloth; in a town, tools; workplaces that use tools want them too ([needs](/systems/needs.md)). Their shortages count at `comfort_weight`, and not at all while bread is short or anyone goes hungry: food first. So do the goods outside the basics (the food chain, the `build_goods` and, with seasons, firewood, with what goes into them: iron ore for a smithy waits too). Bread is short while the bakeries make less than everyone's bare need (the bread wanted, less `food_headroom`) or, with seasons on, while the winter store has fallen behind: a growing town always plans a little more bread than it eats, and measured against the headroom a town of 140 kept bread short for good and never built a second smithy.
- **Deposits.** A blueprint with a `deposit` is placed only within its radius of a deposit of that kind, the more the better (`deposit_weight` per tile).
- **Never waiting on the work it plans.** A home built to bring a worker is the densest the settlement can pay for today. A site starved for `site_patience_seconds` of a good nobody has no longer holds up the planner, and its beds no longer count as on the way.
- **Keep back for the maker.** Until something in the settlement makes a good, the planner keeps back enough of it to build the cheapest building that makes it: it never spends the last planks before a sawmill.
- **Food workers first.** A hungry settlement takes a worker off a workplace outside the food chain to staff one in it.
- **Follow what it can afford.** When a choice needs an input nobody makes, the planner plans that input's maker first, but only if it can pay for it today; otherwise it builds the maker of what it lacks.

# Carts

With carts on and the [Cart Shed](/blueprints/cart_shed.md) known, a settlement whose deliveries run long (the need `distance`) wants a shed for every `villagers_per_cart_shed` villagers, placed in its newest district like any building. Knowing the [Ox Barn](/blueprints/ox_barn.md), one whose deliveries run longer still (the need `long_hauls`) wants a barn for every `villagers_per_ox_barn`.

# Spoiling food

Food rotting in stores that do not keep it ([spoiling](/systems/logistics.md)) is a need, `spoilage`: what the piles would lose a minute, a full need at `spoil_full_per_minute`, times `spoil_weight`, less the share of the rotting pile that stores keeping food (standing, or sites) have room for, since the food goes there as it comes and what lies in the yards is eaten first. A store that keeps the goods that rot relieves it by the share of the loss it keeps, as does a workplace that turns them into food that keeps (a [Smokehouse](/blueprints/smokehouse.md) for fish), so a settlement losing bread builds a [Granary](/blueprints/granary.md) and one losing only fish the cheaper smokehouse. Rot is waste, not want: no maker is planned for its store (a village out of land once filled it with masons cutting stone for a granary, then had no room for a bakery): it saves for one only from what it already makes or trades for.

# Full stores

When a settlement's stores (those that take anything) hold `store_full_share` of their room, it wants another (a store with no `capacity` counts as holding `open_store_capacity`): workshops stall with nowhere to put their goods. In every game, not only with seasons.

# People

With [people](/systems/people.md) on, the dead waiting with no place for the settlement's custom make it plan one (a graveyard, another when that is full, a pyre, a dock), and a settlement short of what a workplace makes moves a worker onto it, as a hungry one does for its food chain.

# Roads

With planned [roads](/systems/roads.md) on, a village or town that knows the [Road](/blueprints/road.md) lays one now and then as a long straight strip where its people walk most, cutting through what stands (people moved first, salvaged as replanning is); desire paths keep being paved as [paths](/blueprints/path.md). Once roads are laid, a spot whose door opens onto one scores `front_weight` better, and one looking down a short run to one `near_weight`.

# Hardship

With [hardship](/systems/hardship.md) on, a settlement struck by a hazard within `memory_seconds` that knows a counter for it wants one while anything the hazard threatens stands unguarded: severity `guard_weight` times the unguarded share, zero while bread is short (food first, as for comforts). It sites the counter where it guards the most unguarded buildings at risk, as it sites a depot where its bots reach the most. Each hazard is also a priority in the Steward panel.

# Planners as people

The planner is a villager. With [people](/systems/people.md) on, a village wants a [Town Hall](/blueprints/town_hall.md) at `hall_weight`, and its planner works there like any worker, learning the trade with practice. Without a hall, or while its planner is away from the desk, a settlement plans one building of its own at a time, waiting for each site to finish (step 1 of the loop). With the planner at work it plans on while fewer than `1 + hall_sites` of its own sites are open, and `hall_master_sites` more once the planner's skill reaches `expert_at`. Sites the player places never count. On a roomy world (Landmass L, one settlement, people, seasons and farms on, an hour; seeds 1847, 7 and 42) a hall brought 90, 110 and 133 villagers against 84, 96 and 100, fed as well; on the Islands, where land runs out first, it made no difference ([log](/log.md), 2026-10-05).

# Learning

With people on, the planner wants a [Library](/blueprints/library.md) while it holds knowledge beyond its founders', a [School](/blueprints/school.md) once it has `school_children` children, a [University](/blueprints/university.md) as a village of `university_villagers` that keeps a library, while everyone is fed, its winter store is on track and its stores hold `university_spare` times the university's cost (it waits for spare stores rather than saving, and never opens a quarry for one), or as any town, that knows of one, and a [Printing House](/blueprints/printing_house.md) as a village or town that knows one and keeps a library, each at `learning_weight` ([knowledge](/systems/knowledge.md)). A university is wanted, not needed: with no room for one the planner clears a workshop resting with enough in store (as a dock clears the shore), but only once the university is chosen, confirmed and paid for (before that it only asks whether one could be cleared, and nothing comes down), and if there is none it goes on to its next need in the same look, without saying its land is full (which would send settlers off). Universities were wanted in towns alone until the second pass: on the twelve default new games none was built within the hour, so no settlement ever thought of an idea only scholars find ([log](/log.md), 2026-10-05).

A settlement that knows a mill (the [Windmill](/blueprints/windmill.md) for its bakeries, the [Seed Garden](/blueprints/seed_garden.md) for its farms, gardens and orchards) wants that mill, at `mill_weight`, where `mill_min` of the workplaces it serves stand with none of it in reach, and sites it where it reaches the most of them.

# Trade

With [trade](/systems/trade.md) on, a settlement's steady imports count as supply, so it stops planning what it reliably trades for; a neighbour's want of a good that neighbour makes none of counts as demand here, at `export_demand` (and at least what its porters carry away when it trades for the good here). A good outside the basics that a neighbour makes and this settlement does not is traded for, not made, while the imports come ([specialisation](/systems/trade.md)): the planner passes over that shortage, saying who it trades with, and goes on to the next. At each look the planner notes its `wants` (shortages of goods and what it is saving for) and `use` (what it uses of each good a second), which its porters trade by.

# Farms that grow

With [farms that grow](/systems/farms.md) on, the planner wants `diet_share` of its people's meals from the foods of the diet (vegetables, fruit, milk and meat, an equal part each, at `diet_weight` against bread) and bread for the rest and for what it does not grow; a grown workplace counts as many cycles as it has places. When it chooses a farm, garden, orchard or pasture and one of that kind can grow, it lays new fields behind that one (the most grown first) instead of building another; it places new ones where there is open land behind them to grow into. An orchard with no fertile land in reach does not stop newcomers, as a farm with no room does.

# Seasons

With [seasons](/systems/seasons.md) on, the planner plans for winter all year:

- **Grain.** It wants a quarter more grain than the bakeries use, at `winter_headroom`, since three growing seasons must feed four. Before the frost it adds the gap: the winter's meals less the food already in store, over the time left (at least `winter_gap_min_seconds`).
- **Firewood.** Logs at the winter rate, one per villager every `firewood_every_seconds`.
- **Room for the store.** In summer and autumn it wants room for the winter's food at `winter_headroom`: a store's room is its capacity less the planks, logs and stone already in it, so a yard full of timber does not count as a granary.
- **Growth waits.** Homes for newcomers wait through autumn and winter, when nobody comes. In summer a newcomer comes only while the stores keep pace with the winter's meals and `winter_headroom` for one more mouth (none at the start of summer, half by its end), and a settlement whose store has fallen behind moves workers to its food chain as a hungry one does.

# Desire paths

Every look, before anything else, a planner whose `roads` is on (the default) paves up to `pave_per_look` tiles around the settlement that feet have worn past `pave_wear`, most worn first. Wear halves every `wear_half_life_seconds` that nobody walks a tile, and is gone below `wear_floor`. Roads end up where people really walk. [Gate 8](/gates/08-lie-of-the-land.md) plays a village with and without it: paved, deliveries were 20 to 32% faster per tile on six seeds.

# Bridges

Under the `detours` shortage (water keeps the village from grass close by, or trips go the long way round water; see [knowledge](/systems/knowledge.md)) the planner plans a [Bridge](/blueprints/bridge.md) once known. It looks at every straight run of open water up to `max_span` tiles from a bank storage can reach to land on the other side, and scores it: `bridge_reach_weight` per tile of grass within `bridge_reach_tiles` of the far bank that the bridge would connect and nobody can reach today, plus the tiles it would save on long trips of the last `detour_memory_seconds` whose straight line passes within `bridge_trip_tiles` of it, less `store_weight` × its distance from storage. It builds the best span scoring at least `bridge_min_gain`, at least `bridge_spacing` from any other bridge. A settlement forgets the long trips it recorded when one of its bridges is finished.

# Not thrashing

- One planned site open at a time, and a settle pause after it finishes.
- A choice must win `confirm_cycles` looks running before it is built.
- Capacity already on the way (sites, unstaffed workplaces) counts as relief.
- The planner never cancels a site, and demolishes only to renew a block of homes, to pull down a workplace that no longer pays or one it has moved out of a centre, to lay a road, or to clear a shore for its first dock or room for a university it has chosen and paid for.
- What it pulls down must be covered by the rest with `keep_cover` to spare, so it does not build the same again at its next look; renewal acts at most once every `renew_every_seconds`.

# Player

The **Village plans** toggle in the HUD is on by default. Off, the planner stops and the player places everything; on, the player can still place buildings by hand alongside it. The plan line under the HUD says what each settlement's planner is doing ("Planning a Bakery: bread is running low"), a line each (three at a time, taking turns when there are more; tap to see all), and the inspector shows why each planned building was built.

The settlement is the unit of the interface. A settlement's name (in the plan line, on the map, or chosen in the menu) opens its **card**: its form and age, fed and mood, villagers and free beds, hands at work against carriers and how many carriers stand idle, the planner's status (what stands in the way), what it works towards and the goods it was short of at its last look (`wants`), its open sites, its top trades, its own stores, and its buildings held up, grouped by cause with a jump to each. The goods bar and the counts beside it show the chosen settlement's stores, or every settlement's together. Badges on buildings tell their cause apart by colour and mark: needs an input, output full, no worker, a home in want, trouble (fire, flood, sickness, no way in), and resting. A workplace whose worker went carrying because its settlement holds enough of what it makes reads "Resting: enough in store", not "No worker free": nobody is sent to it.

# Limits

- It plans the goods economy, housing and, once known, [Courier Depots](/blueprints/depot.md) and [conveyors](/systems/conveyors.md) (laid along its lanes from a storage yard's door, like a road at a look of its own). [Storage](/blueprints/storage.md) and [roads](/blueprints/road.md) relieve nothing it measures yet, so they stay with the player.
- Planks are counted island-wide when checking cost, so two settlements saving for a depot wait on the same pile.
- It never stops growing while land and food allow. The search widens as the village spreads, up to `search_radius_max`; past that a village needs a second centre, which is [roadmap](/roadmap.md) Phase 9.

# Knowledge

The planner chooses only from what its settlement knows: see [knowledge](/systems/knowledge.md) for invention, proving, visitors and forgetting.

# Open questions

- What does the player still control: priorities, zoning, laws, or nudging discoveries?
- When should a town stop growing, and what should the planner do with spare planks then?
- How do new settlements split off, and what do they take with them? ([Phase 17](/roadmap.md))
- Which shortages need new goods (stone, tools, cloth) before the planner has interesting choices?

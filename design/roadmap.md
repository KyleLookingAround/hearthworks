---
type: Roadmap
title: Roadmap
description: Phases from the player-placed prototype to a self-building, island-hopping civilisation, each closed by a headless gate.
tags: [roadmap]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-05T01:35:58Z }
---

# How to read this

Each phase adds one coherent layer and closes when its gate passes in CI. Gates are [Attested Computations](/gates/): a sanctioned scenario runs headless, and deterministic code checks the receipt. For future phases, the gate, its metrics and its thresholds are **proposals**: they are fixed when the gate is written, and Kyle can overrule any of them. Gates can be reworked as the game grows, under [decision 0004](/decisions/0004-reworking-gates.md).

Every phase section says why it comes when it does, what it builds, its gate, which existing gates it will disturb, and what is still Kyle's call.

# Phases

| # | Phase | Adds | Needs | Gate (proposed) | State |
| --- | --- | --- | --- | --- | --- |
| 1 | Toy economy | Grid, building, wood chain carried by hand | | [Gate 1](/gates/01-first-plank.md) | Done |
| 2 | Living town | Houses, needs, bread chain, newcomers and departures | 1 | [Gate 2](/gates/02-sustain-town.md) | Done |
| 3 | First automation | Courier bots on the same job board | 2 | [Gate 3](/gates/03-couriers.md) | Done |
| 4 | The village plans | [Planner](/systems/planner.md) chooses and places buildings | 2 | [Gate 4](/gates/04-village-plans.md) | Done |
| 5 | Knowledge | [Knowledge](/systems/knowledge.md): invented, proven, shared, forgotten; two settlements | 4 | [Gate 5](/gates/05-knowledge-spreads.md) | Done |
| 6 | Solid ground | Solid buildings with doors, mood and supply per settlement, versioned saves, work counters | 5 | [Gate 6](/gates/06-solid-ground.md) | Done |
| 7 | Worlds | Map types (island, landmass, coast) and sizes the player picks, one standard map for tests, a sim and renderer that scale | 6 | [Gate 7](/gates/07-worlds.md) | Done |
| 8 | The lie of the land | Terrain, rivers, deposits, bridges, desire-path roads, surroundings in mood | 7 | [Gate 8](/gates/08-lie-of-the-land.md) | Done |
| 9 | Village to town | Form by size, streets, a ladder of home sizes, replanning, town and district planners | 8 | [Gate 9](/gates/09-village-to-town.md) | Done |
| 10 | The steward | Player levers through the town planner, overlays, a chronicle | 9 | [Gate 10](/gates/10-steward.md) | Done |
| 11 | A deeper economy | Stone, clay, tools, fish, cloth; multi-input recipes; home tiers by goods; storage | 9 | [Gate 11](/gates/11-deeper-economy.md) | Done |
| 12 | Seasons | A year: growing seasons, winter, warmth, storing food | 11 | [Gate 12](/gates/12-seasons.md) | Done |
| 13 | Neighbours trade | Settlements swap surplus for want, on foot at first; specialisation | 11 | [Gate 13](/gates/13-trade.md) | Done |
| 14 | People and traditions | Individuals: families, births, ageing, skills, apprenticeships; death and each village's own customs for it | 12 | [Gate 14](/gates/14-people.md) | Done |
| 15 | Learning | Libraries, schools, universities; knowledge kept, taught and pursued | 14 | [Gate 15](/gates/15-learning.md) | Done |
| 16 | Ways to move | Carts, river boats, hubs, multi-leg deliveries | 8, 13 | [Gate 16](/gates/16-ways-to-move.md) | Done |
| 17 | New settlements | Crowded towns send settlers off with goods, knowledge and customs | 16 | [Gate 17](/gates/17-new-settlements.md) | Done |
| 18 | The sea | The archipelago map type, ports, ships, exploration, colonies | 13, 17 | [Gate 18](/gates/18-the-sea.md) | Done |
| 19 | Ages | Eras of technology, machine tiers, crafts lost | 15, 18 | [Gate 19](/gates/19-ages.md) | Done |
| 20 | Hardship | Fire, flood, sickness, barbarians and their counters; hard laws | 12, 17, 19 | [Gate 20](/gates/20-hardship.md) | Done |
| 21 | Paths and roads | Worn paths become paths; roads are planned as long straight strips, cut through what stands, and the town is planned around them | 9, 16 | [Gate 21](/gates/21-paths-and-roads.md) | Done |
| 22 | Farms that grow | Farms expand their fields, take on more hands and yield more; crops and herds give different foods | 11, 12, 14 | [Gate 22](/gates/22-farms-that-grow.md) | Done |
| 23 | Leagues | Kin settlements act as one: a league's standing orders, scheduled sea routes in cargo boats, each member making what it does best | 13, 16, 18 | Gate 23 (proposed) | After the second pass |
| 24 | A city across the water | A town whose land is full founds districts on other islands, kept supplied by boat through its quays; causeways over narrow water | 9, 21, 23 | Gate 24 (proposed) | After 23 |

Phases group into arcs: **foundations** (6 and 7), **the shape of a town** (8 to 10), **depth of life** (11 to 15: goods, seasons, trade, people and learning), **many peoples** (16 to 18), **ages and trials** (19 and 20), **the shape of roads** (21), **the land that feeds** (22), and **one people across the sea** (23 and 24).

# Principles for every phase

- **Earlier gates keep their intent.** A new system is off by default where it would change a scripted scenario (as the [planner](/systems/planner.md) and [knowledge](/systems/knowledge.md) are), or the affected gates are reworked under [decision 0004](/decisions/0004-reworking-gates.md) and the change is logged.
- **Deterministic and headless.** One seed and the same commands always give the same world. Each new source of chance gets its own seeded stream, as knowledge did with `S.krng`.
- **One standard map for tests.** Gates run on the standard map: today's small island until Phase 7, then Island at the `standard` size (112 by 80). Other map types and sizes are covered by the map suite (Phase 7), so every world the player can pick is known to play.
- **Unscripted is the bar.** A system is ready when a gate shows it doing on its own what a script or the player used to do.
- **Machines earn their place.** Every new tier is discovered under a strain the player can see (hauling, distance, cold, crowding), never unlocked on a timer.
- **Everything moves, and nothing is named in code.** Goods, buildings, vehicles, hazards and ages are OKF concepts in `design/`; the planner and job board read their fields.
- **Playable every phase.** Each phase ships something the player can see and understand: a panel, an overlay, a status line, a chronicle entry. It still works on a phone.

# Tracks that run through every phase

- **Performance.** From Phase 6, every gate receipt carries deterministic work counters (path nodes expanded, job-board pairs scored, planner spots scored, per game minute), never wall-clock time, which varies between machines. Each counter gets a budget once measured; a budget is only ever tightened, except under decision 0004.
- **Saves.** From Phase 6, saves carry a schema version. Every later phase that changes state adds a migration, plus a test that loads a saved fixture from the previous version.
- **Gate upkeep.** Each phase lists the gates it disturbs. Re-sweep them on seeds 1847, 7, 42, 99, 2026 and 31337, record the results in the [log](/log.md), and revise or supersede as decision 0004 says.
- **Content.** New goods, buildings and tuning live in concepts with `generated` authorship; nothing balance-related is hard-coded.

# 6. Solid ground

**Why now.** Everything after this assumes buildings are physical, saves exist and the cost of the sim is measured. Today villagers walk through buildings, mood and stock are island-wide, and nothing records how much work a tick costs.

**Delivered:** mood and supply per settlement (with Phase 7's map types, which needed them); solid buildings with doors and door fronts; work counters in every receipt (`path_searches`, `path_fails`, `path_nodes`, `job_pairs`, `planner_spots`); versioned [saves](/systems/saves.md) with autosave, Continue, and save files; [Gate 6](/gates/06-solid-ground.md). **Phase 6 is done.**

**Builds.**
- **Solid buildings. Building tiles block walking; only a building's door tile lets people in. The tile in front of each door must stay open: placement (planner and hand) refuses anything that would cover a door front. A building nobody can reach shows "No way in" and is not served. An agent caught inside a new footprint walks out through it.
- **Mood and supply per settlement.** Each settlement has its own mood, and newcomers choose a settlement with free beds and good mood. The planner's affordability counts its own settlement's free stock.
- **Saves.** The whole state serialises, with a schema version: the random streams are plain numbers, and references become ids. The browser autosaves and can load.
- **Work counters** in every receipt: `path_nodes`, `job_pairs`, `planner_spots`.

**Gate 6 (stable).** [Gate 6](/gates/06-solid-ground.md) as proposed, plus `town_mood_min` so each settlement meets the mood bar on its own. Two settlements, planner on, 30 game minutes. A save at 15 minutes, reloaded, finishes with the same receipt as an uninterrupted run (`save_roundtrip_match = 1`); `agents_inside_walls = 0` at every second; `max_departures: 2`; `min_mood_min: 0.6`. Work counters and `save_bytes` are recorded as the baseline for Phase 7 budgets.

**Disturbs.** Every gate, since routes change around solid buildings. [Gate 4](/gates/04-village-plans.md) is revised at the same time: its town reaches four times its population bar, so the bar rises to what the planner reliably achieves, less a margin.

**Kyle's call.** Should the player be stopped from placing a building that blocks a door, or warned and allowed?

# 7. Worlds

**Why now.** On the 56 by 40 island, two settlements first find no room at 15 to 18 minutes (one settlement at 24 to 30). Every later phase needs room, players want to choose the kind of world they build in, and both need a sim that scales.

**Delivered early, at Kyle's request:** map types (Islands, Landmass with rivers, Coast with islets, and the Lone isle as the standard), sizes (small, medium, large), the new-game screen with a live preview, settlements placed by the seed, and boats: [docks](/blueprints/dock.md) discovered when neighbours are across water, rowing boats that land on any shore, and visitors who carry knowledge across the sea. Cargo boats, river transport networks and ships remain in Phases 16 and 18. **Phase 7 is done:** the standard map is Island at 112 by 80; gates name their world with word parameters; each settlement draws its own newcomers; the planner's search widens as a village spreads and skips what it has no room for; the job board scores only real pairs; and [Gate 7](/gates/07-worlds.md) (scale and map suite) passes with work budgets set. Map sizes were then enlarged at Kyle's request to S, M, L and XL (192 by 144 up to 512 by 384), with the ground drawn in pieces and a far overview, zoom out to the whole world, sapling growth and site choice that do not scan every tile, and route searches sized to the map. Path caching and region portals were not needed and move to when a budget calls for them.

**Builds.**
- **Map types as content.** Each type is an OKF concept in a new `design/maps/` folder whose frontmatter drives the generator: land shape and falloff, water level, noise scales, forest density, and where settlements may start. New types are written, not coded.
  - **Island** (today's): one landmass ringed by sea.
  - **Landmass:** land to the edges of the map, with inland lakes, forests and, from Phase 8, mountains and rivers. No sea to hem towns in.
  - **Coast:** land on one side, open sea on the other, with bays and headlands, ready for fishing (11) and ports (18).
  - **Archipelago** arrives with ships in Phase 18; offered earlier, its islands would be unreachable.
- **Map sizes** in [map](/systems/map.md) tuning: small (56 by 40, today's), medium (about 112 by 80), large (about 192 by 144), and huge once the work budgets allow it. A new game starts with two settlements on any size, so the player can watch them grow apart, trade knowledge and later goods (13); the new-game screen offers one to four.
- **The standard map:** Island at 112 by 80 (size `standard`), seeded like today: the world the gates run on. Players start on M.
- **A new-game screen:** pick map type, size, seed (or random) and starting settlements, with a preview of the generated land before starting. Saves (6) record the choice. "New island" becomes "New world".
- **A generator per type,** each with starting sites chosen for room, wood and water, deterministic per seed.
- **A job board that scales:** a spatial index, so a carrier scores nearby requests and offers instead of every pair.
- **Pathfinding that scales:** regions joined by portals for long trips, and paths cached between the same doors.
- **A renderer that culls:** chunked drawing of only what is on screen, and a minimap. Move the sim to a Web Worker if the frame budget demands it.
- **Gate parameters gain words.** Today a gate's parameters are numbers; map type and size become string parameters, so a receipt says which world it ran on.

**Gate 7 (stable)**, as proposed except that the scale run counts `town_mood_min` (each settlement's own mood) and the map suite skips sizes a map type does not offer. Two parts.
- **Scale:** Island at large size, four settlements, 60 game minutes, no build calls: `min_peak_villagers: 600`, departures under 1% of peak, `min_mood_min: 0.6`, and every work counter per game minute within its budget. Budgets are set from the measured run plus headroom, then tightened as the code improves.
- **Map suite:** every map type at every size on three seeds. Each run must find a starting site for every settlement and, with the planner on for 15 game minutes, end with every settlement fed and no departures. (`suite_failures = 0`.)

**Disturbs.** Every gate moves to the standard map. Gates whose intent survives the bigger map are revised in place (new defaults and re-measured thresholds); a gate whose scripted layout no longer makes sense there is superseded under [decision 0004](/decisions/0004-reworking-gates.md). The old small-island versions stay runnable by name.

**Kyle's call.** The standard map's size; the large and huge sizes; which further map types are worth having (highlands, river delta, a desert edge once climate exists); and how many settlements a new game starts with on each size.

# 8. The lie of the land

**Why now.** On bigger maps and the landmass type, distance and terrain start to matter, and they shape everything in Phase 9.

**Delivered.** Height and slopes on every map, mountains of rock on Landmass and Coast; deposits (fertile soil, stone, clay, fish) shown and waiting for Phase 11; desire paths that planners pave; the [Bridge](/blueprints/bridge.md), discovered under the new `detours` need and placed by the planner; surroundings in mood, with the [Sawmill](/blueprints/sawmill.md) as the first nuisance; `fed_min` in every receipt; [Gate 8](/gates/08-lie-of-the-land.md). **Phase 8 is done.** Bridges are planned by villages only; letting the player place one is open.

**Builds.**
- **Terrain on every map type:** height with slope slowing walkers, rivers that block walking, and deposits (fertile soil, stone, clay, fishing water) that buildings must sit on or near. Deposits sit unused until Phase 11 gives them goods.
- **Bridges**, discovered when a river keeps people from somewhere they need to go (a knowledge `need` for detours).
- **Desire paths.** Tiles accumulate wear from feet; the planner paves the worn ones, so roads follow real traffic.
- **Surroundings in mood.** Each home scores its surroundings from blueprint fields: `nuisance: { radius, amount }` on workplaces such as the sawmill, and `amenity` from trees, water and gardens; crowding and building sites count against. Settlement mood blends being fed with surroundings, and the planner keeps homes away from nuisance.

**Gate 8 (stable).** As proposed, on a Landmass at the standard size (the standard Island has no rivers), with one change: roads are judged by delivery pace (seconds per straight-line tile) rather than `mean_delivery_seconds`, because the paved village grows bigger and its trips longer. A standard-map seed with a river, run twice, with road planning on and off: on cuts delivery pace by at least 15%. In the "on" run, a bridge is discovered and built, `homes_in_nuisance = 0`, and `min_fed_min: 0.6`.

**Disturbs.** Mood changes meaning, so gates 2, 4, 5 and 6 would drop for reasons unrelated to what they test. Receipts gain `fed_min`, the hunger part of mood alone, and those gates' welfare checks are revised from `mood_min` to `fed_min`, which keeps their intent ("nobody goes hungry").

# 9. Village to town

**Why now.** It needs land with a shape (8), solid buildings (6) and a planning cost that is measured (6, 7).

**Delivered.** Form by size (hamlet, village from 40 people, town from 90); the ladder of homes ([Cottage](/blueprints/house.md), [Family House](/blueprints/family_house.md), [Terrace](/blueprints/terrace.md)); homes wall to wall in rows; a street grid per district in a town; replanning of old blocks with everyone re-housed first and part of the cost salvaged; districts around storage yards, split as they fill, with placement searching only the newest; [Gate 9](/gates/09-village-to-town.md). **Phase 9 is done.** The town planner and its district planners are one planner per settlement working district by district; districts have no separate purposes or quotas yet, and tenements wait for fire (Phase 20) to give density its full price.

**Builds.**
- **Form by size.** Hamlets are roomy (today's ring of open land, with gardens as amenity); villages pair houses wall to wall; towns lay a street grid ahead of growth and fill blocks with terraced rows facing the street. Thresholds are tuning.
- **A ladder of home sizes:** cottage, family house, terrace, and later tenement, each with more beds per tile. A cottage on a good plot is torn down for a terrace once the town outgrows it.
- **Replanning rules:**
  - residents are re-housed before their home comes down;
  - never the last building of a kind, and never one younger than a set age;
  - demolition salvages part of the cost;
  - a whole block is planned at once.
- **A town planner and district planners.**
  - The town planner sets districts, their purpose, streets, quotas and material priority.
  - District planners run their own blocks and send up what they cannot solve.
  - Districts split as they grow.
  - Each district planner sees only its own blocks, so planning cost follows district size, not town size.
- **Density has a price:** crowding lowers surroundings, and later fire runs along rows (Phase 20).

**Gate 9 (stable)**, as proposed, plus `town_form = 2`; `planner_spots` uses Gate 7's budget, and "homes per built tile" counts housing land (home footprints and the ring of land around them). Standard map, one settlement, 60 game minutes:
- `min_blocks_replanned: 1`;
- homes per built tile at the end at least 1.5 times the hamlet's;
- `min_districts: 3`;
- `max_demolition_departures: 0`;
- `min_fed_min: 0.6`;
- `planner_spots` per game minute within budget.

**Disturbs.** Gate 4, if the planner's single-town behaviour changes: revise it, keeping its intent of matching the script with no build calls.

# 10. The steward

**Why now.** The vision says the player steers rather than places. With town and district planners in place, there is something to steer, so levers should not wait for the end.

**Delivered.** Levers on each settlement's planner: priorities, encouragement and pace, in a Steward panel; zones painted from the build bar (homes, farms, workshops, no building), owned by the nearest settlement; overlays for how homes feel, noise, districts, traffic and courier coverage; the chronicle, read in game and exported as an OKF log; an advisor that points at a lever; [Gate 10](/gates/10-steward.md). **Phase 10 is done.** A district's purpose is painted as zones rather than set per district.

**Builds.**
- **Levers through the town planner:**
  - **priorities:** rank shortages;
  - **zoning:** paint a district's purpose, or no-build land;
  - **encouragement:** back a line of inquiry to make a discovery likelier;
  - **pace:** how much the planner builds at once.
  - Hand placement stays.
- **Overlays:** mood, nuisance, districts, traffic and coverage.
- **A chronicle:** each settlement's history as it happens (founded, invented, taught, forgotten, replanned), readable in game and exportable as an OKF log. An advisor points at what the chronicle shows (the tutorial goals were removed at Kyle's request).

**Gate 10 (stable)**, as proposed, plus a minute's gain for the raised priority and the zone painted on the side away from the neighbour. A paired scenario per lever. Zoning keeps at least 90% of farms in the farm zone; raising a priority moves that need's first relief earlier; encouragement brings a discovery earlier on at least five of six internal seeds. Also: every invention, teaching and forgetting appears in the chronicle.

# 11. A deeper economy

**Why now.** Deposits exist (8) and towns have room for workshops (9). The planner needs richer choices, and home tiers need goods.

**Delivered.** Nine new goods (stone, cut stone, clay, bricks, iron ore, tools, fish, flax, cloth) from eleven new buildings, placed on deposits (iron added); two-input recipes; tools that speed work and wear out; home tiers by goods with mood rewarding variety; terraces built of bricks; storage capacity, a granary and a warehouse, and food that spoils when left out; planner chains with comforts after food; [Gate 11](/gates/11-deeper-economy.md). **Phase 11 is done.** Upgrades are planned as replanning (Phase 9) rather than alongside new buildings.

**Builds.**
- **New goods:** stone, then cut stone; clay, then bricks; iron ore, then tools; fish; flax, then cloth.
- **Multi-input recipes.** Tools wear out and speed up the work that uses them.
- **Home tiers by goods,** separate from size: a tier-one home needs bread, tier two adds fish or cloth, tier three adds tools. Mood rewards variety.
- **Storage:** granaries, a woodyard and warehouses with capacity; some goods spoil when left out.
- **Planner chains** several steps deep, with upgrades planned alongside new buildings.

**Gate 11 (stable)**, as proposed, plus `goods_made` (chains several steps deep); "stocked" is checked as each lived-in home having its food on the shelf, sampled every ten seconds. Standard map, one settlement, 60 game minutes: at least 20% of homes at tier three; every tier's homes stocked at least 90% of the time; departures and `fed_min` at Gate 2's level.

# 12. Seasons

**Why now.** Seasons reshape the food economy. Added late, they would mean rebalancing everything built since, so they come straight after the economy deepens.

**Builds.** A year of tuned length: crops grow from spring to autumn and are harvested; winter needs firewood for warmth and stored food. Granaries and preserved food (smoked fish) earn their place. The planner forecasts winter demand, and mood has a seasonal part.

**Delivered.** A year of `year_seconds` (twenty game minutes) in four seasons, on in every new game and off in older scenarios. Farms and flax farms rest in winter and their workers go carrying; homes burn firewood and feel the cold; [smoked fish](/goods/smoked_fish.md) from the [Smokehouse](/blueprints/smokehouse.md) keeps; newcomers come in spring and summer, in summer only while the winter store keeps pace; the planner wants more grain, firewood and room for the winter's store. The HUD shows the season and the land turns with it. Saves go to version 8. A worker left at a full workplace goes carrying (every game, not only with seasons). **Phase 12 is done.**

**Gate 12 (stable)**, as proposed, plus `peak_villagers` at least 60 so a settlement that never grows cannot pass. Three game years on the standard map: departures at most 2% of the peak, `fed_min` at least 0.5, and food in store at the first frost covering at least the winter's need.

**Disturbs.** Every food gate: seasons are off by default for scenarios that predate them, like the planner was.

**Kyle's call.** Year length, and whether winter is harsh or gentle in tone.

# 13. Neighbours trade

**Why now.** A new game starts with two settlements, each planning for itself, and the deeper economy (11) gives them different things to be good at. Watching two villages find their own ways and swap what they have is worth having long before carts or daughter towns.

**Builds.**
- **Surplus and want.** Each settlement knows what it has spare and what it lacks, from its own planner's shortages.
- **Porters.** Villagers carry goods between settlements on foot, like visitors with full hands; carts (16) and boats later make it cheaper. Goods still move one load at a time; there is no global stockpile.
- **Barter.** A load goes one way when a load of something wanted comes back, at a rate each side's need sets. Money waits for a discovery later on.
- **Imports as relief.** The planner counts a reliable import as relief for a shortage, so a village near clay stops building farms it doesn't need and trades bricks for bread. Specialisation follows.
- **Knowledge rides along.** Porters gossip like visitors, so trade partners share ideas faster.

**Delivered.** [Trade](/systems/trade.md), on in every new game and off in older scenarios: each settlement weighs its goods by how long its stock lasts, porters carry a load of what it can spare to a neighbour and bring back what it wants at a rate set by both sides' want, with nothing going straight back and the food chain kept home; imports count as supply for the planner, and a neighbour's want of what it cannot make counts as demand; porters gossip like visitors; the Steward panel shows each settlement's trade, and the first trade goes into the chronicle. Saves go to version 9. **Phase 13 is done**, with a gate below the proposal.

**Gate 13 (proposed).** Two settlements on the standard map, run with trade on and off. With trade on: total population is higher, each settlement's `fed_min` is at least as good, and each settlement exports at least 30% of one good it makes.

**Gate 13 (stable), below the proposal.** Trade on and off from the same seed: at least 20 loads, each settlement exporting at least 3% of a good it makes, population with trade at least 95% of without, `fed_min` with trade at least 0.6. On foot and between two near-identical villages, trade moves 10 to 110 loads an hour and shifts population within the noise between seeds (3% down to 7% up), so "beats isolation" is not yet shown: it waits for carts (16) and settlements on different land. Kyle's call whether that is acceptable for this phase.

**Kyle's call.** Should money exist at all, or stay barter?

# 14. People and traditions

**Why now.** It needs a working economy and calendar (11, 12) so that families, ageing and customs have something to live in, and trading neighbours (13) to compare customs with.

**Builds.**
- **Individuals.** Each villager has an age, a family, a home, and a skill per trade that grows with practice. Work goes to the most skilled villager free.
- **Births, ageing and death.** Couples have children when fed and housed; the old retire and, in time, die.
- **Apprenticeships.** A master takes an apprentice; skill passes faster from master to apprentice than from practice alone, and a craft with no apprentice is one death from being lost.
- **The dead are honoured, each village in its own way.** Every settlement settles on a custom, and customs are practices that spread, change and are kept like any other knowledge:
  - **burial:** a graveyard that takes land and grows with the years, and is never built over;
  - **cremation:** a pyre that burns wood, so a timber-poor village feels it;
  - **ship burial:** a boat with the dead set out to sea, possible only by water and costly in planks.
  A village that cannot follow its custom (no land for the graveyard, no wood for the pyre) is unhappy until it can; a village may change its custom under strain, and neighbours notice.
- **Traditions beyond burial** follow the same rule later: feasts, harvest festivals, naming customs. Each is a practice with a cost and a mood effect, and each village's mix makes it feel like itself.
- **Planners are people.** The town planner and district planners are villagers with a planning skill, working from a town hall and district halls.

**Gate 14 (proposed).** Two parts.
- **Growth:** newcomers off, 60 game minutes: population up at least 50% by births; at least one expert in every trade; `fed_min` at Gate 2's level.
- **Customs:** two settlements whose land and wood differ end with different burial customs, and every death is honoured by its village's custom within a set time.

**Delivered.** [People](/systems/people.md), on in every new game and off in older scenarios, with their own random stream: ages (children neither work nor carry; elders retire from workplaces and carry), births in fed homes with two adults while the food chain is not badly short, death of old age only, told gently; a skill per trade that grows with practice, three times as fast with a master in the settlement, sets a workplace's pace and decides who gets the job; burial in a [Graveyard](/blueprints/graveyard.md), cremation on a [Pyre](/blueprints/pyre.md) that burns logs, ship burial from a [Dock](/blueprints/dock.md) that takes planks, each settlement's custom from its land (water, then wood), changed when it cannot be kept and noticed by neighbours; the planner builds the custom's place and more storage when its stores are full. Children are drawn smaller; homes list their household; the Steward panel shows the custom. Saves go to version 10. **Phase 14 is done** apart from planners as people (town and district halls) and traditions beyond the dead (feasts, festivals, naming), which wait for a later phase. In the second pass, feasts came: with seasons on, each settlement keeps a Harvest Festival (bread as autumn comes) or a Midwinter Fire (logs as winter comes) by its land, holds it when its stores allow, is lifted by it for a while, and picks up its neighbours' feasts through visitors. Then naming customs: every villager has a given name, from the sea, the trees or the fields as their settlement's land suggests, shown in its homes and in the news of births and deaths. Then planners as people: a village builds a [Town Hall](/blueprints/town_hall.md) whose planner, at their desk, lets it keep two of its own sites open at once, three once a master of the trade. District halls were tried and gave nothing more. **Phase 14 is done.**

**Gate 14 (stable)**, as proposed: growth by births alone at least 1.5 times over an hour with newcomers off, an expert in every trade standing, `fed_min` 0.6; two settlements whose land differs keep different customs, and every death (an old founding generation, scripted to die within the hour) is honoured within five minutes.

**Kyle's call.** Tone of death and ageing in a cosy game (old age only, shown gently?), and which burial customs fit the game's feel.

# 15. Learning

**Why now.** People with skills (14) and knowledge that can be lost (5) make keeping and teaching knowledge worth building for.

**Builds.**
- **Libraries.** A library holds the settlement's knowledge in the world: what it holds is not forgotten while the library stands, and scribes copy its records for neighbours. The record format is the knowledge bundle from Phase 5, so a library's shelves can be browsed in game. A village thinks of the library after it loses knowledge it needed.
- **Schools.** Children who go to school learn trades faster as apprentices, and read, so they can learn from a library without a visitor.
- **Universities.** Scholars pursue a line of inquiry: invention under strain becomes likelier and faster, and some discoveries need a university at all. The steward's "encourage a line of inquiry" lever (10) acts through them.
**Delivered.** The [Library](/blueprints/library.md), thought of after a loss (need `forgetting`): nothing is forgotten while one stands, its scribe copies its records to every neighbour, and its shelves list in its inspector. The [School](/blueprints/school.md): children who grow up with a teacher at work learn trades twice as fast. The [University](/blueprints/university.md), thought of under `inquiry` (strain on needs nothing known meets): with a scholar at work, invention comes three times as fast, on top of the steward's encouragement, which still works without one (Gate 10). The planner builds each with people on. Saves go to version 11. **Phase 15 is done.** Reading from a library without a visitor, and discoveries that need a university at all, wait for a later phase. In the second pass, discoveries that need a university came: a blueprint may be thought of only while a university has a scholar at work, the first being the [Bathhouse](/blueprints/bathhouse.md) (Phase 20's sanitation). Then reading: villagers schooled as children read, so a settlement with a library and readers takes in what every other library holds without a visitor, and a reader learns a trade written down in its library as from a master (Gate 15 gains a fourth part). **Phase 15 is done in full.**

- **Gate 15 (stable, as proposed).** Two paired scenarios. With a library, a settlement keeps a craft through a long spell without using it that loses the craft without one. With a university, a discovery comes earlier on at least five of six internal seeds.

# 16. Ways to move

**Why now.** Distances are real (7, 8), trade (13) makes long hauls routine, and they are visibly slow.

**Builds.** Vehicles as blueprints, each with a capacity, a speed and the surfaces it can use: handcarts, ox carts, and river boats between jetties. The job board plans multi-leg deliveries through hubs and warehouses. Carts are discovered under distance strain and boats under river strain, and spread by the existing knowledge rules.

**Delivered.** Handcarts: the [Cart Shed](/blueprints/cart_shed.md), thought of under the new need `distance` (how far a settlement's deliveries go on average), keeps four carts. A carrier taking a job of 20 tiles or more, with a bigger load than two hands carry, takes a cart from a shed within 30 tiles: six goods, 1.3 times as fast on roads and bridges, 0.9 times elsewhere, back when delivered. The planner wants a shed for every 12 villagers once deliveries run long. Carts are on in new games and off in older scenarios; carters are drawn with their cart. Saves go to version 12. **Phase 16 is done in part:** ox carts, river boats between jetties and multi-leg deliveries through hubs wait for a later phase. In the second pass the [Ox Barn](/blueprints/ox_barn.md) came: thought of once the Cart Shed is known and deliveries average 30 tiles or more, it keeps two ox carts of twelve goods for jobs of 40 tiles or more, slower than a handcart, each trip eating a sack of wheat. River boats and multi-leg deliveries still wait.

**Gate 16 (stable), below the proposal.** Landmass at size L, an hour: carts thought of unscripted, at least 40% of the goods on long hauls by cart, and a good by cart in at most 60% of the time on foot (see the gate for why it measures within one run).

**Gate 16 (proposed).** Landmass at large size, where distances are longest: carts discovered unscripted; at least 50% of deliveries over a set distance go by cart; `mean_delivery_seconds` below the Gate 8 baseline.

# 17. New settlements

**Why now.** Daughter towns need room (7), transport to stay in touch (16), and people to send (14).

**Builds.** A crowded town, or one short of land or a deposit, sends a founding party with villagers, part of the stores, its knowledge minus the crafts it never practised, and its customs. The party scores sites for land, deposits, water and distance from rivals, then walks there. Daughter towns keep visiting and trading with their mother town, and their customs drift.

**Delivered.** [Settling](/systems/settling.md), on in new games and off in older scenarios: a self-planning settlement of 70 or more, at most once every 20 minutes and while the world has fewer than 8 settlements, sends 6 villagers off with the cost of a yard and two cottages, a new game's starting stores and a quarter of what else it holds, to a site chosen as the first neighbours are. The daughter keeps the founders' knowledge and what its mother proved in use, its mother's custom and levers, and plans for itself; the chronicle records both ends. Saves go to version 13. **Phase 17 is done.** In the second pass, settling for want of land: a settlement whose planner finds no room for what it needs sends settlers from 30 people instead of 70, so villages that fill their islands spill over the water instead of standing still. Settling for want of a deposit still waits.

**Gate 17 (stable)**, as proposed: Landmass L, one settlement, 90 minutes: at least four settlements, each fed (`fed_min` 0.6 from five minutes after its founding) and growing (1.5 times its first people, once fifteen minutes old).

**Gate 17 (proposed).** Landmass at large size, one settlement at the start, 90 game minutes: at least four settlements, unscripted, each fed and growing.

# 18. The sea

**Why now.** It needs trade (13), new settlements (17) and boats (16) to grow from.

**Builds.** The archipelago map type (a concept in `design/maps/`, like the others), with shallows, reefs and open sea. Docks, shipyards, ships with crews, and sea routes. Explorers chart islands the settlements have not seen. Settlers, goods and knowledge cross water only by ship, and colonies are founded overseas.

**Delivered, in part.** Colonies: a founding party must reach its site on foot or by boat; a settlement whose own land is full but sees land across the water comes up with the dock, builds one and sends its next party by sea, and the daughter is a colony. Kin (a daughter and her mother) favour each other in trade, so colonies trade back. The [Archipelago](/maps/archipelago.md) map type: many small islands. Saves go to version 14. **Phase 18 is done in part:** shallows and reefs, shipyards and crewed ships, sea routes and explorers charting unseen islands wait for a later phase; rowing boats carry everyone today.

**Gate 18 (stable)**, as proposed: Islands at size M, an hour: a colony founded on a second island unscripted, alive for 30 game minutes, with porters crossing between it and its mother.

**Gate 18 (proposed).** Islands map at size M: a colony is founded on a second island unscripted, survives 30 game minutes, and trades back to its mother town.

# 19. Ages

**Why now.** By here the game has enough discoveries to group into eras, universities to pursue them (15), and enough distance for an age to spread unevenly.

**Builds.**
- **Eras:** hand tools, stone and bronze, iron, wind and water mills, steam and rail. Each is a set of discoveries plus what they unlock, written as OKF concepts.
- **Machine tiers:** courier bots, then conveyors, then rail, each discovered when the tier below visibly struggles.
- **Regression:** an isolated or shrinking settlement without a library can fall back an age.

**Delivered, in part.** [Ages](/systems/ages.md): eras are concepts in `design/eras/` ([Hand Tools](/eras/hand_tools.md), [Wheel and Keel](/eras/wheel_and_keel.md), [Letters](/eras/letters.md), [Clockwork](/eras/clockwork.md)), each a set of discoveries and the share of them a settlement must know, after every earlier era. A settlement's age turns as it learns and falls back as it forgets, into the chronicle and the Steward panel. Saves go to version 15. **Phase 19 is done in part:** the machine tiers after courier bots (conveyors, rail) and the eras of iron, mills and steam wait. In the second pass, eras unlock blueprints of their own: the Age of Clockwork's [Windmill](/blueprints/windmill.md), thought of only by a settlement of that age when its bakers cannot keep up, grinds the grain for the bakeries around it so each sack of wheat makes half as much bread again (Gate 19 checks it comes only with its age).

**Gate 19 (stable)**, as proposed: Landmass L, 90 minutes, every settlement past the first age on the default seed (at least half required); an isolated settlement without a library falls back an age, and with one it does not.

**Gate 19 (proposed).** An age turns across at least half the settlements unscripted. In a second scenario, an isolated settlement without a library loses a craft it stopped practising.

# 20. Hardship

**Why now.** It needs seasons (12), density (9) and ages that offer remedies (19), so hardship meets a civilisation able to answer it.

**Builds.**
- **Hazards and their counters:**
  - fire spreads between close wooden buildings, answered by wells and fire crews;
  - rivers flood, answered by levees;
  - sickness spreads in crowded towns, answered by healers and then sanitation;
  - barbarians (Kyle's idea): camps spawn in wild land far from any settlement, more where more land lies untouched, and raid the nearest settlement's stores; answered by palisades, watchtowers and a militia drawn from villagers, and in the end by settling (17): as civilisation spreads, the wild land where camps can appear shrinks. Whether barbarians can later be traded with or settle down is open.
  - Each counter is discovered under its strain.
- **The remaining laws** for the steward: rationing, working hours, who may leave.

**Delivered, in part.** [Hardship](/systems/hardship.md), on in new games and off in older scenarios, with its own random stream (`S.hrng`). Fire guts wooden buildings (rebuilt at half their cost) and jumps along rows built wall to wall, answered by the [Well](/blueprints/well.md) and a fire crew from the neighbours; each spring the waters rise over low land by the shore, answered by the [Levee](/blueprints/levee.md); sickness spreads home to home in settlements of 30 or more, answered by the [Healer's House](/blueprints/healer.md); barbarian camps are pitched in wild land far from every settlement (one per 3000 tiles of it) and raid the nearest first storage yard, answered by the [Watchtower](/blueprints/watchtower.md) (whose lookout musters the whole militia), the [Palisade](/blueprints/palisade.md), a militia of a fifth of the grown villagers, and settling the wilds, which breaks camps up. Each counter is thought of while its hazard is fresh in memory, and the planner sites it where it guards the most. The laws: rationing, working hours and whether the hungry may leave, per settlement in the Steward panel. Saves go to version 16. **Phase 20 is done in part:** sanitation, and trading with or settling barbarians, wait for later. In the second pass, sanitation came: the [Bathhouse](/blueprints/bathhouse.md), thought of by scholars, keeps the homes around it from falling sick or catching it from a neighbour, a third as often. Then gifts to the barbarians: with trade on, a settlement sends bread it can spare to a camp in reach, which leaves it in peace and, after enough gifts, comes in and settles there. **Phase 20 is done.**

**Kyle's call, answered for now.** Fire damages: a burnt-out building stands gutted and is rebuilt at `rebuild_share` of its cost; a storage yard loses what burnt and stands.

**Gate 20 (stable)**, as proposed, on Landmass M (the standard island is settled to its shores in ten minutes, so no wild land is left for camps, and it has no rivers): three winters, each kind of hazard at least once (any that has not come of itself by the second summer is brought down once), at most 10% of the people lost; rationing saves people in a lean winter (food cut to a quarter at the first frost). Added: a counter for each kind built, and a raid beaten off.

**Gate 20 (proposed).** A planned town weathers one hazard of each kind (barbarian raids among them) and three winters, losing at most 10% of its people. In a paired scenario, rationing brings a town through a lean winter that kills or drives off more people without it.

**Kyle's call.** Can fire destroy buildings for good, or only damage them?

# 21. Paths and roads

Kyle's idea. **Why.** Today's "roads" are desire paths: worn where people walk, winding around whatever stands. Real towns lay their roads first and build along them.

**Builds.**
- **Paths.** What wear lays down today is renamed a path (still faster than open ground).
- **Roads.** Discovered later (wheel and keel, or under hauling strain on long paths), roads are planned as long straight strips between districts and to neighbours, faster than paths, especially for carts.
- **Cutting through.** A planned road may demolish what stands in its line (moving people first, salvaging as replanning does), as long as the strip stays straight.
- **Planned around.** Once a road is laid, the planner sites buildings along it, doors facing it, instead of letting paths wind around buildings.

**Delivered.** [Roads](/systems/roads.md), on in new games and off in older scenarios (\`plannedRoads\`). What wear lays down is now a [path](/blueprints/path.md) (\`path_speed\` 1.7, as before); the [Road](/blueprints/road.md) is thought of under \`traffic\` (a village's or town's deliveries averaging 8 tiles or more), walked at \`road_speed\` 2.4 and rolled by handcarts at \`cart_road_speed\` 1.6. A settlement lays its main roads (one, and another per 40 people) as straight strips where its people walk most, the first by its first storage yard's door, at a plank a tile, cutting through workshops and homes in the line (people moved to free beds first, salvaged as replanning is; never storage, bridges or docks). The planner then favours spots with a door onto a road. Saves go to version 17. **Phase 21 is done**; districts that grow along their roads, roads on to the neighbours and roads of stone wait for the second pass. In the second pass, roads of stone came: the [Stone Road](/blueprints/stone_road.md), thought of under `traffic` once the Road is known, walked at 3 times open ground against the road's 2.4; a settlement repaves its busiest road in stone, the whole strip at once, a stone a tile, from stone it can spare (Gate 21 checks it). Roads on to the neighbours still wait.

**Gate 21 (stable)**, as proposed: the standard map, an hour: at least one straight road through the centre, nobody homeless, deliveries mostly along roads at least 5% faster per tile than those mostly along paths; with \`fed_min\` 0.6 added.

**Gate 21 (proposed).** A town on the standard map lays at least one straight road through its centre unscripted, nobody is left homeless by it, and deliveries along it are faster than along paths.

# 22. Farms that grow

Kyle's idea. **Why.** A farm is a fixed 3 by 2 plot with one worker making wheat at one rate, so a growing town only ever adds more identical farms, and every home eats the same bread. Real farms grow their fields as their village grows, need more hands at harvest, and give different foods from different land.

**Builds.**
- **Fields that expand.** A farm grows in steps (a smallholding, a farm, an estate): each step adds fields beside it, on open land it can claim (the planner decides when, like replanning, weighing the land it takes against a new farm's), up to a largest size. Expanding costs goods and time like building.
- **More hands, more yield.** Each step adds a worker place and raises the farm's output; an understaffed farm yields for the hands it has. Fields that rest in winter with [seasons](/systems/seasons.md) rest at every size.
- **Different foods.** Crops and herds beyond wheat: vegetables (fast, on most land), an orchard's fruit (slow to start, on fertile land), and a herd's milk and meat (on grass, all year round, needing more room). Each is a food homes eat beside bread; the planner chooses what to grow from its land, its season and what its homes lack, and trade carries what one village grows to another.
- **A varied diet.** Homes keep a little of each food they can get; mood rewards variety (as comforts do today), and a settlement fed by one crop is more exposed to a bad year.

**Delivered.** [Farms that grow](/systems/farms.md), on in new games and off in older scenarios (`farms`). The [Farm](/blueprints/farm.md) grows from a smallholding to a farm and an estate, the new [Garden](/blueprints/garden.md) (vegetables, quick, any land), [Orchard](/blueprints/orchard.md) (fruit, on fertile land, bearing after four minutes) and [Pasture](/blueprints/pasture.md) (milk and meat, all year, on twelve tiles) likewise, each step a row of [new fields](/blueprints/field.md) laid across its back as a site of its own, which joins it when finished: one more place for a hand, and as much more output and room for it. Workplaces take several hands, the first place everywhere filled before any second; each hand adds their pace. Homes keep a little of each food their settlement grows and eat whichever they have gone longest without, and mood rewards a varied diet. The planner wants half its meals from the diet foods and grows a farm of the kind it needs before building another, favouring spots with room behind. A farm that has grown no longer turns. Saves go to version 21. **Phase 22 is done.** Blight and drought, fences and pasture as buildings of their own, and the player choosing which side a farm grows on wait for Kyle's call.

**Gate 22 (stable)**, as proposed: the standard map with seasons, three years: a farm at its largest size, more than one hand at work on one at once (three on every seed measured), its yield per tile of work at least a fifth above the first farm's as a smallholding, five foods eaten, every home lived in for a year eating two foods or more in the last year, `fed_min` 0.6.

**Gate 22 (proposed).** On the standard map with seasons, a self-planning town grows at least one farm to its largest size unscripted, staffed by more than one worker, making more per tile of land than its first farm did; at least three foods are grown and eaten; every home has eaten two foods or more in the last year; being fed holds (`fed_min` 0.6).

**Disturbs.** Every gate with a self-planning settlement (the economy changes), so like the other systems it is off by default where it would change a scripted scenario and on in new games, behind a new-game option. Saves raise their version (each farm's size, its fields, homes' foods).

**Kyle's call.** How many sizes a farm has and how big the largest is; whether herds need fences and pasture as their own buildings; whether a bad year (blight, drought) belongs here or in [hardship](/systems/hardship.md).

# 23. Leagues

Kyle's call, after a question of his: "how could we have cities or city networks that span islands?" (2026-10-05). **Why.** On the Islands, settlements fill their islands and found colonies over the water ([settling](/systems/settling.md), and since the second pass settling for want of land), so a world soon holds many small settlements, each on its own island. Today they are only neighbours: kin favour each other in trade, but each plans alone, and its porters cross the sea one load at a time when a want and a surplus happen to meet. A league lets kin settlements act as one people spread over many islands.

**Builds.**
- **The league.** A mother and the colonies it founds (and theirs) form a league, named for the mother. The chronicle and the Steward panel show it as one: its members, its people, its trade. A settlement founded by another league's member may join the league it trades with most.
- **Standing orders.** In place of a porter's errand when wants meet, a league keeps standing orders between members: a member that makes a good another lacks sends it every so often, sized to the other's use. The planner counts what the league supplies as supply, so each member builds what its land is best at (fish on a shore, stone by a quarry, bread on fertile land) and the league trades for the rest: specialisation by island.
- **Cargo boats and sea routes.** A [Dock](/blueprints/dock.md) with a boatman runs a cargo boat of a dozen goods on a route between two members' quays, on a schedule, rather than villagers rowing their own loads. Routes show on the map. Ships and shipyards (Phase 18, delivered in part) build on this: bigger boats, longer routes.
- **The player's hand.** The steward can set a league's priorities and open or close a route, as for a settlement.

**Gate 23 (proposed).** On the Islands at size M with every system on, a league of at least three members forms unscripted within two hours; its members trade with each other at least twice as much (goods a member) as unrelated neighbours do; at least one good is made by only one member and eaten by all of them; and cargo boats carry most of the league's trade.

**Disturbs.** Gates 13 and 18 (trade between kin changes); every default new game. Like the other systems it is off in scenarios that predate it and on in new games. Saves raise their version (leagues, orders, routes and boats).

**Kyle's call.** Whether a league is only kin, or settlements can join one by choice; whether the player can found or break up a league; how far a cargo boat's route may run.

# 24. A city across the water

Kyle's call, with Phase 23. **Why.** A town whose island is full stops planning ("No room") or founds a colony, which is a separate settlement with its own stores and plans. A port city should be able to spread over several islands as one town: districts across a strait, its goods crossing by boat, its people one people.

**Builds.**
- **Districts over the water.** When a town's land is full and it sees open land across the water within reach, it founds a district there, as it founds districts today, with a quay (a dock) on each side. The planner places that district's buildings around its own yard, as it does for any district.
- **Deliveries by boat.** A good bound for a district across the water goes by cart to the near quay, by the city's ferry or cargo boat (Phase 23) across, and on foot to its door: the multi-leg deliveries through hubs that Phase 16 left for later. Carriers who live across the water work there; the job board pairs jobs within a district before it pairs them across one.
- **Causeways.** Where the water is narrow (a tile or two), a causeway or a long bridge joins the islands for walkers and carts, as the [Bridge](/blueprints/bridge.md) crosses rivers today, and the district counts as across the street.
- **One town.** Its form, mood, chronicle and Steward panel count every district, wherever it lies.

**Gate 24 (proposed).** On the Archipelago (or the Islands at size L) with every system on, a self-planning town whose island fills founds a district on another island unscripted; that district is kept supplied (its homes fed, `fed_min` 0.6) through its quay; and at least a fifth of the town's people live across the water within two hours.

**Disturbs.** Gate 9 (districts) and Gate 18 (colonies: a town that can spread over the water founds fewer); Gate 16 (deliveries). Off in older scenarios and on in new games. Saves raise their version (districts across water, quays and the boat legs of deliveries).

**Kyle's call.** Whether a town founds districts across the water before or after it founds colonies; how wide water a causeway may cross; whether a city across several islands keeps one name or names each quarter.

# The second pass

Kyle's call: once Phases 20 and 21 are built, the roadmap is walked again from Phase 1, giving each phase depth and polish rather than new systems. In particular:

- **What was delivered in part:** ox carts, river boats and multi-leg deliveries (16); shipyards, crewed ships, reefs and explorers (18); eras that unlock blueprints, conveyors and rail (19); planners as people and traditions beyond the dead (14); reading from libraries and discoveries that need a university (15); sanitation, and trading with or settling barbarians (20); districts that grow along their roads, roads to the neighbours, roads of stone (21).
- **Gates held below their proposals:** trade that beats isolation and real specialisation (13), half of long deliveries by cart against Gate 8's baseline (16); and the seeds logged as findings (Gate 12 seeds 42 and 2026, Gate 14 seed 2026, Gate 18 seeds 7 and 99).
- **Polish:** how each system reads and feels in the game (inspector lines, overlays, chronicle wording, the advisor), the new-game screen's growing list of options, and performance on the largest maps with every system on.

Each phase's second pass is pushed and verified like any phase, with its gates rerun and any that can now be raised superseded (rule 6).

**Under way.** The economy first, as it underlies every phase: labour goes where the shortages are (workplaces rest with enough in store, food included), the planner weighs stock as well as rates and does not let one waiting choice hold back the rest, basics do not wait on newcomers who are not coming, and with seasons growth waits for bread and land. The first-year stall of every new game is gone ([log](/log.md), 2026-10-04). Homes far from a yard ask for their food two loaves at a time. With trade, a settlement trades for what its neighbour already makes instead of building its own maker, so two villages on one island grow different workshops (Gate 13 tightened). A cart goes round several homes near its first drop and brings a workshop a cartload, so half of long hauls go by cart (Gate 16 raised to its proposal). A settlement whose island has filled finds a shore for its dock, or clears one (Gate 18 seeds 31337 and 99 found colonies). Doors open straight onto planned roads and new districts start beside them (Gate 21 holds a quarter of later buildings along roads). At Kyle's call, every building can be turned to face any of four ways; the planner turns its docks to the water. Phase 22, farms that grow, followed at Kyle's call: with it, default new games keep 7 people of 84 who had left. Ox carts take the longest hauls (Phase 16), though rarely: few loads outgrow a handcart. Settlements keep feasts through the year (Phase 14; Gate 14 gains a third part), and pave their busiest roads in stone (Phase 21); scholars think of the bathhouse, which keeps homes from falling sick (Phases 15 and 20), and villagers schooled to read learn from libraries without a visitor (Phase 15); villagers have names, by their settlement's naming custom (Phase 14); and barbarians sent bread come in peace and settle (Phase 20). Villages whose land is full send settlers from 30 people, not 70 (Phase 17): default new games grew by a fifth. A town hall's planner lets a village build more at once (Phase 14). The Age of Clockwork brings the windmill, the first blueprint an age unlocks (Phase 19). Eras that unlock discoveries already in the game were tried and dropped ([log](/log.md), 2026-10-05): they wait for blueprints of their own.

# Beyond

- Tens of thousands of villagers: the sim in a Web Worker, then WebAssembly if needed.
- Shared worlds: two players' civilisations meeting on one sea (Phases 23 and 24 give a civilisation its own sea first).
- Modding: a mod is an OKF bundle of goods, blueprints and ages loaded beside the base game's.

# Rule

Phase 4 started by turning [Gate 2's scripted build order](/references/scenarios/sustain-town.ts) into the planner: if the planner cannot match the script, it is not ready. Every phase since follows the same rule: a system is ready only when a gate shows it doing unscripted what a script or the player used to do.

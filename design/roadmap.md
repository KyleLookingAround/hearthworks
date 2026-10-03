---
type: Roadmap
title: Roadmap
description: Phases from the player-placed prototype to a self-building, island-hopping civilisation, each closed by a headless gate.
tags: [roadmap]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-03T12:27:37Z }
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
| 6 | Solid ground | Solid buildings with doors, mood and supply per settlement, versioned saves, work counters | 5 | Nobody walks through walls; a save resumes exactly | Next |
| 7 | Worlds | Map types (island, landmass, coast) and sizes the player picks, one standard map for tests, a sim and renderer that scale | 6 | Every map type and size plays; 600 villagers on a large map within a work budget | Later |
| 8 | The lie of the land | Terrain, rivers, deposits, bridges, desire-path roads, surroundings in mood | 7 | Roads cut delivery time; homes stay clear of nuisance | Later |
| 9 | Village to town | Form by size, streets, a ladder of home sizes, replanning, town and district planners | 8 | A hamlet replans itself into a dense town, nobody displaced | Later |
| 10 | The steward | Player levers through the town planner, overlays, a chronicle | 9 | Each lever measurably does what it promises | Later |
| 11 | A deeper economy | Stone, clay, tools, fish, cloth; multi-input recipes; home tiers by goods; storage | 9 | A tier-three town stays supplied | Later |
| 12 | Seasons | A year: growing seasons, winter, warmth, storing food | 11 | A town lives through three winters | Later |
| 13 | Neighbours trade | Settlements swap surplus for want, on foot at first; specialisation | 11 | Two trading neighbours beat the same two in isolation | Later |
| 14 | People and traditions | Individuals: families, births, ageing, skills, apprenticeships; death and each village's own customs for it | 12 | A town grows by births alone; neighbours keep different customs | Later |
| 15 | Learning | Libraries, schools, universities; knowledge kept, taught and pursued | 14 | A library keeps a craft alive; a university speeds a discovery | Later |
| 16 | Ways to move | Carts, river boats, hubs, multi-leg deliveries | 8, 13 | Carts carry most long hauls and cut delivery time | Later |
| 17 | New settlements | Crowded towns send settlers off with goods, knowledge and customs | 16 | One settlement becomes four, unscripted | Later |
| 18 | The sea | The archipelago map type, ports, ships, exploration, colonies | 13, 17 | A colony on a second island trades back | Later |
| 19 | Ages | Eras of technology, machine tiers, crafts lost | 15, 18 | An age turns unscripted; an isolated town loses a craft | Later |
| 20 | Hardship | Fire, flood, sickness and their counters; hard laws | 12, 19 | A town weathers each hazard and three winters | Later |

Phases group into arcs: **foundations** (6 and 7), **the shape of a town** (8 to 10), **depth of life** (11 to 15: goods, seasons, trade, people and learning), **many peoples** (16 to 18) and **ages and trials** (19 and 20).

# Principles for every phase

- **Earlier gates keep their intent.** A new system is off by default where it would change a scripted scenario (as the [planner](/systems/planner.md) and [knowledge](/systems/knowledge.md) are), or the affected gates are reworked under [decision 0004](/decisions/0004-reworking-gates.md) and the change is logged.
- **Deterministic and headless.** One seed and the same commands always give the same world. Each new source of chance gets its own seeded stream, as knowledge did with `S.krng`.
- **One standard map for tests.** Gates run on the standard map: today's small island until Phase 7, then Island at medium size. Other map types and sizes are covered by the map suite (Phase 7), so every world the player can pick is known to play.
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

**Delivered:** mood and supply per settlement (with Phase 7's map types, which needed them); solid buildings with doors and door fronts; work counters in every receipt (`path_searches`, `path_fails`, `path_nodes`, `job_pairs`, `planner_spots`). Still to come: versioned saves and Gate 6.

**Builds.**
- **Solid buildings. Building tiles block walking; only a building's door tile lets people in. The tile in front of each door must stay open: placement (planner and hand) refuses anything that would cover a door front. A building nobody can reach shows "No way in" and is not served. An agent caught inside a new footprint walks out through it.
- **Mood and supply per settlement.** Each settlement has its own mood, and newcomers choose a settlement with free beds and good mood. The planner's affordability counts its own settlement's free stock.
- **Saves.** The whole state serialises, with a schema version: the random streams are plain numbers, and references become ids. The browser autosaves and can load.
- **Work counters** in every receipt: `path_nodes`, `job_pairs`, `planner_spots`.

**Gate 6 (proposed).** Two settlements, planner on, 30 game minutes. A save at 15 minutes, reloaded, finishes with the same receipt as an uninterrupted run (`save_roundtrip_match = 1`); `agents_inside_walls = 0` at every second; `max_departures: 2`; `min_mood_min: 0.6`. Work counters are recorded as the baseline for Phase 7 budgets.

**Disturbs.** Every gate, since routes change around solid buildings. [Gate 4](/gates/04-village-plans.md) is revised at the same time: its town reaches four times its population bar, so the bar rises to what the planner reliably achieves, less a margin.

**Kyle's call.** Should the player be stopped from placing a building that blocks a door, or warned and allowed?

# 7. Worlds

**Why now.** On the 56 by 40 island, two settlements first find no room at 15 to 18 minutes (one settlement at 24 to 30). Every later phase needs room, players want to choose the kind of world they build in, and both need a sim that scales.

**Delivered early, at Kyle's request:** map types (Islands, Landmass with rivers, Coast with islets, and the Lone isle as the standard), sizes (small, medium, large), the new-game screen with a live preview, settlements placed by the seed, and boats: [docks](/blueprints/dock.md) discovered when neighbours are across water, rowing boats that land on any shore, and visitors who carry knowledge across the sea. Cargo boats, river transport networks and ships remain in Phases 16 and 18. Still to come in this phase: the standard moving to medium, the work budgets, a job board and pathfinding that scale, the culling renderer, string gate parameters and the map suite gate.

**Builds.**
- **Map types as content.** Each type is an OKF concept in a new `design/maps/` folder whose frontmatter drives the generator: land shape and falloff, water level, noise scales, forest density, and where settlements may start. New types are written, not coded.
  - **Island** (today's): one landmass ringed by sea.
  - **Landmass:** land to the edges of the map, with inland lakes, forests and, from Phase 8, mountains and rivers. No sea to hem towns in.
  - **Coast:** land on one side, open sea on the other, with bays and headlands, ready for fishing (11) and ports (18).
  - **Archipelago** arrives with ships in Phase 18; offered earlier, its islands would be unreachable.
- **Map sizes** in [map](/systems/map.md) tuning: small (56 by 40, today's), medium (about 112 by 80), large (about 192 by 144), and huge once the work budgets allow it. A new game starts with two settlements on any size, so the player can watch them grow apart, trade knowledge and later goods (13); the new-game screen offers one to four.
- **The standard map:** Island at medium size, seeded like today. It is the default world in the new-game screen and the world every gate runs on.
- **A new-game screen:** pick map type, size, seed (or random) and starting settlements, with a preview of the generated land before starting. Saves (6) record the choice. "New island" becomes "New world".
- **A generator per type,** each with starting sites chosen for room, wood and water, deterministic per seed.
- **A job board that scales:** a spatial index, so a carrier scores nearby requests and offers instead of every pair.
- **Pathfinding that scales:** regions joined by portals for long trips, and paths cached between the same doors.
- **A renderer that culls:** chunked drawing of only what is on screen, and a minimap. Move the sim to a Web Worker if the frame budget demands it.
- **Gate parameters gain words.** Today a gate's parameters are numbers; map type and size become string parameters, so a receipt says which world it ran on.

**Gate 7 (proposed).** Two parts.
- **Scale:** Island at large size, four settlements, 60 game minutes, no build calls: `min_peak_villagers: 600`, departures under 1% of peak, `min_mood_min: 0.6`, and every work counter per game minute within its budget. Budgets are set from the measured run plus headroom, then tightened as the code improves.
- **Map suite:** every map type at every size on three seeds. Each run must find a starting site for every settlement and, with the planner on for 15 game minutes, end with every settlement fed and no departures. (`suite_failures = 0`.)

**Disturbs.** Every gate moves to the standard map. Gates whose intent survives the bigger map are revised in place (new defaults and re-measured thresholds); a gate whose scripted layout no longer makes sense there is superseded under [decision 0004](/decisions/0004-reworking-gates.md). The old small-island versions stay runnable by name.

**Kyle's call.** The standard map's size; the large and huge sizes; which further map types are worth having (highlands, river delta, a desert edge once climate exists); and how many settlements a new game starts with on each size.

# 8. The lie of the land

**Why now.** On bigger maps and the landmass type, distance and terrain start to matter, and they shape everything in Phase 9.

**Builds.**
- **Terrain on every map type:** height with slope slowing walkers, rivers that block walking, and deposits (fertile soil, stone, clay, fishing water) that buildings must sit on or near. Deposits sit unused until Phase 11 gives them goods.
- **Bridges**, discovered when a river keeps people from somewhere they need to go (a knowledge `need` for detours).
- **Desire paths.** Tiles accumulate wear from feet; the planner paves the worn ones, so roads follow real traffic.
- **Surroundings in mood.** Each home scores its surroundings from blueprint fields: `nuisance: { radius, amount }` on workplaces such as the sawmill, and `amenity` from trees, water and gardens; crowding and building sites count against. Settlement mood blends being fed with surroundings, and the planner keeps homes away from nuisance.

**Gate 8 (proposed).** A standard-map seed with a river, run twice, with road planning on and off: on cuts `mean_delivery_seconds` by at least 15%. In the "on" run, a bridge is discovered and built, `homes_in_nuisance = 0`, and `min_fed_min: 0.6`.

**Disturbs.** Mood changes meaning, so gates 2, 4, 5 and 6 would drop for reasons unrelated to what they test. Receipts gain `fed_min`, the hunger part of mood alone, and those gates' welfare checks are revised from `mood_min` to `fed_min`, which keeps their intent ("nobody goes hungry").

# 9. Village to town

**Why now.** It needs land with a shape (8), solid buildings (6) and a planning cost that is measured (6, 7).

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

**Gate 9 (proposed).** Standard map, one settlement, 60 game minutes:
- `min_blocks_replanned: 1`;
- homes per built tile at the end at least 1.5 times the hamlet's;
- `min_districts: 3`;
- `max_demolition_departures: 0`;
- `min_fed_min: 0.6`;
- `planner_spots` per game minute within budget.

**Disturbs.** Gate 4, if the planner's single-town behaviour changes: revise it, keeping its intent of matching the script with no build calls.

# 10. The steward

**Why now.** The vision says the player steers rather than places. With town and district planners in place, there is something to steer, so levers should not wait for the end.

**Builds.**
- **Levers through the town planner:**
  - **priorities:** rank shortages;
  - **zoning:** paint a district's purpose, or no-build land;
  - **encouragement:** back a line of inquiry to make a discovery likelier;
  - **pace:** how much the planner builds at once.
  - Hand placement stays.
- **Overlays:** mood, nuisance, districts, traffic and coverage.
- **A chronicle:** each settlement's history as it happens (founded, invented, taught, forgotten, replanned), readable in game and exportable as an OKF log. The tutorial goals give way to an advisor that points at what the chronicle shows.

**Gate 10 (proposed).** A paired scenario per lever. Zoning keeps at least 90% of farms in the farm zone; raising a priority moves that need's first relief earlier; encouragement brings a discovery earlier on at least five of six internal seeds. Also: every invention, teaching and forgetting appears in the chronicle.

# 11. A deeper economy

**Why now.** Deposits exist (8) and towns have room for workshops (9). The planner needs richer choices, and home tiers need goods.

**Builds.**
- **New goods:** stone, then cut stone; clay, then bricks; iron ore, then tools; fish; flax, then cloth.
- **Multi-input recipes.** Tools wear out and speed up the work that uses them.
- **Home tiers by goods,** separate from size: a tier-one home needs bread, tier two adds fish or cloth, tier three adds tools. Mood rewards variety.
- **Storage:** granaries, a woodyard and warehouses with capacity; some goods spoil when left out.
- **Planner chains** several steps deep, with upgrades planned alongside new buildings.

**Gate 11 (proposed).** Standard map, one settlement, 60 game minutes: at least 20% of homes at tier three; every tier's homes stocked at least 90% of the time; departures and `fed_min` at Gate 2's level.

# 12. Seasons

**Why now.** Seasons reshape the food economy. Added late, they would mean rebalancing everything built since, so they come straight after the economy deepens.

**Builds.** A year of tuned length: crops grow from spring to autumn and are harvested; winter needs firewood for warmth and stored food. Granaries and preserved food (smoked fish) earn their place. The planner forecasts winter demand, and mood has a seasonal part.

**Gate 12 (proposed).** Three game years on the standard map: no starvation, at most 2% departures, and food in store at the first frost covering at least the winter's need.

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

**Gate 13 (proposed).** Two settlements on the standard map, run with trade on and off. With trade on: total population is higher, each settlement's `fed_min` is at least as good, and each settlement exports at least 30% of one good it makes.

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

**Kyle's call.** Tone of death and ageing in a cosy game (old age only, shown gently?), and which burial customs fit the game's feel.

# 15. Learning

**Why now.** People with skills (14) and knowledge that can be lost (5) make keeping and teaching knowledge worth building for.

**Builds.**
- **Libraries.** A library holds the settlement's knowledge in the world: what it holds is not forgotten while the library stands, and scribes copy its records for neighbours. The record format is the knowledge bundle from Phase 5, so a library's shelves can be browsed in game. A village thinks of the library after it loses knowledge it needed.
- **Schools.** Children who go to school learn trades faster as apprentices, and read, so they can learn from a library without a visitor.
- **Universities.** Scholars pursue a line of inquiry: invention under strain becomes likelier and faster, and some discoveries need a university at all. The steward's "encourage a line of inquiry" lever (10) acts through them.
- **Gate 15 (proposed).** Two paired scenarios. With a library, a settlement keeps a craft through a long spell without using it that loses the craft without one. With a university, a discovery comes earlier on at least five of six internal seeds.

# 16. Ways to move

**Why now.** Distances are real (7, 8), trade (13) makes long hauls routine, and they are visibly slow.

**Builds.** Vehicles as blueprints, each with a capacity, a speed and the surfaces it can use: handcarts, ox carts, and river boats between jetties. The job board plans multi-leg deliveries through hubs and warehouses. Carts are discovered under distance strain and boats under river strain, and spread by the existing knowledge rules.

**Gate 16 (proposed).** Landmass at large size, where distances are longest: carts discovered unscripted; at least 50% of deliveries over a set distance go by cart; `mean_delivery_seconds` below the Gate 8 baseline.

# 17. New settlements

**Why now.** Daughter towns need room (7), transport to stay in touch (16), and people to send (14).

**Builds.** A crowded town, or one short of land or a deposit, sends a founding party with villagers, part of the stores, its knowledge minus the crafts it never practised, and its customs. The party scores sites for land, deposits, water and distance from rivals, then walks there. Daughter towns keep visiting and trading with their mother town, and their customs drift.

**Gate 17 (proposed).** Landmass at large size, one settlement at the start, 90 game minutes: at least four settlements, unscripted, each fed and growing.

# 18. The sea

**Why now.** It needs trade (13), new settlements (17) and boats (16) to grow from.

**Builds.** The archipelago map type (a concept in `design/maps/`, like the others), with shallows, reefs and open sea. Docks, shipyards, ships with crews, and sea routes. Explorers chart islands the settlements have not seen. Settlers, goods and knowledge cross water only by ship, and colonies are founded overseas.

**Gate 18 (proposed).** Archipelago map at medium size: a colony is founded on a second island unscripted, survives 30 game minutes, and trades back to its mother town.

# 19. Ages

**Why now.** By here the game has enough discoveries to group into eras, universities to pursue them (15), and enough distance for an age to spread unevenly.

**Builds.**
- **Eras:** hand tools, stone and bronze, iron, wind and water mills, steam and rail. Each is a set of discoveries plus what they unlock, written as OKF concepts.
- **Machine tiers:** courier bots, then conveyors, then rail, each discovered when the tier below visibly struggles.
- **Regression:** an isolated or shrinking settlement without a library can fall back an age.

**Gate 19 (proposed).** An age turns across at least half the settlements unscripted. In a second scenario, an isolated settlement without a library loses a craft it stopped practising.

# 20. Hardship

**Why now.** It needs seasons (12), density (9) and ages that offer remedies (19), so hardship meets a civilisation able to answer it.

**Builds.**
- **Hazards and their counters:**
  - fire spreads between close wooden buildings, answered by wells and fire crews;
  - rivers flood, answered by levees;
  - sickness spreads in crowded towns, answered by healers and then sanitation.
  - Each counter is discovered under its strain.
- **The remaining laws** for the steward: rationing, working hours, who may leave.

**Gate 20 (proposed).** A planned town weathers one hazard of each kind and three winters, losing at most 10% of its people. In a paired scenario, rationing brings a town through a lean winter that kills or drives off more people without it.

**Kyle's call.** Can fire destroy buildings for good, or only damage them?

# Beyond

- Tens of thousands of villagers: the sim in a Web Worker, then WebAssembly if needed.
- Shared worlds: two players' civilisations meeting on one sea.
- Modding: a mod is an OKF bundle of goods, blueprints and ages loaded beside the base game's.

# Rule

Phase 4 started by turning [Gate 2's scripted build order](/references/scenarios/sustain-town.ts) into the planner: if the planner cannot match the script, it is not ready. Every phase since follows the same rule: a system is ready only when a gate shows it doing unscripted what a script or the player used to do.

---
type: Roadmap
title: Roadmap
description: Phases from the player-placed prototype to a self-building, island-hopping civilisation, each closed by a headless gate.
tags: [roadmap]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-03T10:38:02Z }
---

# Phases

Each phase closes when its gate passes in CI. Gates are [Attested Computations](/gates/): a sanctioned scenario runs headless and deterministic code checks the receipt. Gates for future phases are proposals: their thresholds are set when the gate is written, and Kyle has the final say on them.

| Phase | Goal | Gate | State |
| --- | --- | --- | --- |
| 1. Toy economy | Grid, building, wood chain carried by hand | [Gate 1](/gates/01-first-plank.md) | Done |
| 2. Living town | Houses, needs, bread chain, newcomers and departures | [Gate 2](/gates/02-sustain-town.md) | Done |
| 3. First automation | Courier bots on the same job board | [Gate 3](/gates/03-couriers.md) | Done |
| 4. The village plans | [Planner](/systems/planner.md) chooses and places buildings | [Gate 4](/gates/04-village-plans.md) | Done |
| 5. Knowledge | Blueprints discovered, verified by use, shared, forgotten ([knowledge](/systems/knowledge.md)) | [Gate 5](/gates/05-knowledge-spreads.md) | Done |
| 6. Room to grow | Big islands, saves, solid buildings with doors, and a sim that scales | Gate 6: 600 villagers on a large island, deterministic, within a work budget | Next |
| 7. The lie of the land | Terrain, deposits, rivers, desire-path roads; surroundings shape mood | Gate 7: planned roads cut haul cost, and homes end up away from noise | Later |
| 8. Village to town | Settlements change shape as they grow: roomy hamlets, streets and terraced rows in towns, rebuilding to fit more | Gate 8: a hamlet becomes a dense town by replanning, without anyone leaving | Later |
| 9. A deeper economy | Stone, clay, tools, fish, cloth; house tiers; more than bread | Gate 9: a three-tier town stays supplied | Later |
| 10. People | Individuals: families, births, ageing, skills | Gate 10: a town grows by births alone | Later |
| 11. Ways to move | Carts, boats on rivers, hubs and multi-leg routes | Gate 11: carts are invented under distance strain and carry most long hauls | Later |
| 12. New settlements | Towns that outgrow their land send settlers off with goods and knowledge | Gate 12: one settlement becomes four, unscripted | Later |
| 13. Trade | Traders, surplus and want, specialisation | Gate 13: trading settlements beat the same settlements in isolation | Later |
| 14. The sea | Archipelagos, ports, ships, colonies | Gate 14: a colony on a second island, trading back | Later |
| 15. Ages | Eras of technology, from hand tools to steam and rail | Gate 15: an age turns unscripted, and an unused craft is lost | Later |
| 16. Seasons and hardship | Winter, harvests, fire, flood, sickness | Gate 16: a town lives through three winters | Later |
| 17. The steward | What the player controls: laws, priorities, zones, a chronicle | Gate 17: each lever measurably changes the outcome it promises | Later |

# Principles for every phase

- **Earlier gates keep passing.** A new system is off by default or kept separate from scripted scenarios, the way the [planner](/systems/planner.md) and [knowledge](/systems/knowledge.md) are.
- **Deterministic and headless.** One seed and the same commands always give the same world. Each new source of chance gets its own seeded stream, as knowledge did with `S.krng`.
- **A work budget, not a stopwatch.** Gates count deterministic work (path nodes expanded, job-board pairs scored, per game minute) instead of wall-clock time, which varies between CI machines. A budget metric goes in every gate from Phase 6 on.
- **Everything moves, and nothing is named in code.** New goods, buildings, vehicles and eras are written as OKF concepts in `design/`. The planner and job board read their fields, so a new blueprint joins in by being written.
- **Machines earn their place.** Every new tier is discovered under a strain the player can see (hauling, distance, cold, crowding), never unlocked on a timer.
- **Phone and desktop.** The browser shell stays playable on a phone as the world grows.

# 6. Room to grow

The island is 56 by 40 tiles, and two villages fill it in about 15 to 30 minutes. Every later phase needs room, so the sim has to scale first.

- **Bigger maps.** Map size, island shape and resource density become tuning; the generator learns larger landmasses, bays and inland forests. Target: 192 by 144 tiles.
- **Scaling the sim.**
  - A spatial index for the job board, so a carrier scores nearby requests and offers instead of every pair.
  - Cached and hierarchical pathfinding: regions with portals, and paths reused between the same doors.
  - Per-settlement mood and supply, not island-wide.
  - A chunked renderer that draws only what is on screen.
- **Solid buildings.** Buildings block walking; only the door tile lets people in, and the tile in front of every door must stay open. A door that cannot be reached shows "No way in" and its building stops being served. Villagers route around blocks instead of through them, which makes street layout matter (Phase 8). This is also when pathfinding is rebuilt, so it belongs here.
- **Saves.** State serialises (the random streams are plain numbers), and a save and reload gives a byte-identical receipt. Autosave in the browser.
- **Gate 6.** Four settlements, 60 game minutes on the large map, no build calls:
  - peak villagers of at least 600;
  - path nodes and job-board pairs per game minute within a budget;
  - a save at 30 minutes, reloaded, gives the same receipt as an uninterrupted run;
  - no agent ever stands inside a building other than at its door.

# 7. The lie of the land

- **Terrain matters.**
  - Hills and slopes slow walkers.
  - Rivers block walking until a bridge is built.
  - Fertile soil, stone outcrops, clay pits and fishing water are deposits that buildings must sit on or near.
- **Desire paths.** Tiles that many feet cross get worn. Once wear passes a threshold the planner proposes paving them, so road networks grow out of real traffic instead of being drawn. Bridges are blueprints discovered when a river keeps people from somewhere they need to go.
- **Surroundings shape mood.** Mood stops being only "is there bread". Each home gets a surroundings score from the tiles around it:
  - **good:** trees and greenery, water, gardens, later parks and wells;
  - **bad:** nuisance from workplaces (a sawmill's noise, later a smithy's smoke and a tannery's smell), crowding, and the bare ground of a construction site;
  - which blueprints are a nuisance, how far it carries and which add amenity are fields on the blueprint, like everything else.
  A settlement's mood blends how well it is fed with how pleasant its homes are, and newcomers weigh both. The planner then keeps homes upwind of industry and next to trees, so districts appear for a reason.
- **District planning.** The planner learns zones (a farm belt, a workshop quarter, homes near the bakeries), so towns get a shape and not just a spread.
- **Gate 7.** The same seed and settlement run twice, with road planning on and off. Pass when road planning lowers mean delivery time by a set share and the network stays connected to every workplace. In the same run, no home sits within nuisance range of a workplace, and mood stays at Gate 2's level with surroundings counted.

# 8. Village to town

A settlement's form should follow its size. A hamlet is roomy; a town packs houses into rows along streets, because walking time and land start to matter more than space.

- **Settlement form by size.**
  - **Hamlet** (a few dozen people): today's rule, a ring of open land around every building, with yards and gardens that count as amenity.
  - **Village:** houses may share a side wall in pairs; workplaces keep their ring.
  - **Town:** streets first. The planner lays a street grid ahead of growth and fills blocks with terraced rows of houses whose doors face the street, backs to back. Workshops sit on their own blocks.
  - The thresholds and widths are tuning in the planner's concept.
- **Replanning.** When the planner finds no room, it may replace low-density buildings in good spots with denser ones, but only by these rules:
  - **Re-house first.** A home is demolished only when its residents already have beds elsewhere, so nobody leaves because of a rebuild.
  - **Never the last.** It never demolishes the last building of a kind, or one still paying for itself; a building must also be older than a set age.
  - **Salvage.** Demolition returns a share of the building's cost as goods, carried away like any other.
  - **Plan the block, then rebuild it.** A replan is one decision covering the whole block, with its own priority, so the planner doesn't tear down and rebuild one house at a time.
- **Density has a price.** Rows are close and quick to walk, but crowding lowers the surroundings score (Phase 7) and, once fire exists (Phase 16), fire spreads along a row. Parks, gardens and wells earn their place in dense towns.
- **Gate 8.** A seed that grows past the hamlet size runs 60 game minutes on the large map. Pass when:
  - at least one block of the old hamlet is demolished and rebuilt denser;
  - the settlement ends with more homes per tile of built land than it had as a hamlet;
  - no departures are caused by demolition, and mood stays at Gate 2's level.

# 9. A deeper economy

- **New goods and chains:**
  - stone to a quarry, then a mason;
  - clay to bricks;
  - iron ore to tools at a smithy;
  - fish at a fishery;
  - flax to cloth.
- **Recipes with several inputs**, and tools that wear out and speed up work.
- **House tiers.** Huts become houses, then townhouses. Each tier needs more goods (bread and fish, then cloth, then tools in the workshop) and holds more people. Mood draws on variety, not just one staple.
- **Storage that counts.** Granaries, a woodyard and warehouses with capacity; goods spoil when left out.
- **Planner depth.** It weighs chains several steps long, and plans upgrades as well as new buildings.
- **Gate 9.** A town reaches its third house tier and keeps every tier supplied for 30 minutes, with departures and mood thresholds in the style of Gate 2.

# 10. People

- **Individuals.** Every villager has an age, a home, a family and a skill per trade that rises with practice. Workers are assigned by skill, and experts are slower to replace.
- **Life cycle.** Couples have children when the town is fed and housed; children grow up, the old retire and die. Newcomers still arrive, but growth no longer depends on them.
- **Skills are knowledge too.** A master's craft is part of the settlement's knowledge. A town whose last smith dies risks forgetting the smithy.
- **Gate 10.** With newcomers turned off, a town grows by births for 60 game minutes, ends with at least one expert in each of its trades, and stays fed.

# 11. Ways to move

- **Vehicles as blueprints.** Handcarts carry more on roads; ox carts more again. River boats run between jetties, and canals come later. Each has a capacity, a speed and the surfaces it can use.
- **Hubs and legs.** The job board plans multi-leg deliveries: a carrier takes goods to a cart stop, a cart takes them across town, a carrier finishes the trip. Warehouses become transfer points.
- **Discovery by strain.** Carts are invented when deliveries are long, and boats when a river lies between producers and the people who need their goods. The existing [knowledge](/systems/knowledge.md) rules carry them between settlements.
- **Gate 11.** On the large map, carts are discovered unscripted and carry most deliveries over a set distance, and mean delivery time beats the Phase 7 baseline.

# 12. New settlements

- **Splitting off.** A town short of land, trees or fertile soil sends a founding party: villagers, a share of the stores, and a copy of its knowledge (founders know what their parents knew, minus what they never practised).
- **Choosing a site.** The settlers score candidate sites for land, deposits, water and distance from rivals, then walk there. Daughter towns keep visiting and sharing knowledge.
- **Gate 12.** From one settlement on the large map, at least four exist after 90 game minutes, unscripted, and every one is fed and growing.

# 13. Trade

- **Surplus and want.** Each settlement knows what it has spare and what it lacks. Traders carry goods between settlements by road, cart or boat, and are paid in goods (barter first; money is a discovery).
- **Specialisation.** A town near the quarry ends up exporting stone, and a fishing town ends up exporting fish. The planner weighs trade as a way to relieve a shortage alongside building.
- **Gate 13.** The same three settlements run with trade on and off. Pass when trade raises total population and every town's mood, and at least two towns export a large share of one good.

# 14. The sea

- **Archipelagos.** The map generator makes island groups, with shallows, reefs and open sea.
- **Ports and ships.** Docks, shipyards and ships with crews; sea routes; explorers who chart unknown islands. Knowledge, settlers and goods cross water only by ship.
- **Colonies.** A settlement with ships and a reason (land, a deposit, a crowded home) founds a colony overseas.
- **Gate 14.** A colony is founded on a second island unscripted, survives, and trades back to its mother town.

# 15. Ages

- **Eras of technology.** Discoveries cluster into ages, for example the age of wood and hand tools, of stone and bronze, of iron, of wind and water mills, and of steam and rail. An age is a set of discoveries plus what they unlock (vehicles, buildings, machines), all written as OKF concepts.
- **Machines tier up.** Courier bots lead to conveyors, then rail, each discovered when the tier below visibly struggles.
- **Loss is real.** Unused crafts are forgotten, and an isolated or shrinking settlement can fall back an age.
- **Gate 15.** An age turns unscripted across a set of settlements, and in a separate scenario an isolated settlement loses a craft it stopped practising.

# 16. Seasons and hardship

- **Seasons.** Crops grow in summer and stop in winter; winter needs firewood and stored food. Granaries and preserved goods become choices that matter.
- **Hazards.** Fire spreads between close wooden buildings, so a hamlet's gaps and a town's firebreaks have a reason (Phase 8), rivers flood, and sickness spreads in crowded towns. Each has a counter to discover: wells and fire crews, levees, healers and then sanitation.
- **Gate 16.** A planned town lives through three winters and one hazard of each kind without losing a set share of its people.

# 17. The steward

- **Levers, not placement.**
  - Laws (rationing, working hours, who may leave).
  - Priorities (which shortage comes first).
  - Zoning (where the planner may build).
  - Encouragement (fund a line of inquiry and make a discovery more likely).
  - Hand placement stays available.
- **A chronicle.** Each settlement's history is written as it happens, an OKF log of the civilisation: founded, invented, taught, forgotten, flooded, colonised. Readable in the game, exportable as a bundle.
- **Gate 17.** For each lever, a paired scenario shows it changes the outcome it promises (rationing gets a town through a lean winter, zoning keeps farms on fertile soil) without breaking earlier gates.

# Beyond

- Tens of thousands of villagers: the sim in a Web Worker, then in WebAssembly if needed.
- Shared worlds: two players' civilisations meeting on one sea.
- Modding: a mod is an OKF bundle of blueprints, goods and ages loaded beside the base game's.

# Rule

Phase 4 started by turning [Gate 2's scripted build order](/references/scenarios/sustain-town.ts) into the planner: if the planner cannot match the script, it is not ready. [Gate 4](/gates/04-village-plans.md) holds it to Gate 2's thresholds with no build calls at all, and it passes on every swept seed (see the [log](/log.md)). Every later phase follows the same rule: a system is ready only when a gate shows it doing unscripted what a script or the player used to do.

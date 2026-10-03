---
type: Roadmap
title: Roadmap
description: Phases from the player-placed prototype to a self-building, island-hopping civilisation, each closed by a headless gate.
tags: [roadmap]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-03T10:32:37Z }
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
| 6. Room to grow | Big islands, saves, and a sim that scales | Gate 6: 600 villagers on a large island, deterministic, within a work budget | Next |
| 7. The lie of the land | Terrain, deposits, rivers; villagers lay roads where they walk | Gate 7: planned roads cut haul cost against the same town without them | Later |
| 8. A deeper economy | Stone, clay, tools, fish, cloth; house tiers; more than bread | Gate 8: a three-tier town stays supplied | Later |
| 9. People | Individuals: families, births, ageing, skills | Gate 9: a town grows by births alone | Later |
| 10. Ways to move | Carts, boats on rivers, hubs and multi-leg routes | Gate 10: carts are invented under distance strain and carry most long hauls | Later |
| 11. New settlements | Towns that outgrow their land send settlers off with goods and knowledge | Gate 11: one settlement becomes four, unscripted | Later |
| 12. Trade | Traders, surplus and want, specialisation | Gate 12: trading settlements beat the same settlements in isolation | Later |
| 13. The sea | Archipelagos, ports, ships, colonies | Gate 13: a colony on a second island, trading back | Later |
| 14. Ages | Eras of technology, from hand tools to steam and rail | Gate 14: an age turns unscripted, and an unused craft is lost | Later |
| 15. Seasons and hardship | Winter, harvests, fire, flood, sickness | Gate 15: a town lives through three winters | Later |
| 16. The steward | What the player controls: laws, priorities, zones, a chronicle | Gate 16: each lever measurably changes the outcome it promises | Later |

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
- **Saves.** State serialises (the random streams are plain numbers), and a save and reload gives a byte-identical receipt. Autosave in the browser.
- **Gate 6.** Four settlements, 60 game minutes on the large map, no build calls:
  - peak villagers of at least 600;
  - path nodes and job-board pairs per game minute within a budget;
  - a save at 30 minutes, reloaded, gives the same receipt as an uninterrupted run.

# 7. The lie of the land

- **Terrain matters.**
  - Hills and slopes slow walkers.
  - Rivers block walking until a bridge is built.
  - Fertile soil, stone outcrops, clay pits and fishing water are deposits that buildings must sit on or near.
- **Desire paths.** Tiles that many feet cross get worn. Once wear passes a threshold the planner proposes paving them, so road networks grow out of real traffic instead of being drawn. Bridges are blueprints discovered when a river keeps people from somewhere they need to go.
- **District planning.** The planner learns zones (a farm belt, a workshop quarter, homes near the bakeries), so towns get a shape and not just a spread.
- **Gate 7.** The same seed and settlement run twice, with road planning on and off. Pass when road planning lowers mean delivery time by a set share and the network stays connected to every workplace.

# 8. A deeper economy

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
- **Gate 8.** A town reaches its third house tier and keeps every tier supplied for 30 minutes, with departures and mood thresholds in the style of Gate 2.

# 9. People

- **Individuals.** Every villager has an age, a home, a family and a skill per trade that rises with practice. Workers are assigned by skill, and experts are slower to replace.
- **Life cycle.** Couples have children when the town is fed and housed; children grow up, the old retire and die. Newcomers still arrive, but growth no longer depends on them.
- **Skills are knowledge too.** A master's craft is part of the settlement's knowledge. A town whose last smith dies risks forgetting the smithy.
- **Gate 9.** With newcomers turned off, a town grows by births for 60 game minutes, ends with at least one expert in each of its trades, and stays fed.

# 10. Ways to move

- **Vehicles as blueprints.** Handcarts carry more on roads; ox carts more again. River boats run between jetties, and canals come later. Each has a capacity, a speed and the surfaces it can use.
- **Hubs and legs.** The job board plans multi-leg deliveries: a carrier takes goods to a cart stop, a cart takes them across town, a carrier finishes the trip. Warehouses become transfer points.
- **Discovery by strain.** Carts are invented when deliveries are long, and boats when a river lies between producers and the people who need their goods. The existing [knowledge](/systems/knowledge.md) rules carry them between settlements.
- **Gate 10.** On the large map, carts are discovered unscripted and carry most deliveries over a set distance, and mean delivery time beats the Phase 7 baseline.

# 11. New settlements

- **Splitting off.** A town short of land, trees or fertile soil sends a founding party: villagers, a share of the stores, and a copy of its knowledge (founders know what their parents knew, minus what they never practised).
- **Choosing a site.** The settlers score candidate sites for land, deposits, water and distance from rivals, then walk there. Daughter towns keep visiting and sharing knowledge.
- **Gate 11.** From one settlement on the large map, at least four exist after 90 game minutes, unscripted, and every one is fed and growing.

# 12. Trade

- **Surplus and want.** Each settlement knows what it has spare and what it lacks. Traders carry goods between settlements by road, cart or boat, and are paid in goods (barter first; money is a discovery).
- **Specialisation.** A town near the quarry ends up exporting stone, and a fishing town ends up exporting fish. The planner weighs trade as a way to relieve a shortage alongside building.
- **Gate 12.** The same three settlements run with trade on and off. Pass when trade raises total population and every town's mood, and at least two towns export a large share of one good.

# 13. The sea

- **Archipelagos.** The map generator makes island groups, with shallows, reefs and open sea.
- **Ports and ships.** Docks, shipyards and ships with crews; sea routes; explorers who chart unknown islands. Knowledge, settlers and goods cross water only by ship.
- **Colonies.** A settlement with ships and a reason (land, a deposit, a crowded home) founds a colony overseas.
- **Gate 13.** A colony is founded on a second island unscripted, survives, and trades back to its mother town.

# 14. Ages

- **Eras of technology.** Discoveries cluster into ages, for example the age of wood and hand tools, of stone and bronze, of iron, of wind and water mills, and of steam and rail. An age is a set of discoveries plus what they unlock (vehicles, buildings, machines), all written as OKF concepts.
- **Machines tier up.** Courier bots lead to conveyors, then rail, each discovered when the tier below visibly struggles.
- **Loss is real.** Unused crafts are forgotten, and an isolated or shrinking settlement can fall back an age.
- **Gate 14.** An age turns unscripted across a set of settlements, and in a separate scenario an isolated settlement loses a craft it stopped practising.

# 15. Seasons and hardship

- **Seasons.** Crops grow in summer and stop in winter; winter needs firewood and stored food. Granaries and preserved goods become choices that matter.
- **Hazards.** Fire spreads between close wooden buildings (the planner's gaps now have a reason), rivers flood, and sickness spreads in crowded towns. Each has a counter to discover: wells and fire crews, levees, healers and then sanitation.
- **Gate 15.** A planned town lives through three winters and one hazard of each kind without losing a set share of its people.

# 16. The steward

- **Levers, not placement.**
  - Laws (rationing, working hours, who may leave).
  - Priorities (which shortage comes first).
  - Zoning (where the planner may build).
  - Encouragement (fund a line of inquiry and make a discovery more likely).
  - Hand placement stays available.
- **A chronicle.** Each settlement's history is written as it happens, an OKF log of the civilisation: founded, invented, taught, forgotten, flooded, colonised. Readable in the game, exportable as a bundle.
- **Gate 16.** For each lever, a paired scenario shows it changes the outcome it promises (rationing gets a town through a lean winter, zoning keeps farms on fertile soil) without breaking earlier gates.

# Beyond

- Tens of thousands of villagers: the sim in a Web Worker, then in WebAssembly if needed.
- Shared worlds: two players' civilisations meeting on one sea.
- Modding: a mod is an OKF bundle of blueprints, goods and ages loaded beside the base game's.

# Rule

Phase 4 started by turning [Gate 2's scripted build order](/references/scenarios/sustain-town.ts) into the planner: if the planner cannot match the script, it is not ready. [Gate 4](/gates/04-village-plans.md) holds it to Gate 2's thresholds with no build calls at all, and it passes on every swept seed (see the [log](/log.md)). Every later phase follows the same rule: a system is ready only when a gate shows it doing unscripted what a script or the player used to do.

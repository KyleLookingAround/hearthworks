---
type: Decision
title: "0006: How the parts work together"
description: A review of the whole game after the first pass, and a plan in stages to make its code plainer and its systems pay their way where the player can see them; first code that leaves every run unchanged, then design changes, each measured.
tags: [decision, architecture, design, process]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-06T02:56:59Z }
sources:
  - id: kyle-rethink
    resource: conversation with Kyle on 2026-10-06
    title: Kyle asks for the parts to be reconsidered together, with leave to refactor or redesign
    author: human:kyle
  - id: kyle-go
    resource: conversation with Kyle on 2026-10-06
    title: Kyle takes the recommendations on the four questions
    author: human:kyle
---

# Context

Twenty-two phases were each built on the last, one system at a time. Kyle asked for the whole to be reconsidered, with leave to refactor or redesign it.[^kyle-rethink] This record is the review and the plan. Kyle took its recommendations on the four questions it raised.[^kyle-go]

The review looked at the code (tick order, options, coupling, hidden state), the planner, what the player sees (screenshots on desktop and phone, early and at 45 minutes), and the play itself. The play was measured on default new games (Islands M, two settlements, every system on, an hour, the twelve usual seeds), with each option switched off alone on seven seeds, the levers tried on three to five, and where villagers' time goes sampled on two. One draw of a world's luck moves its villagers by about 15 (1 SD; up to 40), so the ablation means carry a standard error of 4 to 16.

# What the review found

## The code

- **Everything imports everything.** Sixteen of the sim's modules form one import cycle, tied together by `world.ts`. It holds pure helpers used everywhere (`bp` 195 uses in 17 files, `door`, `chronicle`), world generation, the building lifecycle, founding towns and seasons.
- **The tick order is implicit.** `tick.ts` calls a dozen systems by hand, each on its own clock. Caches keyed on `S.t` are filled by whichever system asks first, so moving a call can change a run even when no system changed.
- **Options are spelled six times and checked in a hundred places.** Eleven on/off options each appear in the types, `WorldOptions`, `createState`, save, load and the new-game screen. Seasons is checked in 27 places, people in 28, farms in 18 and ships in 16. Gates mostly run with options off, so **the all-on default game is barely covered by any gate.**
- **The planner is 1,360 lines in one file,** and other systems read it through its status line: settling decides a settlement is crowded with `/^No room/`, and roads and belts overwrite the line. It also names buildings and goods it says it doesn't, and holds a dozen numbers that belong in tuning.
- **State is shared by hand.** Rehoming a villager is written three times, sending someone on a trip by boat four times, and resetting a building to a site once by hand in hardship. About twenty module-level caches are invalidated by hand. The job board is a module global. A game loaded from a save ends the same but counts different work (`world.work.pathNodes`), because remembered failed searches are not saved.
- **The UI writes sim state directly,** with no command layer.
- **CI runs every gate twice** (13m51s in tests, then 12m30s again for the report).

## The play

- **What earns its place in people:**
  - Settling is the growth engine: off, a world has 56 fewer villagers (−29%).
  - Seasons are the strongest single effect in the game: off, a world has 176 *more* villagers and nearly twice the newcomers.
  - Farms that grow add 31 villagers and lift mood by a tenth.
  - Hardship costs 12, all of it fire, flood and sickness.
- **What doesn't move anything measurable:**
  - trade (65 loads an hour, villagers +2 with it off);
  - carts, charts, ships and planned roads (each within ±2);
  - people (−8, though without it the ages stall, so there are no belts or universities).

  These systems are worth keeping, but they don't yet change a village's fortunes.
- **Systems that undo or idle each other:**
  - **Barbarians never come.** Camps are placed by straight-line reach on islands they cannot walk from: 5.4 camps a game, 1 raid in 12 games, no gifts, no watchtower or palisade ever built.
  - **Trade doesn't answer shortages.** At 45 minutes on seed 1847, eight of Hearth's workshops need iron ore that Brook holds 121 of.
  - **Shipyards rest while people wait for boats.** They are idle 80% of the time, because the fleet follows population, while 78 trips a game are refused for want of a boat.
  - **Food spoils with no granary.** 272 goods spoil a game, yet the granary, smokehouse, warehouse and stone road are never built.
  - **Conveyors cost more CPU than the goods they carry.** They move 9% of goods for 17% of the CPU.
- **The player has little to steer:**
  - Default games end the hour fed: the world's fed share is 1.00 on eleven seeds of twelve, and nobody starves.
  - Pace is the only lever with a clear effect (+16 brisk, −50 unhurried).
  - Priorities change nothing measurable: beds set to First moved −5.
  - Laws trade people for mood.
  - The advisor repeats the same two tips for half an hour.
- **The player can't see why:**
  - The goods bar sums every settlement's stores, which hides the shortages trade should solve.
  - "No worker free" is shown on workplaces deliberately resting with enough in store (80% of such sightings), while a sixth of villagers are idle carriers.
  - The planner says "No hands free" in a village with 31 carriers out of 61.
  - Ages flip within ten minutes of a hamlet's founding, so they don't feel like milestones.
  - The build bar offers buildings no settlement has thought of.
  - The menu drawer overflows the screen on desktop and phone.

# Decision (proposed)

Reshape the game around three ideas:

1. **The settlement is the unit of play.** What a player reads, steers and is told is about one settlement at a time: its stores, its people, what it wants next and what stands in the way. Systems serve that: trade answers a settlement's shortages, ships go where people wait, raiders reach the settlements in range.
2. **The planner keeps one wish list.** Each look produces a scored list of what the settlement needs, the building each need calls for, and a verdict (going ahead, saving, no room, no hands, trading for it). Roads, conveyors, districts, renewal and replanning compete on that list like any need, with the same costs and confirmation, and food comes first everywhere. Other systems read verdicts, not status text, and the player sees the list.
3. **Every system pays its way where the player can see it.** A system that never changes a village's fortunes is tuned until it does, or folded into another. Pressure the player can answer (a lean winter, a raid that can land, a shortage a neighbour can fill) is what gives the levers something to push against.

# Stages

## Stage 1: code only, every run unchanged

Each step is a pure move or restructure. It must end every run identically: the full save after an hour on the twelve default seeds, plus every gate's receipt. A fingerprint script compares saves (sha256 of `saveGame`, and of a resumed run) and runs in under a minute on three seeds at 600 seconds.

1. Fingerprint script in `scripts/`. CI runs the gates once (the report printed from the tests).
2. A system schedule in `tick.ts`: an ordered table of every system, its cadence and the option that enables it, guarded at entry.
3. One options table driving types, `createState`, save, load and the new-game screen (no save change).
4. Split `world.ts`: leaf helpers with no imports (geometry, `bp`, `emit`, `chronicle`), world generation, the building lifecycle, towns. This breaks the import cycle.
5. Split `planner.ts` into `planner/` (sensing, choosing, siting, water, renewal, districts, text), keeping `planner.ts` as the entry point.
6. Lifecycle helpers: `moveHome`, `loseVillager`, `sendOnTrip` (visitor, porter, explorer, founding party), and `toSite`.
7. A command layer (`src/sim/commands.ts`) through which the UI steers: plans, zones, levers, laws, place, demolish, pause.
8. The numbers written in code moved into tuning, values unchanged (rules 1 to 5 apply), and a tuning loader that maps keys itself in place of 285 lines by hand.
9. Caches owned per state with named invalidation, the job board included. Remembered failed searches are reset where a save would lose them, so a resumed game counts the same work. Conveyors served from cached requests.

## Stage 2: design changes, each measured

Each change is measured on default new games (twelve seeds, three draws) against `main`, and on the gates it touches. Gates are reworked under rules 6 and 7 and decisions [0004](/decisions/0004-reworking-gates.md) and [0005](/decisions/0005-relaxing-gates-for-depth.md), with every loosening reported.

1. **Honest readouts** (sim-neutral, apart from status words in saves):
   - a settlement card (its own stores, fed, mood, carriers and workers, what it builds, its next wants and its blocker), with the goods bar showing the chosen settlement;
   - "Resting: enough in store" in place of "No worker free";
   - a legend for the badges and a problems list;
   - the drawer overflow fixed, labels on phone chips, faster speeds.
2. **Systems that idle, fixed as bugs:**
   - camps placed only where they can reach a settlement (by land, or by boat once that comes);
   - the fleet sized by trips refused, not by population;
   - trade answering a workplace's missing inputs as well as food;
   - spoilage weighed by the planner, so a granary or smokehouse is built where food rots.
3. **The planner's wish list** (idea 2), with the pre-emptions as candidates, a university's clearing done only once it is chosen, more than eight spots tried before "No room", and shared need keys split (carts, oxen, couriers; library, school, university, press). Touches Gates 9, 10 and 21b.
4. **Knowledge you can see:**
   - ages counted from proven, built knowledge, not from ideas a hamlet merely has;
   - progress towards the next idea shown;
   - the build bar showing what a settlement doesn't know yet, marked with what it waits on, and placeable only once known.
5. **Pressure the levers can answer:** seasons balanced so winter is lean but survivable with good steering rather than halving growth, and priorities given enough weight to change what a settlement does.
6. **A gate for the game as played:** one gate runs the default new game, so the world players get is covered, not only the scripted ones.
7. **Fewer options:** gates move to default worlds one by one, under rules 6 and 7, and options no player needs to switch become always on, their off paths retired from the sim.

## How the work is shared

Stage 1 steps 1 to 3 come first, from the coordinator, since everything else is checked with them. The `world.ts` and `planner.ts` splits touch imports across the sim, so they go one after the other on one branch, while no other branch changes the sim. The readouts (stage 2.1) touch only `src/ui/` and `src/render/` and can run beside stage 1 on their own branch. Stage 2's design changes go to workers by topic once stage 1 is on `main`.

# Kyle's calls

Kyle took the recommendation on each question the review raised.[^kyle-go]

1. **Seasons:** winter stays the main pressure of the year, but as one the player can answer (stores, rationing, priorities), not a brake that halves growth. The aim is a lean winter that good steering survives, measured against today's cost of 176 villagers a world.
2. **Options:** gates move to default worlds, and options only gates switch off are retired from the sim. The new-game screen keeps the choices that change how a world feels: seasons, hardship and settling. Trade, carts, people, farms, ships, charts and planned roads become always on.
3. **Unknown buildings:** the build bar shows them, marked with what they wait on, but a player can place one only where the settlement knows it. Knowledge stays a thing in the world.
4. **Order:** readouts and the settlement card first, beside the code-only stage, then the systems that idle, then the planner's wish list.

[^kyle-rethink]: Kyle asks for the parts to be reconsidered together, with leave to refactor or redesign
[^kyle-go]: Kyle takes the recommendations on the four questions

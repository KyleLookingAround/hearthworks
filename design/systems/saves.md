---
type: System
title: Saves
description: The whole game as versioned JSON; autosaved in the browser, downloadable, and loaded to play on exactly as if it never stopped.
tags: [saves, engine]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T19:35:38Z }
---

# Saves

A save is the whole simulation state as plain JSON (`src/sim/save.ts`):

- **Version.** Every save carries `version` (today 12: version 12 added carts (who has one out, how far each settlement's deliveries go, long hauls counted), version 11 added who went to school and each library's copying clock, version 10 added people (ages, skills, each settlement's custom and its dead waiting for their farewell), version 9 added trade, each settlement's trade ledger and what its planner wants and uses, version 8 added seasons, homes' firewood and how long a workplace has stood full, version 7 homes' comforts, tools wearing out and spoiled food, version 6 the steward's levers, zones and the chronicle, version 5 districts, streets and replanning, version 2 added the planner's memory of where it found no room, version 3 each building's "no way in" time, version 4 terrain, deposits, worn paths, bridges, being fed apart from mood and delivery times; a version 3 world loads flat, with nothing in the ground). Each later change to the state's shape raises it and adds a migration that upgrades a save of the version before, with a test that loads a fixture saved at the old version (`tests/fixtures/save-v<n>.json`). A save from a newer game than the one running is refused with a message, never half-loaded.
- **Content.** The design bundle is not saved. A save records the hash of the bundle it was made with and is loaded against the one the game runs, so a balance change applies to games already under way.
- **What goes in.** The random streams (`rng`, and `krng` for [knowledge](/systems/knowledge.md)) are plain numbers; references between agents and buildings become ids; tile grids are run-length encoded. A carrier's job can still point at a building demolished under it, so those are kept too. A small island game is about 60 KB.
- **Exact.** A loaded game plays on exactly as the original would have: [Gate 6](/gates/06-solid-ground.md) saves a two-settlement game halfway, loads it from the JSON text and requires the same end state and receipt as a game that never stopped.

In the browser the game autosaves every 20 seconds of play, when the tab is hidden or closed, and when a new world is started; the new-game screen offers **Continue** when an autosave exists. The menu can download the game as a file and load one back.

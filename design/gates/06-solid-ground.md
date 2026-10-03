---
type: Attested Computation
title: "Gate 6: solid ground"
description: Two self-planning settlements for 30 game minutes; a game saved halfway and loaded finishes identical to one that never stopped, nobody is ever inside a building's walls, and both villages thrive.
tags: [gate, roadmap, saves, settlement]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T15:06:44Z }
runtime: hearthworks-sim
computation: ../references/scenarios/solid-ground.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 1800, map: island, size: standard }
pass_when: { min_settlements: 2, min_peak_villagers: 120, min_save_roundtrip_match: 1, max_agents_inside_walls: 0, max_departures: 2, min_fed_min: 0.6, min_town_fed_min: 0.6 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [solid-ground.ts](/references/scenarios/solid-ground.ts). It founds two settlements on the standard map, each with its [planner](/systems/planner.md) on, and makes no build calls. One game runs the full time. A second game from the same seed is [saved](/systems/saves.md) halfway, turned into JSON text, loaded from that text into a fresh state and played to the end. Every second of both, it counts agents standing on a building tile that is not a door. `mood_min` is tracked after a five-minute warm-up.

# Proves

Phase 6 of the [roadmap](/roadmap.md): the ground is solid and the game can be put down and picked up.

- `save_roundtrip_match`: the loaded game ends with exactly the same state and receipt as the one that never stopped. A save that drops anything the sim reads (a random stream, a timer, a reservation) shows up as a difference here.
- `agents_inside_walls`: buildings are solid in both games, before and after loading.
- The welfare thresholds are Gate 4's and Gate 5's, and `town_mood_min` holds each settlement to the mood bar on its own, so a thriving village cannot hide a starving one.
- `save_bytes` and the work counters (`path_searches`, `path_fails`, `path_nodes`, `job_pairs`, `planner_spots`) are recorded as the baseline for Phase 7's budgets.

# Revisions

- 2026-10-03: moved to the standard map, Island at the standard size (112 by 80), named by the new `map` and `size` parameters (roadmap Phase 7). Adds `min_peak_villagers: 120` (137 to 175 on the six swept seeds). Tightened, not loosened.
- 2026-10-03: its world's size is renamed (`isle` for the 56 by 40 Lone isle, `standard` for 112 by 80), since player sizes are now S to XL. Same world, same receipts.
- 2026-10-03: welfare is held with `fed_min` and `town_fed_min` instead of `mood_min` and `town_mood_min`, as mood now blends in the homes' surroundings (roadmap Phase 8). Same bar, 0.6. The scenario's walls check no longer counts people walking on a finished bridge, whose tiles belong to the bridge.

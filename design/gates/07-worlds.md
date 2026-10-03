---
type: Attested Computation
title: "Gate 7: worlds"
description: Four self-planning settlements on an S-size island grow past 600 villagers in an hour within the work budgets, and every map type at every size a player can pick founds its settlements and feeds them.
tags: [gate, roadmap, maps, performance]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T14:06:55Z }
runtime: hearthworks-sim
computation: ../references/scenarios/worlds.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: size, type: string, required: true }
  - { name: settlements, type: integer, required: true }
  - { name: suite_seconds, type: integer, required: true }
  - { name: suite_seeds, type: integer, required: true }
defaults: { seed: 1847, seconds: 3600, size: s, settlements: 4, suite_seconds: 900, suite_seeds: 3 }
pass_when: { min_settlements: 4, min_peak_villagers: 600, max_departure_share: 0.01, min_town_mood_min: 0.6, max_path_nodes_per_min: 550000, max_job_pairs_per_min: 40000, max_planner_spots_per_min: 65000, min_suite_runs: 48, max_suite_failures: 0 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [worlds.ts](/references/scenarios/worlds.ts). It makes no build calls and has two parts.

- **Scale.** The standard map type (Island) at `size` (S, 192 by 144) with `settlements` (four) self-planning settlements for `seconds` (an hour). It reports the work counters per game minute, `departure_share` (departures over peak villagers) and `town_mood_min`, the lowest mood of any one settlement after a five-minute warm-up.
- **Map suite.** Every [map type](/systems/map.md) at every size it offers, on `suite_seeds` seeds (1847, 7, 42), each with the size's starting settlements planning for `suite_seconds` (15 minutes). A run fails if a settlement could not be founded, anyone left, nobody lives there, or a settlement ends with mood under 0.6. Failures are printed with their map, size and seed.

# Proves

Phase 7 of the [roadmap](/roadmap.md): every world the player can pick plays, and the sim scales to hundreds of villagers.

- `peak_villagers` at least 600 with `departure_share` at most 1%: four villages grow side by side without losing anyone.
- **Budgets.** The work counters per game minute stay within budget. The budgets are the first measured run (path nodes 368,597, job pairs 26,115, planner spots 43,276 per minute) plus half again, and are only ever tightened, except under [decision 0004](/decisions/0004-reworking-gates.md). Work counters are deterministic, so a budget never depends on the machine.
- `suite_failures = 0` over all 48 map runs (four types at sizes S, M, L and XL, three seeds each).

# Revisions

- 2026-10-03: map sizes renamed and enlarged at Kyle's request: the player's sizes are S (192 by 144, the old large), M, L and XL (512 by 384); the gates keep their worlds under the sizes `isle` and `standard`, which players are not offered. The scale run's world is unchanged (now named `s`). The suite now covers the four player sizes, 48 runs, and `min_suite_runs` rises from 33 to 48.

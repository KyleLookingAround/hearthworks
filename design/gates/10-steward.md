---
type: Attested Computation
title: "Gate 10: the steward"
description: Each lever does what it says in a paired run (zoning keeps farms in the farm zone, a raised priority comes first, encouragement brings a discovery sooner), and the chronicle records every invention, teaching and forgetting.
tags: [gate, roadmap, player, planner]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T16:13:36Z }
runtime: hearthworks-sim
computation: ../references/scenarios/steward.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: priority_seconds, type: integer, required: true }
  - { name: encourage_seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 1800, priority_seconds: 1200, encourage_seconds: 1800, map: island, size: standard }
pass_when: { min_farms_planned: 5, min_zone_share: 0.9, min_priority_gain_seconds: 60, min_encourage_wins: 5, max_chronicle_missing: 0, min_chronicle_lines: 2, max_departures: 2 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [steward.ts](/references/scenarios/steward.ts). It makes no build calls; it only moves the levers a player has ([planner](/systems/planner.md), the steward).

- **Zoning.** Two planning settlements on the standard map; a farm zone 24 by 29 tiles is painted beside the first settlement's storage yard, on the side away from its neighbour (a zone belongs to the nearest settlement), before the game starts. `zone_share` is the share of that settlement's farms standing wholly inside it after `seconds`.
- **Priority.** One settlement, run twice for `priority_seconds`: logs at normal priority, then at First. `priority_gain_seconds` is how much earlier the second run first plans for logs.
- **Encouragement.** One settlement on each of six internal seeds (the gate's seed first, then 7, 42, 99, 2026, 31337), run twice for `encourage_seconds`, without and with the [Courier Depot](/blueprints/depot.md) encouraged. `encourage_wins` counts seeds where the encouraged run comes up with it sooner.
- **Chronicle.** In the zoning run, `chronicle_missing` is how far the chronicle's lines of invention, teaching and forgetting fall short of the counters.

# Proves

Phase 10 of the [roadmap](/roadmap.md): the player steers rather than places, and the steering works.

- Zoning keeps at least 90% of farms in the farm zone; a raised priority is answered at least a minute sooner; encouragement brings a discovery sooner on at least five of six seeds.
- Every invention, teaching and forgetting appears in the chronicle, which exports as an OKF log.

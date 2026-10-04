---
type: Attested Computation
title: "Gate 18: the sea"
description: On an islands map a settlement founds a colony on another island unscripted; the colony lasts thirty minutes and trades back with its mother town.
tags: [gate, roadmap, settlement, water]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-04T04:52:13Z }
runtime: hearthworks-sim
computation: ../references/scenarios/sea.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: survive_seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 3600, survive_seconds: 1800, map: islands, size: m }
pass_when: { min_colonies: 1, min_colony_survived_seconds: 1800, min_porter_trips_with_mother: 5 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [sea.ts](/references/scenarios/sea.ts). One settlement plans for itself on Islands at size M for an hour of game time, with [settling](/systems/settling.md) and [trade](/systems/trade.md) on and no build calls. A colony is a daughter founded across water. The first one is followed: `colony_survived_seconds` is how long, up to `survive_seconds`, it had people in it, and `porter_trips_with_mother` counts porters crossing between it and its mother, either way.

# Proves

Phase 18 of the [roadmap](/roadmap.md), as proposed: a colony is founded on a second island unscripted, survives 30 game minutes, and trades back to its mother town.

# Revisions

- 2026-10-04: tightened in place (the second pass): `min_porter_trips_with_mother` 1 to 5. With a dock looked for around every district, standing beside worn paths, and a shore cleared when none is left, seeds 31337 and 99 (whose islands had filled before the dock was thought of) now found colonies at 27 and 29 minutes; on seeds 1847, 42, 99, 2026 and 31337 the first colony lives its half hour with 84 to 96 people and 10 to 14 porter trips with its mother. Seed 7 still founds late (at 51 minutes): it has room at home for longer, so its first daughter stays on its own island. Same scenario and intent.

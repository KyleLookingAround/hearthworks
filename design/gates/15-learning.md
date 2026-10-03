---
type: Attested Computation
title: "Gate 15: learning"
description: A library keeps a craft its settlement would otherwise forget, and a university brings a discovery sooner on at least five of six seeds.
tags: [gate, roadmap, learning, knowledge]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T19:05:12Z }
runtime: hearthworks-sim
computation: ../references/scenarios/learning.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: keep_seconds, type: integer, required: true }
  - { name: inquiry_seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, keep_seconds: 900, inquiry_seconds: 1800, map: island, size: standard }
pass_when: { min_kept_with_library: 1, max_kept_without_library: 0, min_university_wins: 5 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [learning.ts](/references/scenarios/learning.ts): two paired parts on the standard map.

- **Library.** One settlement is taught the [Courier Depot](/blueprints/depot.md) by a neighbour (scripted) and never builds one. It runs for `keep_seconds` (past `forget_after_seconds`), once with a [Library](/blueprints/library.md) standing and once without.
- **University.** One self-planning settlement with [people](/systems/people.md) on, on each of six internal seeds (the gate's seed first, then 7, 42, 99, 2026, 31337), runs for `inquiry_seconds` without and with a [University](/blueprints/university.md) standing, its scholar found like any worker. `university_wins` counts seeds where the first invention comes sooner with it.

# Proves

Phase 15 of the [roadmap](/roadmap.md), as proposed: with a library a settlement keeps a craft through a long spell without using it that it loses without one, and with a university a discovery comes earlier on at least five of six internal seeds.

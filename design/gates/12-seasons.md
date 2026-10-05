---
type: Attested Computation
title: "Gate 12: seasons"
description: A self-planning settlement grows through three years of seasons, storing enough food by the first frost, with hardly anyone leaving and nobody starving.
tags: [gate, roadmap, seasons, economy]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-05T16:33:40Z }
runtime: hearthworks-sim
computation: ../references/scenarios/seasons.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 3600, map: island, size: standard }
pass_when: { min_years: 3, min_peak_villagers: 60, min_frost_cover: 1, max_departure_share: 0.02, min_fed_min: 0.6 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [seasons.ts](/references/scenarios/seasons.ts). One settlement plans for itself on the standard map with [seasons](/systems/seasons.md) on, for three years of twenty game minutes, with no build calls. At the first frost it weighs the grain, bread and preserved food in store against the winter's meals (everyone eating for a quarter of a year): `frost_cover`. `departure_share` is departures over peak villagers; `fed_min` and `winter_mood_min` are tracked after a five-minute warm-up.

# Proves

Phase 12 of the [roadmap](/roadmap.md): seasons reshape the food economy and the planner looks ahead.

- `peak_villagers` at least 60: the settlement grows through the years rather than holding still (a hamlet that never invites anyone would get through winter trivially).
- `frost_cover` at least 1: the year's grain is stored before winter.
- `departure_share` at most 2% and `fed_min` at least 0.6, Gate 2's bar: no starvation over three winters, and no more than a brief shortage late in a winter.

# Revisions

- 2026-10-05: `min_fed_min` raised from 0.5 to 0.6 (Gate 2's bar), in place: the intent is unchanged and the gate is tighter. When the gate was made, late winters ran the stores low (seed 42 fell to 0.08); since the balanced economy and the harvest coming in ahead of other hauling while the winter store is behind, the usual twelve seeds (1 to 7, 42, 99, 1847, 2026, 31337) all pass, `fed_min` 0.77 to 0.98, frost cover 1.17 to 1.79, no departures. The other thresholds stay: frost cover's least is 1.17, and the standard island holds about 90 people, so `min_peak_villagers` 60 says what it should.

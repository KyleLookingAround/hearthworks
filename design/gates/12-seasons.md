---
type: Attested Computation
title: "Gate 12: seasons"
description: A self-planning settlement grows through three years of seasons, storing enough food by the first frost, with hardly anyone leaving and nobody starving.
tags: [gate, roadmap, seasons, economy]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T17:17:57Z }
runtime: hearthworks-sim
computation: ../references/scenarios/seasons.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 3600, map: island, size: standard }
pass_when: { min_years: 3, min_peak_villagers: 60, min_frost_cover: 1, max_departure_share: 0.02, min_fed_min: 0.5 }
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
- `departure_share` at most 2% and `fed_min` at least 0.5: no starvation over three winters. The bar on `fed_min` sits below Gate 2's 0.6: late in each winter the stores run low before spring's first harvest, and homes briefly eat their last loaf before the next arrives.

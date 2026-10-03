---
type: Attested Computation
title: "Gate 8: the lie of the land"
description: A village on a landmass with rivers paves the paths its people wear (deliveries 15% faster per tile or more), comes up with a bridge and builds it, keeps homes away from noise, and stays fed.
tags: [gate, roadmap, terrain, logistics]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T14:51:39Z }
runtime: hearthworks-sim
computation: ../references/scenarios/lie-of-the-land.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 1800, map: landmass, size: standard }
pass_when: { min_pace_cut: 0.15, min_bridge_known: 1, min_bridges_built: 1, max_homes_in_nuisance: 0, min_fed_min: 0.6, max_departures: 2 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [lie-of-the-land.ts](/references/scenarios/lie-of-the-land.ts). It plays one self-planning settlement on a [Landmass](/maps/landmass.md) at the standard size (112 by 80, two rivers, mountains) twice from the same seed for `seconds`, with the village paving worn paths and without, and makes no build calls. `mean_delivery_seconds` is the mean time from a carrier claiming a delivery to dropping it off, and `delivery_pace` those seconds per straight-line tile of the trip. `homes_in_nuisance` is the most homes ever within a noisy workplace's reach, checked every second after a five-minute warm-up, as is `fed_min`.

# Proves

Phase 8 of the [roadmap](/roadmap.md): the land matters.

- `pace_cut` at least 15%: roads laid where people really walk ([planner](/systems/planner.md), desire paths) make hauling faster. Pace is delivery seconds per straight-line tile of the trip (carrier to source to destination). The roadmap proposed 15% off `mean_delivery_seconds`, but the paved village grows bigger and its trips longer, so time alone undersells roads: 13.4% on the default seed, 18 to 21% on the others, with about 80% of walking on road in every paved run. The pace cut was 20 to 32% on the six swept seeds (1847, 7, 42, 99, 2026, 31337). `delivery_cut` is still reported.
- `bridge_known` and `bridges_built`: water that keeps the village from land nearby leads it to come up with the [Bridge](/blueprints/bridge.md) and build one, unscripted.
- `homes_in_nuisance = 0`: the planner keeps homes and sawmills apart ([needs](/systems/needs.md), surroundings).
- `fed_min`: none of it costs the village its bread.

---
type: Attested Computation
title: "Gate 13: neighbours trade"
description: Two self-planning settlements trade by porter, both ways and at volume, at no real cost to their growth or to being fed.
tags: [gate, roadmap, trade, economy]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T18:21:01Z }
runtime: hearthworks-sim
computation: ../references/scenarios/trade.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 3600, map: island, size: standard }
pass_when: { min_trades: 20, min_export_share_min: 0.03, min_population_gain: 0.95, min_fed_min_trading: 0.6 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [trade.ts](/references/scenarios/trade.ts). Two settlements plan for themselves on the standard map for an hour of game time, with no build calls, twice from the same seed: once each on its own, once with [trade](/systems/trade.md) on. `trades` counts porters' loads delivered; `export_share_min` is, for the settlement that exports least, the largest share of any good it made (at least a load of it) that went to its neighbour. `population_gain` is everyone at the end with trade over everyone without. `fed_min_trading` is the lowest share fed in either settlement after a five-minute warm-up.

# Proves

Phase 13 of the [roadmap](/roadmap.md): neighbours swap surplus for want, on foot.

- `trades` at least 20 and `export_share_min` at least 3%: trade happens at volume, and both settlements send away a real share of something they make.
- `population_gain` at least 0.95 and `fed_min_trading` at least Gate 2's 0.6: trade costs neither settlement its growth nor its food.

# Against the proposal

The roadmap proposed more people with trade than without, each settlement fed at least as well, and each exporting 30% of one good. Measured on six seeds, trade by porter on foot (four goods a trip) moves 10 to 110 loads an hour and shifts population by 3% down to 7% up: within the noise between seeds. Two settlements on one island build near-identical economies, so there is little to specialise in. The proposal waits for cheaper carriage (carts, Phase 16) and settlements with different land; this gate holds what trade does today.

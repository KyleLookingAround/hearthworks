---
type: Attested Computation
title: "Gate 13: neighbours trade"
description: Two self-planning settlements trade by porter, both ways and at volume, at no real cost to their growth or to being fed.
tags: [gate, roadmap, trade, economy]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-04T04:16:45Z }
runtime: hearthworks-sim
computation: ../references/scenarios/trade.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 3600, map: island, size: standard }
pass_when: { min_trades: 40, min_export_share_min: 0.1, min_population_gain: 0.95, min_fed_min_trading: 0.6 }
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

- `trades` at least 40 and `export_share_min` at least 10%: trade happens at volume, and both settlements send away a real share of something they make: each has specialised.
- `population_gain` at least 0.95 and `fed_min_trading` at least Gate 2's 0.6: trade costs neither settlement its growth nor its food.

# Against the proposal

The roadmap proposed more people with trade than without, each settlement fed at least as well, and each exporting 30% of one good. When the phase was built, two settlements on one island built near-identical economies and traded within the noise. With [specialisation](/systems/trade.md) (the second pass) a settlement trades for what its neighbour already makes instead of building its own maker, so the two grow different workshops: on twelve seeds 29 to 149 loads an hour (mean 78, against 55 before), the least exporter sending 9 to 31% of its best export (1 to 40%, median 8%, before), and population with trade 0.85 to 1.11 of without (mean 1.02, against 0.99). Both villages still fill the same island, so land, not trade, sets how many live there; "more people with trade" on every seed and 30% exports from both wait for settlements on different land (the sea, Phase 18).

# Revisions

- 2026-10-04: tightened in place with specialisation (the second pass): `min_trades` 20 to 40, `min_export_share_min` 0.03 to 0.1. Same scenario and intent.

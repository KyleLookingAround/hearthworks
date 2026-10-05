---
type: Attested Computation
title: "Gate 13: neighbours trade"
description: Two self-planning settlements trade by porter, both ways and at volume, at no real cost to their growth or to being fed.
tags: [gate, roadmap, trade, economy]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-05T05:41:12Z }
runtime: hearthworks-sim
computation: ../references/scenarios/trade.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
  - { name: runs, type: integer, required: false }
defaults: { seed: 1847, seconds: 3600, map: island, size: standard, runs: 3 }
pass_when: { min_trades: 40, min_export_share_min: 0.1, min_population_gain: 0.95, min_fed_min_trading: 0.6 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [trade.ts](/references/scenarios/trade.ts). Two settlements plan for themselves on the standard map for an hour of game time, with no build calls, from the same seed: each on its own, and with [trade](/systems/trade.md) on. Each side is run `runs` times on the same world, the k-th run drawing k times from the world's luck before it starts, because a village's fortunes turn on chance as much as on trade: one draw more of luck moves an hour's population on these worlds by up to a tenth either way, with or without trade. `trades` counts porters' loads delivered; `export_share_min` is, for the settlement that exports least, the largest share of any good it made (at least a load of it) that went to its neighbour. `population_gain` is everyone at the end of every run with trade over everyone at the end of every run without (`population_gain_first` is the first run's alone, as the gate measured it before). `fed_min_trading` is the lowest share fed in either settlement after a five-minute warm-up, in any run with trade. `trades`, `export_share_min` and `departures` are the first run's.

# Proves

Phase 13 of the [roadmap](/roadmap.md): neighbours swap surplus for want, on foot.

- `trades` at least 40 and `export_share_min` at least 10%: trade happens at volume, and both settlements send away a real share of something they make: each has specialised.
- `population_gain` at least 0.95 and `fed_min_trading` at least Gate 2's 0.6: trade costs neither settlement its growth nor its food.

# Against the proposal

The roadmap proposed more people with trade than without, each settlement fed at least as well, and each exporting 30% of one good. When the phase was built, two settlements on one island built near-identical economies and traded within the noise. With [specialisation](/systems/trade.md) (the second pass) a settlement trades for what its neighbour already makes instead of building its own maker, so the two grow different workshops: on twelve seeds 29 to 149 loads an hour (mean 78, against 55 before), the least exporter sending 9 to 31% of its best export (1 to 40%, median 8%, before), and population with trade 0.85 to 1.11 of without (mean 1.02, against 0.99). Both villages still fill the same island, so land, not trade, sets how many live there; "more people with trade" on every seed and 30% exports from both wait for settlements on different land (the sea, Phase 18).

Weighed over three runs a side (2026-10-05), population with trade is 0.96 to 1.12 of without on the twelve seeds (mean 1.02), more on nine of them: trade costs no settlement its growth, and pays a little. It is small on one island: porters carry about 400 goods an hour where the two villages make about 30000, half a percent of all carrying.

# Revisions

- 2026-10-05: each side is run `runs` (3) times with the luck drawn afresh, and population is weighed over them all; `fed_min_trading` is the lowest of every run. Thresholds unchanged. On one run, population with trade was 0.85 to 1.11 of without on twelve seeds, but the same spread came from one extra draw of luck without trade at all (0.83 to 1.11), so the gate measured chance. Over three runs: 0.96 to 1.12 (mean 1.02), on every seed above 0.95. Same intent; the gate takes three times as long.

- 2026-10-04: tightened in place with specialisation (the second pass): `min_trades` 20 to 40, `min_export_share_min` 0.03 to 0.1. Same scenario and intent.

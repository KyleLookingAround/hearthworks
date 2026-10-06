---
type: Attested Computation
title: "Gate 0: the game as played"
description: The default new game, exactly as the new-game screen starts it and left to itself for an hour, stays fed, grows in people and settlements, trades, reaches a second age and keeps its people.
tags: [gate, roadmap, second-pass, new-game]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-06T17:21:53Z }
runtime: hearthworks-sim
computation: ../references/scenarios/as-played.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: warmup, type: integer, required: true }
defaults: { seed: 1847, seconds: 3600, warmup: 300 }
pass_when: { max_starved: 0, min_fed_min: 0.8, min_town_fed_min: 0.7, min_villagers_grown: 150, min_settlements_founded: 1, min_trades: 30, min_top_age: 1, max_departures_share: 0.01 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [as-played.ts](/references/scenarios/as-played.ts). It starts the world the new-game screen starts by default (`newGame` in the gate kit, which `npm run fingerprint` runs too): the first map type in order (the [Islands](/maps/islands.md)) at the map tuning's game size with that size's settlements, the planner on and every option the screen offers on, and leaves it to itself for an hour of game time on the gate's seed, with no build calls, levers or laws. After a `warmup` of five minutes it notes each game second the world's share fed (`fed_min`) and the lowest share fed of any one settlement with people at home (`town_fed_min`). At the end: `starved` counts villagers who starved; `villagers_grown` is villagers at the end less those at the start; `settlements_founded` the settlements beyond the first ones; `trades` porters' loads delivered between settlements; `top_age` the highest age any settlement holds (0 is the first); `departures_share` those who left, over the peak count of villagers.

# Proves

Stage 2.6 of [decision 0006](/decisions/0006-how-the-parts-work-together.md): the game a player starts is held by a gate of its own, as every phase's scenario is, so a change that leaves every scripted gate green but spoils the default game shows here. Each threshold guards one thing a healthy default game must show, set from the twelve usual seeds (1, 2, 3, 4, 5, 6, 7, 42, 99, 1847, 2026, 31337) on 2026-10-06, with headroom no wider than their spread ([decision 0005](/decisions/0005-relaxing-gates-for-depth.md)):

- **Nobody starves** (`starved` 0; 0 on all twelve).
- **The world stays fed** (`fed_min` 0.8; 0.842 to 0.993).
- **No settlement goes hungry** (`town_fed_min` 0.7; 0.8 to 0.943 on eleven seeds). Seed 1 misses (0.246): its first settlement, Hearth, runs out of food in the last minute of the hour's third winter, a finding already logged on 2026-10-06.
- **It grows in people** (`villagers_grown` 150; 194 to 319).
- **It grows in settlements** (`settlements_founded` 1; 1 to 6).
- **Neighbours trade** (`trades` 30; 43 to 168).
- **A settlement passes its first age** (`top_age` 1; 1 to 3).
- **People stay** (`departures_share` 0.01; 0 to 0.007).

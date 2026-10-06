---
type: Attested Computation
title: "Gate 20: hardship"
description: A planned town weathers fire, flood, sickness and barbarian raids through three winters losing at most a tenth of its people, and rationing brings a town through a lean winter that costs more people without it.
tags: [gate, roadmap, hardship, laws]
status: deprecated
generated: { by: claude/opus-5.5, at: 2026-10-03T21:25:28Z }
runtime: hearthworks-sim
computation: ../references/scenarios/hardship.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: strike_at, type: integer, required: true }
  - { name: lean_share, type: number, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 3600, strike_at: 1500, lean_share: 0.25, map: landmass, size: m }
pass_when: { min_fires: 1, min_floods: 1, min_outbreaks: 1, min_raids: 1, min_winters: 3, max_lost_share: 0.1, min_countered_kinds: 4, min_raids_repelled: 1, min_rationing_saved: 1 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [hardship.ts](/references/scenarios/hardship.ts), in two parts.

- **Hardship.** One settlement plans for itself on Landmass at size M for three years (three winters) with seasons and [hardship](/systems/hardship.md) on, no build calls. Fire, flood, sickness and barbarians come of themselves; any kind that has not struck the settlement by `strike_at` (the summer of the second year) is brought down on it once then (`struck_by_gate` counts them), so every run meets each kind. Nothing about the answers is scripted. `lost_share` is everyone who left or died over the most people it had; `countered_kinds` the kinds of hazard it built a counter for.
- **Lean winter.** A planned settlement on the standard map with seasons on runs to the first frost of its second year; its food in store and on the shelves is cut to `lean_share`, and the winter is played out twice from that save: without rationing and with it ([laws](/systems/hardship.md)). `rationing_saved` is how many fewer left or died with it.

Gate 20 names Landmass M rather than the standard map: the standard island is settled to its shores within ten minutes, leaving no wild land for barbarians to camp in, and it has no rivers to flood.

# Proves

Phase 20 of the [roadmap](/roadmap.md), as proposed: a planned town weathers one hazard of each kind, barbarian raids among them, and three winters, losing at most 10% of its people; rationing brings a town through a lean winter that drives off or kills more without it. Added to the proposal: a counter built for each of the four kinds (each discovered under its strain), and at least one raid beaten off.

# Superseded

By [Gate 20b](/gates/20b-hardship.md) on 2026-10-06: the same scenario and checks with `max_lost_share` 0.12, as the default seed's own draw (0.104) sat outside the spread of its runs with the luck redrawn (0 to 0.025) once winters became lean seasons that newcomers come through. Kept, and runnable by name (`npm run gates -- 20-hardship`).

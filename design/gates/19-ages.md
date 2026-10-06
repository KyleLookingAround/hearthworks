---
type: Attested Computation
title: "Gate 19: ages"
description: An age turns across at least half the settlements unscripted, and an isolated settlement without a library falls back an age when it stops practising its crafts.
tags: [gate, roadmap, ages, knowledge]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-06T08:55:51Z }
runtime: hearthworks-sim
computation: ../references/scenarios/ages.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: keep_seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 5400, keep_seconds: 900, map: landmass, size: l }
pass_when: { min_age_share: 0.5, min_settlements: 2, min_fell_back_without_library: 1, max_fell_back_with_library: 0, min_unlocked_thought_of: 1, max_thought_of_before_age: 0 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [ages.ts](/references/scenarios/ages.ts), in two parts.

- **Spread.** One settlement plans for itself on Landmass at size L for 90 game minutes with settling, carts, trade and people on, no build calls. `age_share` is the share of the settlements at the end that are past the first age ([ages](/systems/ages.md)). `unlocked_thought_of` counts the blueprints of an era's own (the [Windmill](/blueprints/windmill.md) and the [Conveyor](/blueprints/conveyor.md)) each settlement thought of itself, and `thought_of_before_age` those it thought of before it had reached their age.
- **Regression.** One isolated settlement is taught the discoveries of the second age by a neighbour and has proven them in use, with the age's `works` standing (scripted), so it has reached the age; then its works come down and it never builds them again. It runs for `keep_seconds` without a library and again with one standing.

# Proves

Phase 19 of the [roadmap](/roadmap.md), as proposed: an age turns across at least half the settlements unscripted; an isolated settlement without a library loses crafts it stopped practising and falls back an age, and with a library it does not.

# Revisions

- 2026-10-05: eras unlock blueprints of their own (the second pass); two added checks, `min_unlocked_thought_of` 1 and `max_thought_of_before_age` 0. On seeds 1847 and 7 one settlement thought of the Windmill, in the Age of Clockwork; the other checks as before.
- 2026-10-05: the Age of Clockwork also unlocks the [Conveyor](/blueprints/conveyor.md), which counts toward `unlocked_thought_of` (2, 3 and 2 on seeds 1847, 7 and 42); no check changed.
- 2026-10-06: ages turn on knowledge proven in use with the age's works standing ([ages](/systems/ages.md)), so the regression's settlement is now scripted as having proven the second age's discoveries and raised one of its works, which then come down (before, merely being taught them put it in the age). Intent and every threshold unchanged. On the twelve usual seeds every check passes: `age_share` 0.71 to 1 (main: 1 on all, as daughters were founded straight into their mother's age), `unlocked_thought_of` 2 on each, `thought_of_before_age` 0, falls back without a library and not with one.

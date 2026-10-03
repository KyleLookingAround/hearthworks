---
type: System
title: Needs and population
description: Eating, mood, newcomers arriving and villagers leaving.
tags: [needs, population, core]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T13:41:22Z }
tuning:
  eat_every_seconds: 45
  leave_after_hungry_seconds: 30
  migrant_every_seconds: 15
  migrate_min_mood: 0.8
---

# Eating

Each resident of a [House](/blueprints/house.md) eats one unit of the house's stocked food every `eat_every_seconds`. With none on the shelf the house goes hungry; after `leave_after_hungry_seconds` one resident leaves.

# Mood

Mood is the share of villagers in fed houses: a stocked house counts fully, an empty shelf counts 0.6, a hungry house counts 0. Each settlement has its own mood; the world's mood (what gates report as `mood_min`) is the same share over everyone.

# Newcomers

Every `migrant_every_seconds` each settlement with mood of at least `migrate_min_mood` and a free bed draws a newcomer, so villages grow side by side and a world with more settlements grows faster. (Until Phase 7 one newcomer came to the whole world, which held four villages on a large island to about 450 people in an hour.)

# Next

Only food exists today. The [planner](/systems/planner.md) will need more needs (shelter quality, warmth, company) to have reasons to build.

---
type: System
title: Needs and population
description: Eating, mood, newcomers arriving and villagers leaving.
tags: [needs, population, core]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T08:15:00Z }
tuning:
  eat_every_seconds: 45
  leave_after_hungry_seconds: 30
  migrant_every_seconds: 15
  migrate_min_mood: 0.8
---

# Eating

Each resident of a [House](/blueprints/house.md) eats one unit of the house's stocked food every `eat_every_seconds`. With none on the shelf the house goes hungry; after `leave_after_hungry_seconds` one resident leaves.

# Mood

Mood is the share of villagers in fed houses: a stocked house counts fully, an empty shelf counts 0.6, a hungry house counts 0.

# Newcomers

Every `migrant_every_seconds`, if mood is at least `migrate_min_mood` and a house has a free bed, one newcomer moves in.

# Next

Only food exists today. The [planner](/systems/planner.md) will need more needs (shelter quality, warmth, company) to have reasons to build.

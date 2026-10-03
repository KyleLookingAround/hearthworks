---
type: System
title: Needs and population
description: Eating, mood, newcomers arriving and villagers leaving.
tags: [needs, population, core]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T15:06:44Z }
tuning:
  eat_every_seconds: 45
  leave_after_hungry_seconds: 30
  migrant_every_seconds: 15
  migrate_min_mood: 0.8
  surroundings_weight: 0.25
  surroundings: { base: 0.5, tree_radius: 4, tree_amenity: 0.03, tree_max: 0.3, water_radius: 5, water_amenity: 0.2, crowd_radius: 3, crowd_penalty: 0.06, site_penalty: 0.1 }
---

# Eating

Each resident of a [House](/blueprints/house.md) eats one unit of the house's stocked food every `eat_every_seconds`. With none on the shelf the house goes hungry; after `leave_after_hungry_seconds` one resident leaves.

# Mood

Being fed (`fed`) is the share of villagers in fed houses: a stocked house counts fully, an empty shelf counts 0.6, a hungry house counts 0. Mood blends it with the homes' surroundings: `fed × (1 − surroundings_weight) + surroundings × surroundings_weight`, both averaged over residents. Each settlement has its own; the world's (what gates report as `mood_min` and `fed_min`) is the same over everyone. Gates hold welfare with `fed_min`, which keeps their intent ("nobody goes hungry") whatever surroundings do.

# Surroundings

Each home scores its surroundings from 0 to 1 (`tuning.surroundings`): `base`, plus `tree_amenity` per grown tree within `tree_radius` (at most `tree_max`) and `water_amenity` with water within `water_radius`; minus the `nuisance.amount` of every finished workplace whose `nuisance.radius` reaches it (the [Sawmill](/blueprints/sawmill.md) is loud), `crowd_penalty` per building within `crowd_radius`, and `site_penalty` more for each of those still a building site. The inspector shows a home's score and why. The [planner](/systems/planner.md) never puts a home within a noisy workplace's reach, or a noisy workplace within reach of a home.

# Newcomers

Every `migrant_every_seconds` each settlement with mood of at least `migrate_min_mood` and a free bed draws a newcomer, so villages grow side by side and a world with more settlements grows faster. (Until Phase 7 one newcomer came to the whole world, which held four villages on a large island to about 450 people in an hour.)

# Next

Only food exists today. The [planner](/systems/planner.md) will need more needs (shelter quality, warmth, company) to have reasons to build.

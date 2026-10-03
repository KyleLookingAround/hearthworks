---
type: System
title: People
description: Villagers as individuals; ages, births and deaths, skills that grow with practice and pass from master to apprentice, and each village's custom for its dead.
tags: [people, customs, settlement]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T22:28:24Z }
tuning:
  adult_seconds: 600
  elder_seconds: 6000
  lifespan_seconds: 7200
  lifespan_jitter_seconds: 3600
  founder_age_max_seconds: 1500
  birth_every_seconds: 600
  practice_seconds: 300
  apprentice_factor: 3
  expert_at: 0.8
  skill_speedup: 0.5
  rite_grace_seconds: 120
  rite_penalty: 0.15
  change_custom_after_seconds: 400
  pyre_logs: 4
  ship_planks: 6
  custom_radius: 12
  wood_for_pyre: 0.45
  water_for_ship: 0.1
---

# Idea

Villagers are people, not counters. People are on in every new game and off in scenarios that predate them, as the planner was; their randomness has its own stream, so nothing else in the world shifts. Code: `src/sim/people.ts`.

# Ages

Each villager is born at a moment of game time. A child (younger than `adult_seconds`) lives at home and eats but neither works nor carries; an elder (from `elder_seconds`) has retired from their workplace and only carries. Each villager's life runs `lifespan_seconds` plus up to `lifespan_jitter_seconds`, and then they die, gently and of old age only. A founding village's people are adults of ages up to `founder_age_max_seconds`; newcomers are young adults.

# Births

A home with two adults in it, fed (no hunger, food on the shelf), has a child on average once every `birth_every_seconds` while its settlement has a free bed (the child's own home first), everyone in it is fed, and its planner is not badly short (a severity of 0.5 or more) of anything in the food chain (bread, wheat): a village has children when it can feed them. Newcomers still come where they do; a settlement can also grow by births alone.

# Skills

Each villager has a skill for each kind of workplace, from 0 to 1. Working one raises it towards 1 with time constant `practice_seconds`, `apprentice_factor` times as fast while an expert (skill `expert_at` or more) of that trade lives in the settlement: master to apprentice. Work goes to the most skilled villager free; a carrier at least a quarter more skilled at it than anyone free, on the way to pick something up, is called back to it (so a workplace whose worker went carrying while its output stood full gets them back). A workplace runs at `1 - skill_speedup / 2 + skill_speedup * skill` of its pace, so a novice at three quarters and an expert at five quarters. A trade whose only expert dies is one death from being lost.

# School

A child who grows up while their settlement's [School](/blueprints/school.md) has a teacher at work is schooled, and learns every trade `school_factor` times as fast ([knowledge](/systems/knowledge.md)).

# Honouring the dead

Every settlement keeps a custom for its dead:

- **Burial** in a [Graveyard](/blueprints/graveyard.md), which takes land, fills with the years and is never built over.
- **Cremation** on a [Pyre](/blueprints/pyre.md), which burns `pyre_logs` logs for each farewell, so a timber-poor village feels it.
- **Ship burial** from a [Dock](/blueprints/dock.md), a boat of `ship_planks` planks set out to sea: only by water.

A new settlement takes up its custom from its land: within `custom_radius` of its storage yard, a share of water of at least `water_for_ship` makes it a people of the sea, else a share of its land in grown trees of at least `wood_for_pyre` makes it cremate, and otherwise it buries. Each death waits for its farewell; the planner builds the custom's place when it needs one. A death not honoured within `rite_grace_seconds` costs the settlement's mood up to `rite_penalty` until it is. A settlement whose dead have waited `change_custom_after_seconds` with no place for its custom at all, not even one being built (no room for a graveyard, no dock it knows how to build) takes up another, and its neighbours notice: both go into the chronicle.

# Not yet

Planners as people (a town hall and district halls, planners with a planning skill), and traditions beyond the dead (feasts, harvest festivals, naming customs), come later.

# Kyle's call

The tone of death and ageing in a cosy game (old age only, shown gently in the chronicle), and which customs fit the game's feel.

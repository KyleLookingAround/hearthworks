---
type: Blueprint
title: Forester
description: Fells grown trees within five tiles and plants saplings so the woods come back.
tags: [wood, production]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T08:15:00Z }
color: "#3f6b45"
order: 2
size: [2, 2]
cost: { planks: 4 }
workers: 1
recipe: { output: { logs: 1 }, seconds: 5 }
harvest: { resource: tree, radius: 5, replant: true }
---

# Role

The first link of the wood chain: [logs](/goods/logs.md) for the [Sawmill](/blueprints/sawmill.md).

# Behaviour

- Needs a grown tree within `harvest.radius`; otherwise it stalls with "No grown trees nearby".
- Replants a sapling nearby on the cadence in [production](/systems/production.md) while fewer than `max_trees_near_forester` trees stand. Saplings grow on the timer in [map](/systems/map.md).

This is the HavenCraft idea that "the forester needs to grow new trees first", kept deliberately (see [vision](/vision.md)).

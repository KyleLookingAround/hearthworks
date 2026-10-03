---
type: System
title: Village planner
description: Next system — villagers decide what to build and where, so the town grows into a civilisation on its own.
tags: [ai, planner, next]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-03T08:15:00Z }
---

# Goal

The player stops placing buildings. The village notices a shortage, chooses a [blueprint](/blueprints/) that solves it from what it knows, picks a site and builds it. See the [vision](/vision.md).

# Proposed loop

1. **Sense.** Every few seconds, measure shortages: food per villager, free beds, plank stock against queued sites, idle workers, stalled producers.
2. **Propose.** For each known blueprint, score how much it reduces the worst shortage, minus its plank cost and the walk to its inputs.
3. **Place.** Search candidate tiles near the inputs and outputs it connects (forester near trees, bakery between farm and houses), avoiding blocked roads.
4. **Commit.** Post the site to the [job board](/systems/logistics.md) like any other.

# Knowledge

What the village knows is itself an OKF-style bundle: each blueprint carries who invented it, which settlements have verified it in use, and when it is forgotten if unused. That makes discovery, spreading between settlements and forgetting fall out of the same format as these design docs. See [decision 0001](/decisions/0001-okf-design-bundle.md).

# Open questions

- What does the player still control: priorities, zoning, laws, or nudging discoveries?
- How do new settlements split off, and what do they take with them?
- Which shortages need new goods (stone, tools, cloth) before the planner has interesting choices?

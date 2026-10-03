---
type: Blueprint
title: "Watchtower"
description: A lookout on watch sees raiders coming, so the whole militia musters to meet them.
tags: [hardship]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-03T21:17:32Z }
color: "#6a5040"
order: 34
size: [1, 2]
cost: { planks: 8 }
workers: 1
guards: { hazard: raids, radius: 16, defence: 1 }
discovery: { need: raids, mean_seconds: 90 }
---

# Role

With its lookout at their post, raiders on a settlement's first storage yard within its `radius` are seen coming: the whole militia musters (`militia_share` of the grown villagers) instead of `surprised_share` of it, and the tower adds its `defence` ([hardship](/systems/hardship.md)).

# Discovery

Thought of by a settlement that was struck by raiders within `memory_seconds` (the need `raids`, [knowledge](/systems/knowledge.md)). Its [planner](/systems/planner.md) sites one where it guards the most of what is at risk that nothing guards yet.

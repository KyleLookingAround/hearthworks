---
type: Blueprint
title: "Well"
description: Water for a fire crew mustered from the neighbours, who put out a fire within reach quickly, before it spreads.
tags: [hardship]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-03T21:17:32Z }
color: "#4a7a9a"
order: 31
size: [2, 2]
cost: { planks: 8 }
guards: { hazard: fire, radius: 10 }
discovery: { need: fire, mean_seconds: 90 }
---

# Role

Draws water for a fire crew mustered from the neighbours when a fire breaks out: a fire in any building within its `radius` is put out within `douse_seconds` and spreads no further ([hardship](/systems/hardship.md)). It needs no standing worker.

# Discovery

Thought of by a settlement that was struck by fire within `memory_seconds` (the need `fire`, [knowledge](/systems/knowledge.md)). Its [planner](/systems/planner.md) sites one where it guards the most of what is at risk that nothing guards yet.

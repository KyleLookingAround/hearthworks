---
type: Blueprint
title: "Healer's House"
description: A healer tends the sick nearby, so sickness passes sooner, spreads no further and takes fewer lives.
tags: [hardship]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-03T21:17:32Z }
color: "#8aa070"
order: 33
size: [2, 2]
cost: { planks: 10 }
workers: 1
guards: { hazard: sickness, radius: 12 }
discovery: { need: sickness, mean_seconds: 120 }
---

# Role

With its healer in, a sick home within its `radius` is well again within `healed_seconds`, does not spread the sickness, and loses only `healed_death` of its people ([hardship](/systems/hardship.md)).

# Discovery

Thought of by a settlement that was struck by sickness within `memory_seconds` (the need `sickness`, [knowledge](/systems/knowledge.md)). Its [planner](/systems/planner.md) sites one where it guards the most of what is at risk that nothing guards yet.

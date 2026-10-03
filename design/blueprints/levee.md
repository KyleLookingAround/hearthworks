---
type: Blueprint
title: "Levee"
description: An earth bank that keeps the rising waters off the low land behind it.
tags: [hardship]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-03T21:17:32Z }
color: "#7a6a4a"
order: 32
size: [3, 1]
cost: { planks: 4, logs: 6 }
guards: { hazard: flood, radius: 8 }
discovery: { need: flood, mean_seconds: 90 }
---

# Role

Holds back the waters when they rise: nothing within its `radius` floods ([hardship](/systems/hardship.md)). Needs no worker.

# Discovery

Thought of by a settlement that was struck by flood within `memory_seconds` (the need `flood`, [knowledge](/systems/knowledge.md)). Its [planner](/systems/planner.md) sites one where it guards the most of what is at risk that nothing guards yet.

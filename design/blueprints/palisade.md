---
type: Blueprint
title: "Palisade"
description: A stake wall and gate that guards the stores against raiders.
tags: [hardship]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-03T21:17:32Z }
color: "#5a4630"
order: 35
size: [3, 1]
cost: { logs: 12 }
guards: { hazard: raids, radius: 10, defence: 3 }
discovery: { need: raids, mean_seconds: 90 }
---

# Role

Adds its `defence` against raiders falling on a storage yard within its `radius` ([hardship](/systems/hardship.md)). Needs no worker.

# Discovery

Thought of by a settlement that was struck by raiders within `memory_seconds` (the need `raids`, [knowledge](/systems/knowledge.md)). Its [planner](/systems/planner.md) sites one where it guards the most of what is at risk that nothing guards yet.

---
type: Blueprint
title: Bathhouse
description: Hot baths for the homes around it, kept by an attendant, so sickness takes hold there far less often. Only scholars think of it.
tags: [hardship, sanitation]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-04T13:07:18Z }
color: "#6a9ab0"
order: 33.5
size: [3, 2]
cost: { planks: 12, stone: 6 }
workers: 1
sanitation: { radius: 12 }
discovery: { need: sickness, mean_seconds: 300, after: [healer], university: true }
---

# Role

With its attendant in, homes within its `radius` are kept clean: sickness breaks out in them, and spreads to them from a sick neighbour, only `clean_factor` as often ([hardship](/systems/hardship.md)). Where the [Healer's House](/blueprints/healer.md) cures, the bathhouse prevents: the two work together.

# Discovery

Thought of under the need `sickness` (struck within `memory_seconds`) by a settlement that knows the Healer's House, and only while its [University](/blueprints/university.md) has a scholar at work ([knowledge](/systems/knowledge.md)): a discovery that needs a university. Its [planner](/systems/planner.md) builds one where it keeps the most homes clean that nothing keeps clean yet, once everyone is fed.

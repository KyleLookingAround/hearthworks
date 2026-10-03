---
type: Blueprint
title: Bridge
description: A plank span across a river or channel, up to six tiles of water with land at both ends. Walked like a path; boats pass under.
tags: [logistics, water]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T21:35:39Z }
color: "#9a7448"
order: 29
size: [1, 1]
cost: { planks: 12 }
bridge: { max_span: 6 }
discovery: { need: detours, mean_seconds: 240 }
---

# Role

A bridge spans a straight run of water, at most `bridge.max_span` tiles, from one bank to the other. Its planks are delivered to the near bank, which is its door. Once built, its tiles are walked like a [path](/blueprints/path.md) and boats row underneath.

# Discovery

Villages come up with it under the `detours` need ([knowledge](/systems/knowledge.md)): their trips run much longer than the straight line, or grass close to home cannot be walked to because water is in the way. The [planner](/systems/planner.md) places the span that opens the most land near the village and cuts the most recorded detours.

Bridges are planned by villages only; the player cannot place one by hand yet.

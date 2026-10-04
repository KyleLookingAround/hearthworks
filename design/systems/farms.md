---
type: System
title: Farms that grow
description: Farms, gardens, orchards and pastures grow in steps, each adding fields and a hand; homes eat a varied diet of the foods they grow.
tags: [farms, food, production, needs]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-04T10:16:19Z }
tuning:
  diet: [vegetables, fruit, milk, meat]
  diet_share: 0.5
  diet_stock: 2
  diet_seconds: 600
  diet_full: 3
  diet_bonus: 0.1
  diet_weight: 0.6
  grow_room_weight: 1
---

# Option

Farms that grow are an option of the world (`{ farms: true }` on `createState`, a box on the new-game screen, on in new games). Off, nothing here exists: the garden, orchard, pasture and new fields are not known, every farm stays a smallholding and homes eat bread, so the scenarios that predate it run exactly as before.

# Sizes

A blueprint with `grows` has one size per name in `grows.names` (the Farm: smallholding, farm, estate). Each step lays [New fields](/blueprints/field.md) across its back: a strip one row deep, as wide as the farm, on open land (no building, road, door front or no-build zone, with a ring of open land beyond it), built like any site. When the strip is finished it becomes part of the farm, which is one size bigger with one more place for a hand. The door stays where it was, so a turned farm grows away from the way it faces; a grown farm no longer turns.

# Hands

A workplace has `workers` places, and a grown one one more per step. Hands are sent to a workplace's first place before anyone is sent to a second place anywhere. Every hand at work adds their pace (skill, with people on) to the cycle, so an estate with three hands makes three times what a smallholding makes, and one short of hands makes for the hands it has. In winter a resting field sends every hand carrying, at every size.

# Foods

Beside bread, homes eat the foods of `diet`: [vegetables](/goods/vegetables.md) from a [Garden](/blueprints/garden.md) (quick, any land), [fruit](/goods/fruit.md) from an [Orchard](/blueprints/orchard.md) (on fertile land, bearing only after `ripens`), and [milk](/goods/milk.md) and [meat](/goods/meat.md) from a [Pasture](/blueprints/pasture.md) (all year, on more land). A home keeps `diet_stock` of each that its settlement grows or holds, and at each meal eats whichever of its foods it has gone longest without (its preserved food only when none is left).

# A varied diet

A home remembers when it last ate each food. Mood gains up to `diet_bonus` for homes that have eaten several foods in the last `diet_seconds`, all of it at `diet_full` foods. A settlement fed by one crop has nothing else to fall back on in a bad year.

# Planning

The [planner](/systems/planner.md) wants `diet_share` of its people's meals from the diet foods, an equal part each, and bread for the rest and for whatever part of the diet it does not grow. A shortage of a diet food weighs `diet_weight` against one of bread. When it plans a food workplace and one of that kind can grow, it grows that one (the most grown first) instead of building another, and when it places a new one it favours spots with open land behind (`grow_room_weight` a row).

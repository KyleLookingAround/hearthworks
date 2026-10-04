---
type: Blueprint
title: Farm
description: Grows wheat for the bakery; with farms that grow on, grows its fields as the village needs more.
tags: [food, production]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-04T10:16:19Z }
color: "#c2a046"
order: 4
size: [3, 2]
cost: { planks: 4 }
workers: 1
recipe: { output: { wheat: 1 }, seconds: 4 }
tools: { speedup: 1.5, wear_cycles: 40 }
seasonal: true
grows: { names: [Smallholding, Farm, Estate] }
zone: farms
---

# Role

Produces [wheat](/goods/wheat.md) for the [Bakery](/blueprints/bakery.md). With [seasons](/systems/seasons.md) on it rests in winter and its worker goes carrying. No soil model yet.

# Growing

With [farms that grow](/systems/farms.md) on, a farm starts as a smallholding and grows twice, to a farm and an estate (`grows.names`), each time by a row of fields across its back ([New fields](/blueprints/field.md)) and a place for one more hand. Each hand works its own share of the fields, so an estate of three hands on twelve tiles makes three times a smallholding's wheat on twice its land.

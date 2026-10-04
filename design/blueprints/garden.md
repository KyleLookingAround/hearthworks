---
type: Blueprint
title: Garden
description: Grows vegetables, quickly, on most land; rests in winter. Grows its beds as the village needs more.
tags: [food, production, farms]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-04T10:16:19Z }
color: "#5f9a43"
order: 4.1
size: [3, 2]
cost: { planks: 4 }
workers: 1
recipe: { output: { vegetables: 1 }, seconds: 3 }
seasonal: true
grows: { names: [Kitchen garden, Garden, Market garden] }
option: farms
zone: farms
---

# Role

Grows [vegetables](/goods/vegetables.md), the quickest food there is: one gardener and no oven. With [seasons](/systems/seasons.md) on it rests in winter, so it feeds the summer and the bread and the herds feed the winter. Like the [Farm](/blueprints/farm.md) it grows a row of beds behind it at a time, a hand more each time ([farms](/systems/farms.md)). Only with farms that grow on.

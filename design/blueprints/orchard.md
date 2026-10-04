---
type: Blueprint
title: Orchard
description: Fruit trees on fertile land; the young trees bear only after a while, then every year but winter.
tags: [food, production, farms]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-04T10:16:19Z }
color: "#7d9a3c"
order: 4.2
size: [3, 3]
cost: { planks: 6 }
workers: 1
recipe: { output: { fruit: 1 }, seconds: 4 }
ripens: 240
seasonal: true
deposit: { kind: fertile, radius: 3 }
grows: { names: [Young orchard, Orchard, Great orchard] }
option: farms
zone: farms
---

# Role

Grows [fruit](/goods/fruit.md). It must stand within `deposit.radius` of fertile soil, and its young trees bear nothing for `ripens` seconds after it is built: slow to start. Then it gives every season but winter ([seasons](/systems/seasons.md)). It grows a row of trees behind it at a time, a hand more each time ([farms](/systems/farms.md)). Only with farms that grow on.

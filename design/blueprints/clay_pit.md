---
type: Blueprint
title: Clay Pit
description: Digs clay from a bank within three tiles.
tags: [production, economy]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T16:24:52Z }
color: "#9c5a3c"
order: 13
size: [2, 2]
cost: { planks: 4 }
workers: 1
recipe: { output: { clay: 1 }, seconds: 5 }
deposit: { kind: clay, radius: 3 }
zone: workshops
---

# Role

Must stand within `deposit.radius` of a clay deposit, on banks beside water.

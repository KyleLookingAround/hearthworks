---
type: Blueprint
title: Storage Yard
description: Holds surplus goods. Carriers fetch from here when nothing nearer has what they need.
tags: [logistics]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T08:15:00Z }
color: "#8b7350"
order: 6
size: [3, 3]
cost: { planks: 10 }
storage: true
capacity: 300
---

# Role

The buffer of the [job board](/systems/logistics.md). Producers send surplus here once their output reaches `dump_at`; requests prefer a producer over storage when both have stock.

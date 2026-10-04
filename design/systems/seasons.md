---
type: System
title: Seasons
description: A year of spring, summer, autumn and winter; crops rest in winter, homes burn firewood, and settlements store food and fuel ahead.
tags: [seasons, needs, economy]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-04T00:02:17Z }
tuning:
  year_seconds: 1200
  firewood_every_seconds: 120
  firewood_stock: 2
  cold_penalty: 0.3
  winter_headroom: 1.2
  preserved: [smoked_fish]
---

# The year

When seasons are on (every new game; off in scenarios that predate them, as the planner was), the game opens in spring and a year lasts `year_seconds`: spring, summer, autumn and winter, a quarter each. The HUD shows the season, and the land whitens in winter.

# Winter

- **Crops rest.** Farms and flax farms (`seasonal: true`) work from spring to autumn and stand idle in winter, so the year's grain must be stored before the first frost. Bread keeps baking from stored wheat.
- **Firewood.** In autumn and winter homes keep `firewood_stock` logs, and in winter each resident burns one every `firewood_every_seconds`. A home with no fire in winter is cold: mood loses up to `cold_penalty` for the share of people in cold homes. Nobody leaves for the cold; they leave for hunger as ever.
- **Preserved food.** Homes eat their bread first and any of `preserved` ([smoked fish](/goods/smoked_fish.md)) when the bread is gone. Smoked fish never spoils.

# Looking ahead

With seasons on the [planner](/systems/planner.md) plans for winter all year: it wants a quarter more grain than the bakeries use (a growing season of three quarters must feed four), firewood at the winter rate, and storage room for the winter's food at `winter_headroom`, so it builds granaries in summer and autumn.

# Who comes, and who works

- **Newcomers** travel in spring and summer only. In summer one comes only while the stores keep pace with the winter's meals and `winter_headroom` more, counting them (none at the start of summer, half by its end, the autumn harvest bringing the rest). Through the winter the store is on track while what is left covers what is left of it.
- **A store fallen behind** moves workers onto the food chain, as hunger does.
- **Resting fields** need nobody: in winter farm workers go carrying, and the grain reaches the bakeries as soon as a home's bread would.

# Kyle's call

Year length (twenty game minutes here) and how harsh winter is: today it is gentle, cold only costs mood.

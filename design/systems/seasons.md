---
type: System
title: Seasons
description: A year of spring, summer, autumn and winter; crops rest in winter, homes burn firewood, and settlements store food and fuel ahead.
tags: [seasons, needs, economy]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-06T12:18:00Z }
tuning:
  year_seconds: 1200
  firewood_every_seconds: 120
  firewood_stock: 2
  cold_penalty: 0.3
  winter_headroom: 1.2
  preserved: [smoked_fish]
  winter_food_share: 1.1
---

# The year

When seasons are on (every new game; off in scenarios that predate them, as the planner was), the game opens in spring and a year lasts `year_seconds`: spring, summer, autumn and winter, a quarter each. The HUD shows the season, and the land whitens in winter.

# Winter

- **Crops rest.** Farms and flax farms (`seasonal: true`) work from spring to autumn and stand idle in winter, so the year's grain must be stored before the first frost. Bread keeps baking from stored wheat.
- **Firewood.** In autumn and winter homes keep `firewood_stock` logs, and in winter each resident burns one every `firewood_every_seconds`. A home with no fire in winter is cold: mood loses up to `cold_penalty` for the share of people in cold homes. Nobody leaves for the cold; they leave for hunger as ever.
- **Preserved food.** Homes eat their bread first and any of `preserved` ([smoked fish](/goods/smoked_fish.md)) when the bread is gone (with [farms that grow](/systems/farms.md), when every fresh food is gone too). Smoked fish never spoils. Gardens and orchards rest in winter like fields; a [pasture's](/blueprints/pasture.md) herd gives milk and meat all year.

# Looking ahead

With seasons on the [planner](/systems/planner.md) plans for winter all year: it wants a quarter more grain than the bakeries use (a growing season of three quarters must feed four), firewood at the winter rate, and storage room for the winter's food at `winter_headroom`, so it builds granaries in summer and autumn.

# Who comes, and who works

- **Newcomers** come by how well a settlement is laid in, not by the calendar: in any season, one comes only while the winter store is on track counting them. In spring the store asks nothing yet; from the start of summer to the first frost the grain, bread and preserved food in store must keep pace with the winter's meals and `winter_headroom` more (none at the start of summer, half by its end, all by the frost); through the winter what is left must cover what is left of it, with `winter_headroom` to take anyone in. A settlement that laid in well takes newcomers through the winter; one that laid in too little waits for spring, and goes short. Nobody comes while any of its homes go hungry, and in winter its bakeries must make `winter_food_share` of what its people and the newcomer eat (the planner's `newcomer_food_share` the rest of the year): with the fields resting and every hand carrying, bakeries that fall behind in winter do not catch up. On Gate 12's island, newcomers taken through the winter by the store and the bakeries' rate alone left the last weeks of winter short (seed 2026 lost five people even at 1.2); waiting while anyone is hungry keeps them out until the bakers catch up. [Founding parties](/systems/settling.md) go by the same store.
- **Rationing** ([hardship](/systems/hardship.md)) stretches the store: while a settlement rations food, its winter's meals are counted at the rationed rate, so a lean store is on track sooner. Long working hours bring the harvest in faster before the frost.
- **A store fallen behind** moves workers onto the food chain, as hunger does.
- **Resting fields** need nobody: in winter farm workers go carrying, and the grain reaches the bakeries as soon as a home's bread would.

# A lean winter

Kyle's call (decision [0006](/decisions/0006-how-the-parts-work-together.md)): winter stays the main pressure of the year, but as one the player can answer with stores, rationing and priorities, not a brake that halves growth. Until 2026-10-06 newcomers and founding parties came in spring and summer only, and a world of default new games (Islands M, an hour, twelve seeds, three draws each) held 194 villagers with seasons on against 363 with them off. Coming by the store instead of the calendar, it holds 274 (the gap 90, from 169), with 217 newcomers an hour the year round (53 in spring, 56 summer, 48 autumn, 60 winter) instead of 130 in spring and summer alone, and 6.5 settlements instead of 4.3. Winter is felt: at its lowest point each winter the least-fed settlement's fed share is 0.99, 0.96 and 0.88 on average in the first, second and third winters (1.00, 0.99 and 0.97 before; under 0.6 in 3 of 108 winters, against 1), the world's lowest 0.79, a world loses 1.6 villagers an hour to hunger (0.4 before), and nobody starves. The worst world lost 42 people: its first settlement grew in its second spring to more than its land could feed, found no room for more fields, and ran out of grain late in the third winter; rationing or wheat put first from the start brought the same world through with nobody lost.

# Kyle's call

Year length (twenty game minutes here) and how harsh winter is: cold costs mood, and a settlement that laid in too little goes short until spring.

# Hearthworks: working agreement for Claude Code

A 2D web town builder where villagers will plan and build their own civilisation. Start with `design/index.md`: it lists every design concept with a one-line description, so you can open only what the task needs.

## Layout

- `design/` is an OKF v0.2 bundle (Open Knowledge Format): markdown concepts with YAML frontmatter. **It is also game content.** Blueprints, goods and the `tuning:` blocks in `design/systems/*.md` are loaded by the game and by the tests.
- `src/sim/` is the deterministic, DOM-free simulation. All randomness goes through `rand(S.rng)`; never use `Math.random` there.
- `src/render/`, `src/ui/`, `src/main.ts` are the browser shell. They read state and issue commands only.
- `src/content/` parses the bundle (`yaml.ts` is a strict YAML subset: no `|`/`>` blocks, anchors or tags).
- `design/gates/` are roadmap gates as OKF Attested Computations. Their scenarios live in `design/references/scenarios/`, the attester in `design/references/attesters/`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Watch-compile and serve on http://localhost:5173 |
| `npm test` | Unit tests plus every gate |
| `npm run gates` | Gate report; `npm run gates -- 02 --seed 7 --json` for one gate with a receipt |
| `npm run okf` | Check the bundle and regenerate every `index.md` |
| `npm run ci` | Everything CI runs |

Node 22.18 or newer runs `.ts` files directly; TypeScript is the only dependency.

## Workflow

Kyle has given standing permission to develop, test and push to `main` without checking in. He has asked for the roadmap to be built phase after phase without stopping: when a phase is pushed and verified, report it briefly and start the next. Before every push: `npm run ci` must be green, and the rules below still apply. A push to `main` publishes the game to GitHub Pages (https://kylelookingaround.github.io/hearthworks/): after pushing, check that the CI run and its Pages deploy succeed and that the live site loads. Report what changed afterwards. Gates may be reworked under rule 6; Kyle can overrule any threshold, and `verified` entries remain his alone.

## Rules when changing the design

1. **Change the concept, not a copy.** Balance numbers live once, in the concept's frontmatter. Never hard-code a number in `src/` that belongs in `design/`.
2. **Record authorship.** When you write or materially change a concept, set `generated: { by: claude/<model>, at: <UTC ISO time> }`.
3. **Never write `verified` with a `human:` actor.** Only Kyle verifies (`human:kyle`), after playtesting. You may add `process:` verifications produced by CI.
4. **Log it.** Add a dated bullet to `design/log.md` (newest date first; `**Creation**`, `**Update**`, `**Finding**`, `**Deprecation**`).
5. **Run `npm run okf`** so the indexes stay in sync; CI fails on stale indexes.
6. **Gates are sanctioned computations, and may be reworked as the game grows** ([decision 0004](design/decisions/0004-reworking-gates.md)). Never rework a gate to turn it green: a failing gate is first a bug in the game or the tuning. Small changes that keep the intent are revised in place with a `# Revisions` entry; anything larger, or any loosened threshold, supersedes the old gate (deprecated and kept, still runnable by name). Always log it, and call out any loosening in the report.
7. **Deprecate, don't delete.** Superseded concepts get `status: deprecated` and stay for links and history.
8. `log.md` and `index.md` are reserved filenames at every level of the bundle.

## Current focus

Phases 4 to 17 of `design/roadmap.md` are done (16 in part). The village planner (`src/sim/planner.ts`) and knowledge (`src/sim/knowledge.ts`) are off by default in `createState`, so scripted gates stay scripted: pass `{ planner: true }` and `{ settlements: n }` to turn them on, and `{ map, size }` to pick a world from `design/maps/` and the sizes in map tuning (default: the standard map, Island at size `standard`, 112 by 80; players pick S, M, L or XL; gates name their world with `map` and `size` parameters). Knowledge draws randomness from `S.krng`, never `S.rng`. Saves (`src/sim/save.ts`) carry `SAVE_VERSION`: any change to the shape of `State` raises it, adds a migration and keeps a fixture of the old version in `tests/fixtures/`. Gates hold welfare with `fed_min` (being fed), since mood now includes surroundings. Settlements grow by form (hamlet, village, town) with a ladder of homes, replanning and districts (`hubs` in planner.ts). The player steers through `town.levers` and `world.zone`; `S.chronicle` is each settlement's history (`src/sim/steward.ts`). Homes have tiers by goods (`homeTier`, `wants` in production.ts). Seasons (`S.seasons`, `seasonOf`) are off by default in `createState` like the planner, and on in new games: pass `{ seasons: true }`; trade (`S.trade`, `src/sim/trade.ts`) likewise with `{ trade: true }`, and people (`S.people`, `src/sim/people.ts`, randomness from `S.prng`) with `{ people: true }` (`{ newcomers: false }` to grow by births alone). Learning (libraries, schools, universities) rides on people; carts (`S.carts`) and settling (`S.settlers`, `src/sim/settle.ts`) are further options, all on in new games. Phase 18 (the sea) is next; Gate 7 holds the work budgets; `design/roadmap.md` lists all phases to 20 with their dependencies and proposed gates.

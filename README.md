# Hearthworks

A cosy 2D town builder for the web. Every log, plank and loaf is carried by a villager until you invent machines to do it. The goal is a town whose villagers decide what to build themselves, growing from a hamlet into a civilisation.

**Status:** playable prototype. You place the buildings; villagers staff them, haul every good through a shared job board, eat bread, arrive when fed and leave when not. Courier bots are the first automation. The village planner is next.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
```

Requires Node 22.18 or newer (it runs TypeScript directly). TypeScript is the only dependency.

## How it fits together

```
design/            OKF bundle: the design docs AND the game's content
  blueprints/      buildings: size, cost, recipe, workers (loaded by the game)
  goods/           items and their colours (loaded by the game)
  systems/         rules, with tuning numbers in frontmatter (loaded by the game)
  gates/           roadmap gates as Attested Computations
  references/      gate scenarios, the attester, the run-gate skill
  decisions/       architecture decisions
  vision.md  roadmap.md  log.md  index.md
src/
  sim/             deterministic simulation, no DOM
  content/         reads the bundle (strict YAML subset)
  render/ ui/      canvas renderer and browser shell
  gates/           gate executor and scenario kit
static/            index.html, style.css
scripts/           dev server, site build, OKF checker, gate runner
tests/             node --test suites
```

### The design bundle

`design/` follows the [Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format) v0.2: one markdown file per concept with YAML frontmatter, an `index.md` per folder for quick navigation, and a dated `log.md`. The game reads blueprints, goods and tuning numbers straight from these files, so a balance number in a doc is the number in the game.

Trust is recorded in frontmatter: `generated` says which agent or person wrote a concept, and `verified: { by: human:kyle }` marks something Kyle has playtested and signed off.

### Gates

Each roadmap phase ends with a gate: a scenario that runs the real simulation headless on a fixed seed. A deterministic attester checks the receipt: the scenario file's SHA-256 must match what ran, and the metrics must meet the gate's `pass_when` rules.

```sh
npm run gates
# PASS  01-first-plank
# PASS  02-sustain-town
# PASS  03-couriers
```

`npm test` runs them too, so a tuning change that breaks the economy fails CI.

## Deploying

CI type-checks, tests and builds every push. To publish to GitHub Pages:

1. Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → Variables: add `PAGES_ENABLED` = `true`.

Pages on a private repository needs a paid GitHub plan; on a free plan, make the repo public or skip this step.

## Working with Claude Code

`CLAUDE.md` holds the working agreement: read `design/index.md` first, change concepts rather than hard-coding numbers, log changes, never self-verify, and never edit a gate scenario to make it pass.

# B1 — Engine integration spike (go/no-go)

**Question:** can a third-party frontend drive Actual's budgeting engine cleanly, and via which surface?

## Findings — 2026-05-29

Recon of what Actual actually publishes to npm (latest = `26.5.2`):

| Package                   | Published?           | What it is                                                                                                                                        |
| ------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@actual-app/api`         | ✅ `26.5.2`          | **Headless Node API** that wraps the engine. Read/write budget data, transactions, category budgets, queries. `main: dist/index.js`, ships types. |
| `@actual-app/web`         | ✅ `26.5.2`          | The prebuilt **web client** (Actual's own React UI bundle).                                                                                       |
| `@actual-app/sync-server` | ✅ `26.5.2`          | The self-hosted **sync server**.                                                                                                                  |
| `@actual-app/crdt`        | ✅ `3.0.0`           | CRDT sync primitives.                                                                                                                             |
| `loot-core`               | ❌ **not published** | Internal to the monorepo — **not consumable as a standalone npm dependency.**                                                                     |

### What this means

- **`loot-core` is not a public dependency.** "Depend on loot-core via npm" is off the table — it confirms the earlier caution that _decoupled-for-Actual's-own-clients ≠ supported third-party surface_.
- The realistic supported surface is **`@actual-app/api`** (headless) — but it's **Node-side**, designed for scripting/automation, not obviously for driving an interactive in-browser UI with live state.
- So two candidate paths remain:
  1. **Custom frontend → `@actual-app/api`.** Our UI talks to the headless API (running against the sync server), likely via a thin backend layer we expose. Cleanest separation; need to confirm topology (can the api run in a worker, or must it be a Node service our web app calls?).
  2. **Fork/reskin `@actual-app/web`.** Inherit Actual's already-wired interactive engine integration; do heavy UI surgery to get the YNAB-like look. More UI work, less integration risk.

## Decision — 2026-05-29: Path 2 (fork/reskin `@actual-app/web`)

Decided by the **no-server constraint** (only static hosting / local available):

- `@actual-app/api` (Path 1) is **Node-side** — would require a server we don't have. Out.
- `@actual-app/web` runs the **entire engine in the browser** (SQLite-on-WASM; data in browser-local storage). It's static files → works on GitHub Pages or locally, **no server**, data on-device. In.
- Trade-off accepted: **no bank auto-sync.** SimpleFIN requires Actual's server component and isn't worth $1.50/mo → manual entry + monthly file import instead.

### Bonus finding — manual-entry/auto-resolve is already native (don't build it)

Per Actual's docs: a manually-entered transaction is **matched on later file import** by date + amount + similar payee, and not duplicated. Manual entries are **uncleared** until matched, then **cleared**; reconciliation compares to statement balance; manual **merge** ("G") is the backstop. So wnab builds the _UX_ (fast quick-add, clear pending/cleared states), not a matching engine.

## Next step — re-aimed B1 (Path 2)

1. Fork the Actual monorepo; get `@actual-app/web` **building and running locally** (no server). Confirm budgeting works browser-local (engine in WASM, data in browser storage).
2. Identify the component/styling architecture and **prove a restyle on one core surface** (e.g., the budget table) — the real test of the reskin approach and our control over the look.
3. Decide hosting (GitHub Pages vs local vs Electron) once it builds.

Engine-reuse confidence: **high** (web client is purpose-built to run standalone in-browser); the open risk is now _reskin effort_, not _feasibility_.

## Reskin architecture (mapped from source, 2026-05-29)

Cloned `actualbudget/actual` (shallow) and traced the styling system. Monorepo packages: `desktop-client` (web UI), `loot-core` (engine), `component-library` (= `@actual-app/components`, shared primitives + themes), `desktop-electron` (desktop wrapper).

- **Themes are CSS custom properties.** `component-library/src/themes/palette.css` defines raw color scales (`--palette-*`); `light.css` maps **224 semantic tokens** (`--color-pageBackground`, `--color-tableBackground`, `--color-budgetCurrentMonth`, `--color-buttonPrimaryBackground`, …) onto the palette. Components use `theme.<token>` in inline style objects, resolving to these vars.
- **Custom themes are a supported, documented feature** (`customThemes.ts`, Theming.mdx → actualbudget.org/docs/experimental/custom-themes). Actual is built to be re-themed.

**Reskin splits into two layers:**

1. **Color + typography → theme CSS.** Override the palette/semantic tokens (+ load vault fonts). Low effort, high impact, low merge risk. Starter authored: `themes/wnab.css` (cream/ink/teal, vault aesthetic — color pass only, not yet visually verified).
2. **Layout + structure → component edits** in `desktop-client/src/components/budget/*` (`BudgetTable.tsx`, `ExpenseCategory.tsx`, etc.) and `component-library` primitives. Higher effort; this is where the real YNAB-vs-Actual layout work lives.

## Plugin system — investigated, NOT a viable seam (2026-05-29)

Checked as a possible third host (cleaner than fork/overlay). It isn't:

- In source, `plugins-service` is **only a service worker** (Workbox PWA cache/routing) — machinery for _loading_ plugin code. No UI hooks, component slots, or view-registration API.
- Actual's 2026 roadmap: plugins **not ready yet** ("first few months of 2026"), and the first use case is **migrating bank-sync providers** — functionality, not UI replacement.
- Verdict: cannot host a reimagined budgeting UX as a plugin today; not what plugins are for. Crossed off.

## Structure decision — fork with an engine-vs-view seam

Ambition clarified: **a full YNAB-flow clone that teaches the mindset**, not a repaint. Key realization: the YNAB _mechanics_ (zero-based "to be assigned", targets, overspending, Age of Money) already live in Actual's engine. What's missing — the **coaching layer** (onboarding to the four rules, behavioral nudges, age-of-money prominence, roll-with-the-punches framing, the language) — lives in the **frontend**. So this is engine-reuse + a view-layer rebuild.

At that divergence, overlay/patching is just indirection. **Decision direction: fork, but draw the seam at engine-vs-view:**

- **Track upstream for the engine** (`loot-core`, `crdt`, data/sync layer) — accept their fixes/improvements.
- **Own the view layer** (`desktop-client/src/components/*`) — diverge on purpose; stop merging Actual's UI changes (we have our own UX). Merge overlap collapses to the engine packages we never edit → a fork that stays sane.

Eyes-open notes: this is the _big_ version of the project (months of evenings); the hard part is **designing the coaching layer** (authored content/behavioral design, not inherited); mirroring YNAB's flow is fine for a **personal** tool (revisit only if ever distributed publicly).

**IP / privacy decision (2026-05-29): public repo, all-original copy.** Implement the method + coaching concept freely (ideas/methods aren't protected); author all teaching copy in Wedge's own voice/labels; don't reproduce YNAB's exact wording or screens. The cream/ink/teal theme already makes the look distinct. Personal use means trademark/trade-dress doesn't apply; this stays clean even if published. (Not legal advice.)

`themes/wnab.css` still applies — the visual layer rides on top of the rebuilt views.

## Local build / run (on Wedge's machine — exceeds sandbox time limits)

```sh
# 1. Fork actualbudget/actual on GitHub, then:
git clone https://github.com/<you>/actual.git
cd actual
git remote add upstream https://github.com/actualbudget/actual.git

# 2. Install + run the web client (no server needed; engine runs in-browser)
yarn install            # several minutes
yarn start              # serves @actual-app/web at http://localhost:3001

# 3. Apply the wnab look: copy themes/wnab.css in as a custom theme
#    (Settings → Themes → custom), or fold the tokens into light.css for a built-in.
```

Data lives in the browser (local). Back up via Actual's export to `~/Documents/Finances/wnab/`.

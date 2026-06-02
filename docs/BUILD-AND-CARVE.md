# Build & first carve — checklist (run on Wedge's machine)

The hands-on start for wnab. Engine stays Actual's; we own the view layer. Work on the **envelope** budget mode (Actual's YNAB-style rollover budgeting), not the "tracking" mode.

## Phase 0 — fork & build

**Prerequisites (get these right or install fails):**

- **Node ≥ 22** (repo pins v22). Use nvm: `nvm install 22 && nvm use 22`.
- **Yarn 4** (repo pins `yarn@4.13.0` via `packageManager`). Don't `npm i -g yarn`. Enable Corepack so the correct yarn is used automatically: `corepack enable`.

```sh
# Fork actualbudget/actual on GitHub (button), then:
git clone https://github.com/<you>/actual.git wnab-app
cd wnab-app
git remote add upstream https://github.com/actualbudget/actual.git

nvm use 22                # match the pinned Node
corepack enable           # makes `yarn` resolve to 4.13.0 from packageManager

# Install + run the web client (no server; engine runs in-browser via WASM)
yarn install              # several minutes, first time
yarn start                # builds + serves the web client; prints the local URL (typically http://localhost:3001)
```

Smoke test before touching anything:

1. Create a budget, switch to **Envelope** budgeting (Settings → Experimental / budget type).
2. Add a category group + category, add an account, add a transaction. Confirm "To Budget" / assign / reconcile all work.
3. Settings → Themes → add a custom theme, paste `wnab/themes/wnab.css`. Confirm the cream/ink/teal look applies. (This proves the visual layer end-to-end.)

## Phase 1 — establish the engine-vs-view seam

- **Never edit** these (track upstream, accept their updates): `packages/loot-core`, `packages/crdt`, the sync/data layer.
- **Own / diverge** here: `packages/desktop-client/src/components/**` (and `packages/component-library` primitives only as needed).
- Work on a long-lived `wnab` branch. To pull engine updates later: `git fetch upstream && git merge upstream/master` — expect conflicts only in view files you've changed (minimal if you stay out of engine packages).
- **The merge loop has one source of truth:** see [`UPSTREAM-MERGE.md`](./UPSTREAM-MERGE.md) for the divergence catalog, cadence, merge-vs-rebase decision, exact procedure, and post-merge smoke test.

## Phase 2 — first carve: the assign-every-dollar screen

This is where YNAB's mindset lives, so it's the right first surface.

Target files (from source recon):

- `packages/desktop-client/src/components/budget/BudgetTable.tsx` — the grid.
- `packages/desktop-client/src/components/budget/envelope/**` — envelope-mode cells/headers.
- `packages/desktop-client/src/components/budget/BudgetPageHeader.tsx` + the "To Budget" summary — becomes the prominent **"Ready to Assign"** banner.
- `packages/desktop-client/src/components/budget/ExpenseCategory.tsx` / `ExpenseGroup.tsx` — per-category rows.

Layout moves toward YNAB feel:

1. Promote **"Ready to Assign"** to a bold, always-visible banner that visibly wants to hit **0** (color shifts when positive/negative).
2. Per-category columns read **Assigned / Activity / Available** (Actual's Budgeted/Spent/Balance, relabeled + reordered).
3. Fast assign affordances (click-to-fill, "assign rest", quick keyboard entry).

## Phase 3 — coaching layer (all-original copy)

Hooks, with text authored in your own voice (no YNAB verbatim):

- First-run onboarding: short steps teaching "give every dollar a job," true expenses, rolling with the punches.
- A nudge whenever **Ready to Assign ≠ 0**.
- **Age of Money** surfaced near the header (Actual computes it).
- Keep coaching copy in its own content module so it's editable without touching logic.

## Phase 4 — verify & iterate

Screenshot the themed assign screen and send it back here — I'll iterate the theme tokens + layout, then we move to the register and reconciliation surfaces.

# Upstream merge loop — pulling `actualbudget/actual` into the wnab fork

Single source of truth for keeping the wnab fork current with upstream Actual. The engine is
Actual's; we own the view layer. The whole reason not to strand on a stale engine is that
security fixes land in `loot-core` and `sync-server`; the whole reason a merge is cheap is that
the reskin lives in a small, enumerated set of view files. This doc is the loop that keeps both
true.

Run the procedure from a clean working tree on the long-lived `wnab` branch.

---

## §1 The seam

The fork is split into two halves with a clean line between them.

- **Engine — never edit (track upstream, accept their updates verbatim):**
  `packages/loot-core`, `packages/crdt`, `packages/sync-server`, `packages/api`, the CLI, and the
  sync/data layer. We have made **zero** edits in any of these. They merge fast-forward.
- **View — ours (where divergence is allowed):** `packages/desktop-client/src/components/**`,
  `packages/desktop-client/index.html`, and `packages/component-library` primitives
  (`styles.ts`, `themes/light.css`) only as needed. These are the files a merge can conflict in.

The divergence budget, restated as policy: **prefer token overrides and pure string relabels**
(these effectively never conflict), accept single-constant tweaks and additive blocks (tracked),
and keep **structural** edits to upstream component internals to a short, enumerated list. If the
structural-edit list grows past roughly a dozen files, or any single merge needs more than ~30
minutes of conflict resolution, divergence is winning and should be pushed back into tokens and
additive layers.

### Divergence catalog

Generated read-only against the current merge-base. Recompute each cycle (the merge-base moves);
do **not** trust the hash below across cycles.

```sh
MB=$(git merge-base upstream/master wnab)
git diff --name-status "$MB" wnab
git diff --numstat   "$MB" wnab -- <file>   # per file
```

Merge-base at time of writing: `ff70d2d5f` (2026-05-28). Against today's `upstream/master`,
**none** of the wnab-touched files below have been changed upstream (zero overlap), while upstream
moved 55 files elsewhere — so a merge today fast-absorbs all 55 with no manual conflict. This is
the cheapest a merge will ever be.

| File                                                                                      | +/−                     | Class                    | Conflict risk              | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------- | ----------------------- | ------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/component-library/src/themes/light.css`                                         | +85 / −0                | token-override           | **very low**               | Purely additive at file tail; overrides `--palette-navy*` / `--palette-purple*` ramps + `--font-family`. Depends on the injection-order contract (palette.css must load before light.css).                                                                                                                                                                                                                                                                   |
| `packages/component-library/src/styles.ts`                                                | +2 / −0                 | token-override           | **very low**               | Adds `fontFamily` (Fira Code) to the existing `tnum` block.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `packages/desktop-client/index.html`                                                      | +8 / −0                 | additive                 | **very low**               | Adds Google Fonts `<link>` preconnect + stylesheet (Fira Code / Nunito). Additive `<head>` lines.                                                                                                                                                                                                                                                                                                                                                            |
| `packages/desktop-client/src/components/budget/envelope/budgetsummary/TotalsList.tsx`     | +1 / −1                 | relabel                  | **very low**               | `Budgeted` → `Assigned` (one `<Trans>`).                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `packages/desktop-client/src/components/budget/envelope/EnvelopeBudgetComponents.tsx`     | +3 / −3                 | relabel                  | **low**                    | `Budgeted/Spent/Balance` → `Assigned/Activity/Available` (three `<Trans>`).                                                                                                                                                                                                                                                                                                                                                                                  |
| `packages/desktop-client/src/components/table.tsx`                                        | +1 / −1                 | constant                 | **low**                    | `ROW_HEIGHT 32 → 38`. Conflicts only if upstream edits that one line.                                                                                                                                                                                                                                                                                                                                                                                        |
| `packages/desktop-client/src/hooks/useFeatureFlag.ts`                                     | +2 / −2                 | constant                 | **HIGH (canary)**          | Flips `goalTemplatesEnabled` / `goalTemplatesUIEnabled` to `true` in `DEFAULT_FEATURE_FLAG_STATE`. Upstream edits that record whenever it ships a flag, so this is the single most likely future textual conflict. Trivial recipe in §4.                                                                                                                                                                                                                     |
| `packages/desktop-client/src/components/budget/BalanceWithCarryover.tsx`                  | +17 / −4                | structural               | **HIGH**                   | The Available pill. Inlines literal hex (`#e3f3e8`/`#1e7a3d`, `#fdeaea`/`#c0341d`, `#eceef1`/`#6b7280`) instead of `theme.*` tokens, and restructures JSX. An upstream refactor here yields a structural conflict, not a one-liner. Token refactor is a deferred follow-up (Task 6).                                                                                                                                                                         |
| `packages/desktop-client/src/components/budget/envelope/budgetsummary/ToBudgetAmount.tsx` | +32 / −14               | structural               | **HIGH**                   | The Ready-to-Assign banner pill + coaching strings. Inlines literal hex (`#1e7a3d`/`#c0341d`/`#4b5563`, `#e3f3e8`/`#fdeaea`/`#eef0f3`); `getDefaultClassName` rewritten + banner block added. Highest-conflict-risk file. Token refactor is a deferred follow-up (Task 6).                                                                                                                                                                                   |
| `packages/desktop-electron/index.ts`                                                      | (applied — uncommitted) | structural — **APPLIED** | **HIGH (engine-adjacent)** | **Intentional engine-adjacent divergence; expect a conflict here on the next merge.** Relocation of the data dir (now applied) to `~/Documents/Finances/wnab/` (override `ACTUAL_DOCUMENT_DIR` / `ACTUAL_DATA_DIR`, currently `app.getPath('documents')` / `app.getPath('userData')`). This is the one place we knowingly edit an engine-adjacent file; it is recorded here once so the merge runner expects the conflict. (Absorbs Electron-Launch Task 4.) |

Docs (`docs/BUILD-AND-CARVE.md`, `docs/ELECTRON-BUILD.md`, `docs/SPIKE.md`, this file), plus
`.gitignore` and `AGENTS.md`, are also wnab-added/modified but are not source and never conflict
with the engine; they are out of the catalog above by design.

> Hygiene note: an untracked editor backup `packages/component-library/src/themes/light.css~`
> exists. It is gitignored (`git check-ignore` → IGNORED, now also covered by the `*.css~` pattern
> in `.gitignore`), so it is harmless to merges, but it can be deleted by hand for tidiness. Do not
> rely on it for anything.

---

## §2 Cadence

**Monthly heartbeat + advisory-triggered, with a hard 4-week ceiling.** Both decisions are settled.

- **Default:** pull on a **monthly** cadence.
- **Trigger:** pull **immediately** on any upstream **security advisory** — the engine is
  `loot-core` + `sync-server`, and security fixes there are the entire reason not to strand on a
  stale engine.
- **Ceiling:** **4-week maximum gap.** If a month passes with no pull, pull anyway.

Rationale: upstream churns fast (~55 files in ~2 days around the current merge-base). A quarterly
cadence would routinely produce large, scary merges; monthly keeps each merge small while overlap
with wnab's touched files stays near zero. This is a solo, low-frequency reskin, so weekly is
unnecessary overhead.

---

## §3 Strategy — merge, not rebase

**`git merge upstream/master` into `wnab`. Rebase is explicitly rejected for this branch.**
Settled.

Why merge:

- The `wnab` branch is **long-lived, published** (`origin/wnab`), and divergent. Merge preserves
  the reskin commits as-is and resolves each conflicting file **once**. A rebase re-presents the
  same conflict per-commit across every reskin commit it replays.
- Merge **never rewrites already-pushed history.** Rebasing a published branch would force a
  force-push, which `.github/agents/pr-and-commit-rules.md` forbids on shared branches.
- Upstream is effectively linear (PR-squash workflow; only rare structural merge commits), so a
  merge commit on `wnab` reads cleanly.

---

## §4 The merge procedure

Run from a **clean** working tree, on the `wnab` branch. Every command below is exact.

```sh
# 0. Pre-gate (cheap, catches most regressions before any visual check)
yarn typecheck
yarn lint

# 1. Fetch upstream
git fetch upstream

# 2. Recompute the merge-base (it moves every cycle — never hardcode it)
MB=$(git merge-base upstream/master wnab)
git diff --name-only "$MB" upstream/master      # what upstream moved this cycle
git diff --name-status "$MB" wnab               # our divergence catalog (compare to §1)

# 3. Be on the wnab branch
git checkout wnab

# 4. Merge upstream into wnab
git merge upstream/master
```

**Where to expect conflicts.** Only in the §1 catalog files — and only the ones upstream actually
touched this cycle (the `git diff --name-only "$MB" upstream/master` list above tells you which).
Engine packages never conflict because we never edit them. Watch especially:

- **`useFeatureFlag.ts` — the canary.** Upstream edits `DEFAULT_FEATURE_FLAG_STATE` whenever it
  ships a flag, so this conflicts first and most often. **Resolution recipe (≈30 seconds):**
  accept **theirs** for the whole `DEFAULT_FEATURE_FLAG_STATE` record (so any newly added upstream
  keys land), then **re-flip the two wnab keys** back to `true`:

  ```ts
  goalTemplatesEnabled: true,   // wnab: targets-based auto-assign engine on by default
  goalTemplatesUIEnabled: true, // wnab: per-category target editing UI on by default
  ```

- **`packages/desktop-electron/index.ts` — applied engine-adjacent divergence.** The
  data-dir relocation (`~/Documents/Finances/wnab/`) is now applied (uncommitted); expect a conflict here on merges
  where upstream touches the Electron bootstrap. Keep the wnab `ACTUAL_DOCUMENT_DIR` /
  `ACTUAL_DATA_DIR` overrides; accept upstream changes around them.

- **`ToBudgetAmount.tsx` / `BalanceWithCarryover.tsx` — structural, highest risk.** If upstream
  refactored either, the conflict is structural (not a one-liner). Re-apply the wnab pill + coaching
  block by hand on top of theirs. (The token refactor in the deferred Task 6 shrinks this blast
  radius.)

```sh
# 5. Reinstall dependencies (the merge may have moved yarn.lock / package.json)
yarn install

# 6. Rebuild native modules — ONLY if the engine or Electron version bumped.
#    better-sqlite3 / bcrypt are compiled against the Electron ABI; skipping this
#    after an ABI bump yields a cryptic RUNTIME crash, not a build error.
#    Check: did the merge change electron's version, or loot-core's native deps?
yarn rebuild-electron     # = electron-rebuild -m ./packages/desktop-electron -o better-sqlite3,bcrypt --build-from-source -f

# 7. The merge commit itself carries the [AI] prefix (per pr-and-commit-rules.md).
#    git produces a default merge message; amend/replace it to start with [AI]:
git commit            # if the merge paused for conflicts; ensure message begins "[AI] "
#    e.g.  [AI] Merge upstream/master (engine bump <old>..<new>)

# 8. Run the §5 smoke test BEFORE pushing.

# 9. Push
git push origin wnab
```

End the cycle clean: `origin/wnab` pushed, and a one-line note in the vault `journal/` if anything
non-obvious happened (a real conflict, a native rebuild, a theme break).

---

## §5 Post-merge smoke test

A merge can succeed textually yet break the look — `git` and `typecheck` cannot see a reordered CSS
import or a renamed `--palette-*` ramp. Only the visual check catches it, so it is non-optional.

**Cheap pre-gate (run first, before launching anything):**

```sh
yarn typecheck
yarn lint
```

**Browser path (the fast merge-verify):**

```sh
yarn start            # builds + serves the web client on http://localhost:3001
```

1. Open **http://localhost:3001**.
2. On the setup screen choose **"Don't use a server"** → **"View demo"** to load the
   pre-populated demo budget.
3. Switch to **Envelope** budgeting mode.
4. **Assign a dollar** to a category.
5. Confirm the **wnab theme renders** — cream/ink palette, Fira Code numerals, Nunito text, the
   38px row height, the "Assigned / Activity / Available" relabels, and the Ready-to-Assign banner
   pill.
6. **Confirm the `--palette-*` override still wins** — i.e. the theme tokens defined at the tail of
   `light.css` are not being overridden by an upstream import-order change. If the look reverted to
   stock Actual purple, the injection-order contract broke (palette.css must load before light.css);
   investigate before pushing.

**Packaged-app variant:** for the full Electron build + relaunch-persistence check (data written
under `~/Documents/Finances/wnab/data`), see the "Smoke test (also the post-merge check)" section
of [`ELECTRON-BUILD.md`](./ELECTRON-BUILD.md). Run that on the Mac after the browser path passes.

---

## Deferred follow-ups

- **Task 6 — token refactor of the two pill files.** Move the inlined hex in
  `ToBudgetAmount.tsx` and `BalanceWithCarryover.tsx` to wnab pill tokens defined in `light.css`,
  referencing them via `theme.*`. This shrinks the highest-conflict-risk structural surface in the
  catalog. Touches shared view files, so it is held as a separate, reviewed change.
- **Task 10 — first real merge + packaged-app verify on the Mac.** Execute one full monthly merge
  using §4, run the §5 browser smoke test, then `yarn build:desktop` and verify the packaged app
  (including the native-rebuild step and relaunch persistence). This is the proof the loop survives
  a real engine bump on hardware.

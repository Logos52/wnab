# wnab — real-budget population runbook

**Status:** ready to run. **Owner:** Wedge (deliberate budgeting is a sit-down act — this guides the
*mechanics*; the assigning/reconciling decisions are yours). **Last updated:** 2026-05-31.

Goal: get your real money flowing into wnab so the budget is usable and the Obsidian bridge moves
real numbers (today it exports an empty scaffold — verified 2026-05-31). Approach is the one the
Budget-App PRD already locked: **manual entry + monthly file import, no bank auto-sync**, on Actual's
native date+amount+payee matching.

Decisions for this pass (chosen 2026-05-31): **the credit card first**, **QFX exported from Wallet**
(cleaner signs/payees than CSV), **full Jan–May 2026 history**.

---

## What "done" looks like

1. A **credit card** on-budget account exists in wnab with the correct current balance.
2. All Jan–May 2026 card transactions imported, **purchases as outflows** (negative), payments
   as inflows, no duplicates.
3. You've run the beginner-core loop once: **assign every dollar → To Assign reaches $0**.
4. The account **reconciles** to your latest card statement balance.
5. You re-export the snapshot and ping me — I validate it and we lock `SNAPSHOT-SCHEMA.md`.

---

## Before you start — gather

- **Card statements as OFX/QFX.** In the **Wallet app → the card → tap a monthly statement →
  Export Transactions → OFX/QFX**. Do this for each statement covering Jan–May 2026 (≈5 files).
  Save them to `~/Documents/Finances/` (next to the existing CSV).
- **Your card balance owed as of ~Dec 31 2025** (the close of the December statement). This is
  the *starting balance* — see the trap below. You owe money on a card, so this is a **negative**
  number in wnab.
- The **existing CSV** (the card's CSV export) stays as a
  **fallback** — if a statement won't export OFX/QFX, use the CSV mapping in the appendix instead.

---

## Steps

### A. Create the card account
1. wnab → left sidebar → **Add account** → **Create a local account**.
2. Name: `Card`. Keep it **on budget** (do *not* check off-budget — you budget for card
   spending). If a type field is offered, choose **Credit**.
3. **Starting balance:** enter the **Dec 31 2025 balance owed as a negative number** (e.g. you owed
   $420.00 → `-420.00`). If you'd rather not chase the exact opening figure, see the trap below for
   the alternative.

### B. Fix the starting-balance date  ⚠️ (the one real trap)
wnab creates a **"Starting Balance"** transaction dated *today*. If you leave it there and then import
January–May history, the running balance **double-counts**. Fix it:
1. Open the card account register → find the **Starting Balance** transaction.
2. Edit its **date to `2025-12-31`** (just before the first imported transaction).
   Now history builds forward from the right opening point.

> Alternative if you don't want to find the Dec opening balance: set starting balance `0.00` dated
> `2025-12-31`, import everything, then **reconcile** (step E) to your current statement — Actual will
> offer to create one balance-adjustment transaction to true it up. Simpler, slightly less precise
> history. Either path is fine.

### C. Import the QFX files
1. Card account → **Import** (top of the register) → pick the **earliest** statement's
   `.qfx/.ofx` first, then repeat for each later one (chronological order keeps matching clean).
2. QFX/OFX carries signs natively, so there's **no column mapping and no flip** — Actual shows a
   preview directly. **Spot-check the first few rows:** purchases must show as **negative (outflow)**,
   payments/credits **positive (inflow)**. If they're reversed, stop and tell me before importing the
   rest.
3. Import. Re-importing an overlapping statement is safe — Actual dedups on **date + amount + similar
   payee**, and any transactions you'd already hand-entered get **matched + cleared**, not duplicated.
4. Note: the shared-card `Purchased By` field (another name on some rows) doesn't matter — they're all
   your card's charges; import them all.

### D. Budget the money (your call — the deliberate part)
This is *your* sit-down, not mine. Beginner-core loop:
1. Categorize the imported transactions (the card's own categories don't map to your envelopes —
   assign them to your `Food / General / Bills / Bills (Flexible) / Savings` categories).
2. **Assign every dollar** of available money to categories until **To Assign = $0**.
3. Cover any overspent (red) categories by moving dollars — "roll with the punches."

### E. Reconcile
Card account → **Reconcile** → enter your **latest statement's balance** → confirm the
difference is $0 (or let Actual create one adjustment). This proves the import + starting balance are
correct.

### F. Re-export the snapshot
wnab → **Settings → Export wnab snapshot**. Then **ping me** — I'll run the validator against the
populated `~/Documents/Finances/wnab/snapshot.json` and confirm the exporter's real-data paths
(accounts, transactions, age-of-money, category history) are correct, which lets us move
`SNAPSHOT-SCHEMA.md` from **proposed → locked**.

---

## Later: Checking + Bank (same pattern)
Identical flow, once you've exported each from the bank (QFX preferred, CSV fallback):
- **Checking** — on-budget, starting balance = opening balance (positive).
- **Bank** — on-budget, starting balance positive.
Both are manual file imports for now; SimpleFIN auto-sync stays deferred (needs a server we don't run).

---

## Safety / reversibility notes
- **Nothing here is committed or synced** — wnab is local-first, on-device. The snapshot contains no
  secrets and is never pushed.
- **Reversible:** if an import goes wrong, you can delete the account and redo it — start over clean
  rather than fight a bad mapping.
- **You never need me to touch your money.** I prep, guide, and validate; you drive the GUI and make
  the budgeting calls.

---

## Appendix — CSV fallback mapping (only if a statement won't export QFX)
Import the existing card's CSV export and map:
- **Date** ← `Transaction Date`
- **Payee** ← `Merchant` (or `Description`)
- **Amount** ← `Amount (USD)` — the card stores **purchases as positive**, but the engine wants
  outflows negative, so enable **"flip amount"** (or map as *outflow*). After mapping, verify a known
  **payment/credit** row shows as a **positive inflow** — if not, the flip is backwards.
- **Notes** ← `Description`
- Ignore `Clearing Date`, `Category`, `Type`, `Purchased By`.
CSV imports lose clean payee/sign handling vs QFX — that's why QFX is the primary path.

# wnab snapshot schema

**Status:** v1 — proposed (lock target). **schemaVersion:** `1`. **Last updated:** 2026-05-30.

The wnab snapshot is a single JSON file that wnab writes to a known local path and Obsidian
(and Cowork) read. It is the **one contract** shared by three consumers — keep it stable.

- **Owner:** the Obsidian↔wnab bridge (PRD `PRD-wnab-Obsidian-Bridge`). The schema is defined and
  versioned **here**; no other component may redefine it.
- **Consumers:**
  1. **Obsidian read-only overview** — `Finances.md` + the `Home.md` finance card (via the
     `loadSnapshot()` helper in `tools/finance-helpers.md`). Reads a **slice**.
  2. **wnab AI layer** (PRD `PRD-wnab-AI-Layer`) — Cowork reads the **same file** to draft
     explainable auto-assign. Reads the slice **plus** the extended fields (`upcomingBills`,
     `categoryHistory`).
- **Mechanism:** wnab exports the file; readers `JSON.parse(fs.readFileSync(...))`. No server, no
  sync, no write-back. The snapshot is **read-only** — nothing reads it to mutate wnab.

> Why a standalone doc: the roadmap critical path requires the schema to be a frozen, versioned
> artifact a downstream consumer can cite by file — not a JSON block buried in a plan. Until both
> extended fields below are folded in and this doc is marked **locked**, the schema is _proposed_,
> and downstream work (AI prototype, Finances rewrite) should not freeze against it.

---

## Path

```
~/Documents/Finances/wnab/snapshot.json
```

A **sibling** of the budget data, not inside it. wnab's Electron build relocates the engine data to
`~/Documents/Finances/wnab/{documents,data}/` (see `ELECTRON-BUILD.md` §1b); the snapshot sits
beside those at `~/Documents/Finances/wnab/snapshot.json`. The path is a **single shared constant**
in the exporter (wnab) and the reader (`tools/finance-helpers.md`) — change it in one place only.

The folder is outside the public repo and outside the vault git tree (it lives under the private
`~/Documents/Finances/` root), so financial data never enters either repo.

---

## Conventions (read before using any amount)

These exist because the retired CSV path used **float dollars**; the snapshot uses the engine's
native representation. Mixing them is the most likely bug.

| Convention       | Rule                                                                                                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit**         | Every monetary field is an **integer in minor units (cents)**, exactly as loot-core stores it. `amountUnit: "cents"` declares this. To display dollars: `cents / 100`. **Divide by 100 once, at render time only.**                                                                |
| **Sign**         | Engine sign convention: **negative = money out** (spending / outflow), **positive = money in** (income / inflow). `activity` (spent) is normally negative; `assigned` is normally ≥ 0; `available` may be negative (overspent). Bill `amount` is negative for an expense schedule. |
| **Dates**        | `generatedAt` is **ISO 8601 with timezone offset** (e.g. `2026-05-30T18:00:00-04:00`). Calendar dates (`nextDate`, transaction `date`) are `YYYY-MM-DD`. `month` is `YYYY-MM`.                                                                                                     |
| **IDs**          | All `id` values are the engine's opaque string IDs. Treat as stable join keys, not display text.                                                                                                                                                                                   |
| **Missing data** | Readers **must tolerate missing optional fields** (use a safe default) and **must ignore unknown fields** (forward-compat). A consumer must never throw because an optional block is absent.                                                                                       |

---

## Top-level shape (v1)

```jsonc
{
  "schemaVersion": 1, // integer; bump on any breaking change (see Versioning)
  "generatedAt": "2026-05-30T18:00:00-04:00",
  "generator": "wnab-desktop", // provenance; informational
  "currency": "USD",
  "amountUnit": "cents", // all amounts are integer minor units
  "budgetName": "Wedge",
  "month": "2026-05", // the budget month this snapshot summarizes

  // --- OVERVIEW SLICE (both consumers) ---
  "summary": {
    /* see §summary — straight from getBudgetMonth(month) */
  },
  "categoryGroups": [
    /* see §categoryGroups */
  ],
  "accounts": [
    /* see §accounts */
  ],
  "ageOfMoney": {
    /* see §ageOfMoney */
  },
  "recentTransactions": [
    /* see §recentTransactions */
  ],

  // --- EXTENDED FIELDS (AI layer; overview ignores) ---
  "upcomingBills": [
    /* see §upcomingBills  — from getSchedules() */
  ],
  "categoryHistory": [
    /* see §categoryHistory — per-category N-month activity + average */
  ],
}
```

**Who reads what.** The overview renders `summary`, `categoryGroups`, `accounts`, `ageOfMoney`, and
`recentTransactions`, and **ignores** `upcomingBills` + `categoryHistory`. The AI auto-assign
workflow reads all of it and **requires** `upcomingBills` + `categoryHistory` (a suggestion without
upcoming bills + history is guesswork). Both blocks are present from v1; "version-gated" means a
reader keys off `schemaVersion` and tolerates their absence rather than assuming them.

---

## Field reference

### `summary` — month totals

Straight from `getBudgetMonth(month)` (`api/budget-month`). All cents.

| Field                | Meaning                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `toBudget`           | **To Assign** / Ready-to-Assign. Can be negative (over-assigned). |
| `totalIncome`        | Income received this month.                                       |
| `totalBudgeted`      | Total assigned across categories.                                 |
| `totalSpent`         | Total activity this month (normally negative).                    |
| `totalBalance`       | Total available across categories.                                |
| `fromLastMonth`      | Carried in from the prior month.                                  |
| `forNextMonth`       | Assigned ahead to next month.                                     |
| `incomeAvailable`    | Income available to assign.                                       |
| `lastMonthOverspent` | Overspending carried from last month.                             |

### `categoryGroups`

```jsonc
{
  "id": "grp-…",
  "name": "Immediate Obligations",
  "isIncome": false,
  "hidden": false,
  "budgeted": 120000,
  "spent": -84231,
  "balance": 35769, // group rollups (cents)
  "categories": [
    {
      "id": "cat-…",
      "name": "Groceries",
      "hidden": false,
      "assigned": 60000, // engine "budgeted"
      "activity": -52310, // engine "spent" (negative = outflow)
      "available": 7690, // engine "balance" (may be negative)
      "carryover": true, // does leftover roll to next month
    },
  ],
}
```

`assigned` / `activity` / `available` are the human-readable aliases for loot-core's
`budgeted` / `spent` / `balance` — so neither reader learns engine jargon. The income group has
`isIncome: true`; readers should treat it separately (it is not an envelope).

### `accounts`

From `getAccounts()` + `getAccountBalance(id)`.

```jsonc
{
  "id": "acc-…",
  "name": "Card",
  "offbudget": false,
  "closed": false,
  "balance": -41200,
}
```

### `ageOfMoney`

From the pure FIFO `calculateAgeOfMoney` / `calculateAverageAge` functions.

```jsonc
{ "currentAge": 23, "trend": "improving", "insufficientData": false }
```

| Field              | Meaning                                                                                                                                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `currentAge`       | Age of money in **days** (integer).                                                                                                                                                                                                                                                     |
| `trend`            | One of **`"improving"` \| `"stable"` \| `"declining"`**. Compare `currentAge` to its value one window ago (default 30 days): older money → `"improving"`; younger → `"declining"`; within a small threshold → `"stable"`. **Always emit `"stable"` when `insufficientData` is `true`.** |
| `insufficientData` | `true` when there is not enough transaction history to compute a meaningful age. When `true`, the overview shows a neutral state, not a misleading number.                                                                                                                              |

### `recentTransactions`

A bounded recent window (recommend **last 60 days**, capped at a sane count) serving the overview's
"recent activity" list and the AI's raw-history needs.

```jsonc
{
  "id": "txn-…",
  "date": "2026-05-29",
  "account": "Card",
  "payee": "Trader Joe's",
  "category": "Groceries",
  "amount": -4231,
  "cleared": true,
  "notes": "",
}
```

`category` / `account` are display names; `amount` is signed cents; `cleared` reflects the
engine's cleared/uncleared (reconciliation) state.

### `upcomingBills` _(extended — AI layer)_

From `getSchedules()`. The next ~30–60 days of scheduled obligations, so auto-assign can fund what's
actually coming due.

```jsonc
{
  "id": "sch-…",
  "name": "Rent",
  "nextDate": "2026-06-01",
  "amount": -180000,
  "frequency": "monthly",
  "interval": 1,
  "category": "Rent",
  "categoryId": "cat-…",
  "completed": false,
}
```

| Field                     | Meaning                                                                                                                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nextDate`                | Next occurrence, `YYYY-MM-DD`.                                                                                                                                                                                                      |
| `amount`                  | Signed cents (negative for an expense schedule).                                                                                                                                                                                    |
| `frequency`               | Normalized recurrence: **`"once"` \| `"daily"` \| `"weekly"` \| `"monthly"` \| `"yearly"` \| `"custom"`**. Derived from the schedule's recurrence config; non-recurring → `"once"`; anything that doesn't map cleanly → `"custom"`. |
| `interval`                | Integer multiplier on `frequency` (every 2 weeks → `frequency:"weekly", interval:2`). Defaults to `1`.                                                                                                                              |
| `category` / `categoryId` | Target category, or `null` if the schedule isn't categorized.                                                                                                                                                                       |
| `completed`               | Whether this occurrence is already satisfied.                                                                                                                                                                                       |

### `categoryHistory` _(extended — AI layer)_

Per-category recent activity + the engine's N-month average, so a suggestion can reason from
spending patterns rather than a single month.

```jsonc
{
  "categoryId": "cat-…",
  "category": "Groceries",
  "months": [
    { "month": "2026-03", "activity": -49880 },
    { "month": "2026-04", "activity": -51120 },
    { "month": "2026-05", "activity": -52310 },
  ],
  "average": -51103, // engine N-month average (cents), the value targets/templates use
}
```

Recommend **3–6 months** of `months`. `average` is the **mean of the provided `months[]` activity**
— a proxy for the household's real spending pace, derived from the engine-authoritative monthly sums
(the consumer does **not** recompute it from raw transactions). Ideally `average` would mirror
loot-core's own N-month goal-template average (enabled in wnab at `c9f366503`), but that value is
computed only inside mutators with no read-only handler, so wiring the exact engine number is a
deferred enhancement (see Open items) — not worth an engine edit for v1. The `months[]` sums are
authoritative; `average` is derived from them.

---

## Versioning policy

- `schemaVersion` is an integer, starting at **1**.
- **Non-breaking (no bump required):** adding a new **optional** field. Readers already ignore
  unknown fields, so additive growth is safe. Document the addition here regardless.
- **Breaking (MUST bump `schemaVersion`):** renaming a field, removing a field, changing a type,
  or changing a **unit or sign** convention. These break readers silently — that's the whole reason
  for the version field.
- **Reader obligations:** ignore unknown fields; default missing optional fields; and **check
  `schemaVersion`** — a consumer should warn (overview) or refuse (AI) if it sees a _major_ version
  it doesn't understand, rather than misread the data.
- One schema, one superset. Do **not** create a second "AI snapshot" — divergence is exactly what
  this doc prevents.

---

## Edge cases the exporter must serialize without throwing

- **Negative To Assign** (`summary.toBudget < 0`) — over-assigned; valid, render as a coaching
  moment, not an error.
- **Overspent category** (`available < 0`) — valid; the overview shows it red.
- **Hidden categories / groups** — include with `hidden: true`; readers decide whether to show.
- **Off-budget & closed accounts** — include with `offbudget` / `closed` flags; the overview can
  filter, but the data is present.
- **Income-only group** — `isIncome: true`; not an envelope.
- **Insufficient age-of-money history** — `insufficientData: true`, `trend: "stable"`.
- **No schedules** — `upcomingBills: []` (empty array, never omitted/null).
- **Empty budget / first run** — every array is `[]`, every total `0`; the file is still valid.

## Staleness

`generatedAt` drives the overview's "as of <time>" stamp. The overview should grey the figure when
the snapshot is older than ~24h, so a stale snapshot reads as stale rather than authoritative.
Export cadence (per the Bridge plan): a manual Settings button **plus** an Electron `before-quit`
on-close export. No scheduler.

---

## Worked example

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-05-30T18:00:00-04:00",
  "generator": "wnab-desktop",
  "currency": "USD",
  "amountUnit": "cents",
  "budgetName": "Wedge",
  "month": "2026-05",
  "summary": {
    "toBudget": 0,
    "totalIncome": 540000,
    "totalBudgeted": 540000,
    "totalSpent": -317540,
    "totalBalance": 222460,
    "fromLastMonth": 0,
    "forNextMonth": 0,
    "incomeAvailable": 540000,
    "lastMonthOverspent": 0
  },
  "categoryGroups": [
    {
      "id": "grp-income",
      "name": "Income",
      "isIncome": true,
      "hidden": false,
      "budgeted": 0,
      "spent": 540000,
      "balance": 0,
      "categories": []
    },
    {
      "id": "grp-immediate",
      "name": "Immediate Obligations",
      "isIncome": false,
      "hidden": false,
      "budgeted": 380000,
      "spent": -284510,
      "balance": 95490,
      "categories": [
        {
          "id": "cat-rent",
          "name": "Rent",
          "hidden": false,
          "assigned": 180000,
          "activity": -180000,
          "available": 0,
          "carryover": false
        },
        {
          "id": "cat-groceries",
          "name": "Groceries",
          "hidden": false,
          "assigned": 60000,
          "activity": -52310,
          "available": 7690,
          "carryover": true
        },
        {
          "id": "cat-utilities",
          "name": "Utilities",
          "hidden": false,
          "assigned": 14000,
          "activity": -12200,
          "available": 1800,
          "carryover": false
        }
      ]
    },
    {
      "id": "grp-true-expenses",
      "name": "True Expenses",
      "isIncome": false,
      "hidden": false,
      "budgeted": 160000,
      "spent": -33030,
      "balance": 126970,
      "categories": [
        {
          "id": "cat-car",
          "name": "Car Maintenance",
          "hidden": false,
          "assigned": 40000,
          "activity": 0,
          "available": 40000,
          "carryover": true
        },
        {
          "id": "cat-medical",
          "name": "Medical",
          "hidden": false,
          "assigned": 25000,
          "activity": -33030,
          "available": -8030,
          "carryover": true
        }
      ]
    }
  ],
  "accounts": [
    {
      "id": "acc-card",
      "name": "Card",
      "offbudget": false,
      "closed": false,
      "balance": -41200
    },
    {
      "id": "acc-checking",
      "name": "Checking",
      "offbudget": false,
      "closed": false,
      "balance": 263660
    },
    {
      "id": "acc-bank",
      "name": "Bank",
      "offbudget": false,
      "closed": false,
      "balance": 80100
    }
  ],
  "ageOfMoney": {
    "currentAge": 23,
    "trend": "improving",
    "insufficientData": false
  },
  "recentTransactions": [
    {
      "id": "txn-1",
      "date": "2026-05-29",
      "account": "Card",
      "payee": "Trader Joe's",
      "category": "Groceries",
      "amount": -4231,
      "cleared": true,
      "notes": ""
    },
    {
      "id": "txn-2",
      "date": "2026-05-28",
      "account": "Checking",
      "payee": "City Power",
      "category": "Utilities",
      "amount": -12200,
      "cleared": true,
      "notes": "May bill"
    }
  ],
  "upcomingBills": [
    {
      "id": "sch-rent",
      "name": "Rent",
      "nextDate": "2026-06-01",
      "amount": -180000,
      "frequency": "monthly",
      "interval": 1,
      "category": "Rent",
      "categoryId": "cat-rent",
      "completed": false
    },
    {
      "id": "sch-car-ins",
      "name": "Car Insurance",
      "nextDate": "2026-06-12",
      "amount": -14800,
      "frequency": "monthly",
      "interval": 1,
      "category": "Car Maintenance",
      "categoryId": "cat-car",
      "completed": false
    }
  ],
  "categoryHistory": [
    {
      "categoryId": "cat-groceries",
      "category": "Groceries",
      "months": [
        { "month": "2026-03", "activity": -49880 },
        { "month": "2026-04", "activity": -51120 },
        { "month": "2026-05", "activity": -52310 }
      ],
      "average": -51103
    }
  ]
}
```

---

## Source map (engine → field) and build notes

| Snapshot block              | Engine source                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `summary`, `categoryGroups` | `getBudgetMonth(month)` → `api/budget-month` (`loot-core/src/server/api.ts`)                                                    |
| `accounts`                  | `getAccounts()` + `getAccountBalance(id)` (`api/methods.ts`)                                                                    |
| `ageOfMoney`                | pure FIFO `calculateAgeOfMoney` / `calculateAverageAge` (`desktop-client/.../reports/spreadsheets/age-of-money-spreadsheet.ts`) |
| `recentTransactions`        | `getTransactions(accountId, startDate, endDate)` (`api/methods.ts`)                                                             |
| `upcomingBills`             | `getSchedules()` → `api/schedules-get`                                                                                          |
| `categoryHistory`           | per-category monthly activity + the N-month average loot-core computes for goal templates                                       |

**Engine stays unmolested.** The exporter is a thin new routine that _reads_ these existing
handlers and assembles the object — no change to any engine query (keeps the upstream merge seam
clean; see `UPSTREAM-MERGE.md`). One wrinkle to confirm during the Bridge build: Age of Money lives
in a desktop-client _report_ function, not an engine primitive — compute it in the desktop-client
export path (lower risk, v1) rather than lifting the functions into `loot-core` (an engine change).

---

## Consumer guidance (auto-assign & overview)

A synthetic AI-layer dry-run exercised v1 (see the vault note `ai-layer-cowork-workflow.md`) and
surfaced these consumer-side ambiguities. They are answered here so every reader behaves the same;
none of this changes the wire format.

- **Overspent categories.** `available < 0` means the category is overspent by `|available|` cents.
  To clear it, assign `+|available|` (e.g. `available: -11250` → assign `11250` to reach `0`). The
  overview renders it red; auto-assign covers it under "roll with the punches."
- **Hidden categories / groups.** Present with `hidden: true` for completeness. Auto-assign and the
  default overview **skip hidden** categories (do not suggest funding them); a reader may surface
  them in a separate view if it chooses.
- **Income & next-paycheck inference.** There is no dedicated paycheck field. Income is identified by
  the `categoryGroups[].isIncome === true` group and by positive `recentTransactions[].amount`; pay
  cadence (e.g. 1st / 15th) is _inferred_ from those transaction dates. If cadence can't be inferred,
  treat the whole `month` as the funding window. (If this inference proves unreliable on real data,
  an additive `nextIncomeDate` field is the version-gated fix — do not invent it client-side.)
- **`upcomingBills` window & absence.** The array lists scheduled obligations whose `nextDate` falls
  within ~the next 60 days of `generatedAt`. An **absent** bill means "no schedule in that window,"
  **not** "no obligation ever" — a reader must not infer a category is bill-free from omission. An
  empty array is `[]`, never null.
- **`categoryHistory` length.** Include up to 6 months (3–6 recommended); a new budget may carry
  fewer, and a reader **must** tolerate `months.length < 3` (fall back to the provided `average`, or
  to `assigned` when history is empty). `average` is always the engine's value, never recomputed.

## Open items before this doc is marked **locked**

1. **Confirm reachability** of every field through stable `@actual-app/api` handlers when the export
   routine is actually built (Bridge Task 2/6) — especially the Age-of-Money path above.
2. **Pin `recentTransactions` window** (60 days vs last-N) against a real budget so the file stays
   small but the overview's "recent activity" looks right.
3. **Validate `frequency` normalization** against real Actual schedule recurrence configs (map the
   engine's `{frequency, interval}` to this enum; verify nothing common falls into `"custom"`).
4. Produce **one real snapshot** from Wedge's budget and eyeball it against this doc; iterate field
   shapes here **before** the AI prototype and the Finances rewrite freeze against them.

Once 1–4 are confirmed against a real export, change the status line to **locked** and treat any
further change as a `schemaVersion` decision.

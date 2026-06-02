// wnab → Obsidian snapshot exporter.
//
// Gathers the budget state through the SAME renderer-side handlers the rest of
// the desktop client already uses (`send(...)` + AQL queries), and assembles a
// single JSON object that conforms exactly to docs/SNAPSHOT-SCHEMA.md (v1).
//
// Conventions enforced here (see the schema's "Conventions" table):
//   - every monetary field is an integer in minor units (cents), as loot-core
//     stores it — never divided by 100;
//   - sign is engine-native: negative = money out, positive = money in;
//   - dates are YYYY-MM-DD / YYYY-MM; `generatedAt` is ISO-8601 with offset.
//
// The engine stays unmolested: this is a thin read-only assembler. No new or
// edited engine query.

import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';

import {
  calculateAgeOfMoney,
  calculateAverageAge,
} from '#components/reports/spreadsheets/age-of-money-spreadsheet';
import type { Transaction as AgeTransaction } from '#components/reports/spreadsheets/age-of-money-spreadsheet';
import { aqlQuery } from '#queries/aqlQuery';

export const SNAPSHOT_SCHEMA_VERSION = 1;

// How far back the bounded windows reach (recentTransactions + upcomingBills).
const RECENT_WINDOW_DAYS = 60;
const UPCOMING_WINDOW_DAYS = 60;
// Months of per-category history to carry (schema recommends 3–6).
const HISTORY_MONTHS = 6;

type SnapshotSummary = {
  toBudget: number;
  totalIncome: number;
  totalBudgeted: number;
  totalSpent: number;
  totalBalance: number;
  fromLastMonth: number;
  forNextMonth: number;
  incomeAvailable: number;
  lastMonthOverspent: number;
};

type SnapshotCategory = {
  id: string;
  name: string;
  hidden: boolean;
  assigned: number;
  activity: number;
  available: number;
  carryover: boolean;
};

type SnapshotCategoryGroup = {
  id: string;
  name: string;
  isIncome: boolean;
  hidden: boolean;
  budgeted: number;
  spent: number;
  balance: number;
  categories: SnapshotCategory[];
};

type SnapshotAccount = {
  id: string;
  name: string;
  offbudget: boolean;
  closed: boolean;
  balance: number;
};

type SnapshotAgeOfMoney = {
  currentAge: number;
  trend: 'improving' | 'stable' | 'declining';
  insufficientData: boolean;
};

type SnapshotTransaction = {
  id: string;
  date: string;
  account: string;
  payee: string;
  category: string;
  amount: number;
  cleared: boolean;
  notes: string;
};

type SnapshotBill = {
  id: string;
  name: string;
  nextDate: string | null;
  amount: number;
  frequency: 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  interval: number;
  category: string | null;
  categoryId: string | null;
  completed: boolean;
};

type SnapshotCategoryHistory = {
  categoryId: string;
  category: string;
  months: Array<{ month: string; activity: number }>;
  average: number;
};

export type WnabSnapshot = {
  schemaVersion: number;
  generatedAt: string;
  generator: string;
  currency: string;
  amountUnit: 'cents';
  budgetName: string;
  month: string;
  summary: SnapshotSummary;
  categoryGroups: SnapshotCategoryGroup[];
  accounts: SnapshotAccount[];
  ageOfMoney: SnapshotAgeOfMoney;
  recentTransactions: SnapshotTransaction[];
  upcomingBills: SnapshotBill[];
  categoryHistory: SnapshotCategoryHistory[];
};

// --- helpers -------------------------------------------------------------

function toCents(value: unknown): number {
  // Engine amounts are already integer cents; coerce defensively so a missing
  // value never becomes NaN in the file.
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value)
    : 0;
}

function toBool(value: unknown): boolean {
  return value === true || value === 1;
}

function toStr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

// ISO-8601 timestamp WITH the local timezone offset (e.g. ...-04:00), as the
// schema requires for `generatedAt`. `Date#toISOString` is always UTC (Z), so
// build the offset by hand.
function isoWithOffset(date: Date): string {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const tzMin = -date.getTimezoneOffset();
  const sign = tzMin >= 0 ? '+' : '-';
  const offset =
    tzMin === 0 ? 'Z' : `${sign}${pad(tzMin / 60)}:${pad(tzMin % 60)}`;
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    offset
  );
}

// Map loot-core's recurrence config to the schema's frequency enum. A schedule
// whose date is a plain string is one-time; a RecurConfig carries
// frequency/interval; anything unexpected falls back to "custom".
function normalizeFrequency(scheduleDate: unknown): {
  frequency: SnapshotBill['frequency'];
  interval: number;
} {
  if (typeof scheduleDate === 'string') {
    return { frequency: 'once', interval: 1 };
  }
  if (scheduleDate && typeof scheduleDate === 'object') {
    const config = scheduleDate as {
      frequency?: string;
      interval?: number;
      patterns?: unknown[];
    };
    const interval =
      typeof config.interval === 'number' && config.interval > 0
        ? config.interval
        : 1;
    // A custom weekday/day pattern (e.g. "2nd Tuesday") doesn't map cleanly to
    // the plain enum — surface it as "custom" so a reader doesn't misread it.
    const hasPatterns =
      Array.isArray(config.patterns) && config.patterns.length > 0;
    switch (config.frequency) {
      case 'daily':
        return { frequency: 'daily', interval };
      case 'weekly':
        return {
          frequency: hasPatterns ? 'custom' : 'weekly',
          interval,
        };
      case 'monthly':
        return {
          frequency: hasPatterns ? 'custom' : 'monthly',
          interval,
        };
      case 'yearly':
        return { frequency: 'yearly', interval };
      default:
        return { frequency: 'custom', interval };
    }
  }
  return { frequency: 'once', interval: 1 };
}

// Schedule amount is either a single number or an isbetween {num1,num2}; take
// the midpoint of a range so the bill still has a usable signed figure.
function scheduleAmountToCents(amount: unknown): number {
  if (typeof amount === 'number') {
    return toCents(amount);
  }
  if (amount && typeof amount === 'object') {
    const range = amount as { num1?: number; num2?: number };
    if (typeof range.num1 === 'number' && typeof range.num2 === 'number') {
      return toCents((range.num1 + range.num2) / 2);
    }
    if (typeof range.num1 === 'number') {
      return toCents(range.num1);
    }
  }
  return 0;
}

// Pull a category id out of a schedule's underlying rule actions, if one is
// set. Schedules have no native category column, so this is best-effort and
// tolerantly returns null when absent.
function categoryIdFromSchedule(schedule: unknown): string | null {
  if (!schedule || typeof schedule !== 'object') {
    return null;
  }
  const actions = (schedule as { _actions?: unknown })._actions;
  if (!Array.isArray(actions)) {
    return null;
  }
  for (const action of actions) {
    if (
      action &&
      typeof action === 'object' &&
      (action as { field?: string; op?: string }).field === 'category' &&
      (action as { op?: string }).op === 'set'
    ) {
      const value = (action as { value?: unknown }).value;
      if (typeof value === 'string') {
        return value;
      }
    }
  }
  return null;
}

// --- builder -------------------------------------------------------------

type BuildOptions = {
  budgetName?: string;
  currency?: string;
};

export async function buildWnabSnapshot(
  options: BuildOptions = {},
): Promise<WnabSnapshot> {
  const generatedAt = isoWithOffset(new Date());
  const month = monthUtils.currentMonth();

  // --- summary + categoryGroups: getBudgetMonth(month) -------------------
  const budgetMonth = (await send('api/budget-month', { month })) as Record<
    string,
    unknown
  >;

  const summary: SnapshotSummary = {
    toBudget: toCents(budgetMonth.toBudget),
    totalIncome: toCents(budgetMonth.totalIncome),
    totalBudgeted: toCents(budgetMonth.totalBudgeted),
    totalSpent: toCents(budgetMonth.totalSpent),
    totalBalance: toCents(budgetMonth.totalBalance),
    fromLastMonth: toCents(budgetMonth.fromLastMonth),
    forNextMonth: toCents(budgetMonth.forNextMonth),
    incomeAvailable: toCents(budgetMonth.incomeAvailable),
    lastMonthOverspent: toCents(budgetMonth.lastMonthOverspent),
  };

  const rawGroups = Array.isArray(budgetMonth.categoryGroups)
    ? (budgetMonth.categoryGroups as Array<Record<string, unknown>>)
    : [];

  const categoryGroups: SnapshotCategoryGroup[] = rawGroups.map(group => {
    const rawCategories = Array.isArray(group.categories)
      ? (group.categories as Array<Record<string, unknown>>)
      : [];

    return {
      id: toStr(group.id),
      name: toStr(group.name),
      isIncome: toBool(group.is_income),
      hidden: toBool(group.hidden),
      // Income groups report `received` instead of `spent`; the schema's
      // example puts income inflow in `spent` (positive). Prefer `spent`,
      // fall back to `received`.
      budgeted: toCents(group.budgeted),
      spent: toCents(group.spent ?? group.received),
      balance: toCents(group.balance),
      categories: rawCategories.map(cat => ({
        id: toStr(cat.id),
        name: toStr(cat.name),
        hidden: toBool(cat.hidden),
        assigned: toCents(cat.budgeted),
        activity: toCents(cat.spent ?? cat.received),
        available: toCents(cat.balance),
        carryover: toBool(cat.carryover),
      })),
    };
  });

  // --- accounts: accounts-get + per-account balance ----------------------
  const accounts = await buildAccounts();

  // --- ageOfMoney: pure FIFO functions over income/expense txns ----------
  const ageOfMoney = await buildAgeOfMoney();

  // --- recentTransactions: bounded recent window ------------------------
  const recentTransactions = await buildRecentTransactions();

  // --- upcomingBills: getSchedules() within the window ------------------
  const upcomingBills = await buildUpcomingBills(categoryGroups);

  // --- categoryHistory: per variable category, months + average ---------
  const categoryHistory = await buildCategoryHistory(month, categoryGroups);

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    generatedAt,
    generator: 'wnab-desktop',
    currency: options.currency || 'USD',
    amountUnit: 'cents',
    budgetName: options.budgetName || '',
    month,
    summary,
    categoryGroups,
    accounts,
    ageOfMoney,
    recentTransactions,
    upcomingBills,
    categoryHistory,
  };
}

async function buildAccounts(): Promise<SnapshotAccount[]> {
  let rawAccounts: Array<Record<string, unknown>> = [];
  try {
    const result = await send('accounts-get');
    rawAccounts = Array.isArray(result)
      ? (result as Array<Record<string, unknown>>)
      : [];
  } catch {
    return [];
  }

  const accounts: SnapshotAccount[] = [];
  for (const account of rawAccounts) {
    const id = toStr(account.id);
    if (!id) {
      continue;
    }
    let balance = 0;
    try {
      balance = toCents(await send('api/account-balance', { id }));
    } catch {
      balance = 0;
    }
    accounts.push({
      id,
      name: toStr(account.name),
      offbudget: toBool(account.offbudget),
      closed: toBool(account.closed),
      balance,
    });
  }
  return accounts;
}

async function buildAgeOfMoney(): Promise<SnapshotAgeOfMoney> {
  const insufficient: SnapshotAgeOfMoney = {
    currentAge: 0,
    trend: 'stable',
    insufficientData: true,
  };

  try {
    const today = monthUtils.currentDay();

    // FIFO needs complete income/expense history up to today. Mirror the
    // report's queries: on-budget only, excluding on-budget→on-budget
    // transfers (money merely moving between accounts is not income/spend).
    const transferFilter = {
      'account.offbudget': false,
      $or: [
        { 'payee.transfer_acct': null },
        { 'payee.transfer_acct.offbudget': true },
      ],
    };

    const incomeQuery = q('transactions')
      .filter({ ...transferFilter, date: { $lte: today }, amount: { $gt: 0 } })
      .select(['id', 'date', 'amount']);
    const expenseQuery = q('transactions')
      .filter({ ...transferFilter, date: { $lte: today }, amount: { $lt: 0 } })
      .select(['id', 'date', 'amount']);

    const [{ data: incomeData }, { data: expenseData }] = await Promise.all([
      aqlQuery(incomeQuery),
      aqlQuery(expenseQuery),
    ]);

    const income = (incomeData ?? []) as AgeTransaction[];
    const expenses = (expenseData ?? []) as AgeTransaction[];

    const { ages, insufficientData } = calculateAgeOfMoney(income, expenses);
    if (insufficientData || ages.length === 0) {
      return insufficient;
    }

    const currentAge = calculateAverageAge(ages, 10);
    if (currentAge == null) {
      return insufficient;
    }

    // Trend per the schema: compare current age to its value one ~30-day
    // window ago. Older money => "improving"; younger => "declining"; within a
    // small threshold => "stable".
    const priorWindowEnd = monthUtils.subDays(today, 30);
    const priorAges = ages.filter(({ date }) => date <= priorWindowEnd);
    let trend: SnapshotAgeOfMoney['trend'] = 'stable';
    if (priorAges.length > 0) {
      const priorAge = calculateAverageAge(priorAges, 10);
      if (priorAge != null) {
        const diff = currentAge - priorAge;
        const threshold = 2;
        if (diff > threshold) {
          trend = 'improving';
        } else if (diff < -threshold) {
          trend = 'declining';
        }
      }
    }

    return {
      currentAge: Math.max(0, Math.round(currentAge)),
      trend,
      insufficientData: false,
    };
  } catch {
    return insufficient;
  }
}

async function buildRecentTransactions(): Promise<SnapshotTransaction[]> {
  try {
    const today = monthUtils.currentDay();
    const startDate = monthUtils.subDays(today, RECENT_WINDOW_DAYS);

    const query = q('transactions')
      .filter({ date: { $gte: startDate, $lte: today } })
      .options({ splits: 'inline' })
      .orderBy({ date: 'desc' })
      .limit(200)
      .select([
        'id',
        'date',
        'amount',
        'cleared',
        'notes',
        'account.name',
        'payee.name',
        'category.name',
      ]);

    const { data } = await aqlQuery(query);
    const rows = Array.isArray(data)
      ? (data as Array<Record<string, unknown>>)
      : [];

    return rows.map(row => {
      // AQL may return joined names either nested ({account: {name}}) or as a
      // flat dotted key ("account.name"); read both tolerantly.
      const joinedName = (key: 'account' | 'payee' | 'category') => {
        const nested = row[key] as { name?: unknown } | null;
        if (nested && typeof nested === 'object' && 'name' in nested) {
          return toStr(nested.name);
        }
        return toStr(row[`${key}.name`]);
      };
      return {
        id: toStr(row.id),
        date: toStr(row.date),
        account: joinedName('account'),
        payee: joinedName('payee'),
        category: joinedName('category'),
        amount: toCents(row.amount),
        cleared: toBool(row.cleared),
        notes: toStr(row.notes),
      };
    });
  } catch {
    return [];
  }
}

async function buildUpcomingBills(
  categoryGroups: SnapshotCategoryGroup[],
): Promise<SnapshotBill[]> {
  // Build a categoryId → name lookup from the budget month we already have, so
  // a bill's category can be shown by name without another query.
  const categoryNameById = new Map<string, string>();
  for (const group of categoryGroups) {
    for (const cat of group.categories) {
      categoryNameById.set(cat.id, cat.name);
    }
  }

  let raw: Array<Record<string, unknown>> = [];
  try {
    // Query schedules directly so we also get _actions (for category) and the
    // _date recurrence config, which the public api/schedules-get strips.
    const { data } = await aqlQuery(q('schedules').select('*'));
    raw = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
  } catch {
    // Fall back to the public handler (no category/recurrence detail).
    try {
      const data = await send('api/schedules-get');
      raw = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
    } catch {
      return [];
    }
  }

  const today = monthUtils.currentDay();
  const windowEnd = monthUtils.addDays(today, UPCOMING_WINDOW_DAYS);

  const bills: SnapshotBill[] = [];
  for (const schedule of raw) {
    if (toBool(schedule.tombstone)) {
      continue;
    }
    const nextDate = toStr(schedule.next_date) || null;
    // Keep only occurrences within the upcoming window; tolerate missing dates
    // by including them (a reader can decide).
    if (nextDate && (nextDate < today || nextDate > windowEnd)) {
      continue;
    }

    // _date may be present (raw schedules) or `date` (api/schedules-get).
    const recurrence = schedule._date ?? schedule.date;
    const { frequency, interval } = normalizeFrequency(recurrence);

    // _amount on raw schedules, `amount` on the public shape.
    const amount = scheduleAmountToCents(schedule._amount ?? schedule.amount);

    const categoryId =
      categoryIdFromSchedule(schedule) ??
      (typeof schedule.categoryId === 'string' ? schedule.categoryId : null);

    bills.push({
      id: toStr(schedule.id),
      name: toStr(schedule.name),
      nextDate,
      amount,
      frequency,
      interval,
      category: categoryId ? (categoryNameById.get(categoryId) ?? null) : null,
      categoryId,
      completed: toBool(schedule.completed),
    });
  }

  return bills;
}

async function buildCategoryHistory(
  month: string,
  categoryGroups: SnapshotCategoryGroup[],
): Promise<SnapshotCategoryHistory[]> {
  // Variable categories only: skip income groups and hidden categories — a
  // history for those is not what auto-assign reasons over.
  const variableCategories: Array<{ id: string; name: string }> = [];
  for (const group of categoryGroups) {
    if (group.isIncome) {
      continue;
    }
    for (const cat of group.categories) {
      if (!cat.hidden) {
        variableCategories.push({ id: cat.id, name: cat.name });
      }
    }
  }

  if (variableCategories.length === 0) {
    return [];
  }

  // Build the inclusive list of recent months [start .. month].
  const startMonth = monthUtils.subMonths(month, HISTORY_MONTHS - 1);
  const months = monthUtils.rangeInclusive(startMonth, month);
  const rangeStart = monthUtils.firstDayOfMonth(startMonth);
  const rangeEnd = monthUtils.lastDayOfMonth(month);

  // One grouped query: sum activity per (category, month) across the window.
  let rows: Array<Record<string, unknown>> = [];
  try {
    const query = q('transactions')
      .filter({ date: { $gte: rangeStart, $lte: rangeEnd } })
      .options({ splits: 'inline' })
      .groupBy([{ $month: '$date' }, { $id: '$category' }])
      .select([
        { month: { $month: '$date' } },
        { category: { $id: '$category.id' } },
        { amount: { $sum: '$amount' } },
      ]);
    const { data } = await aqlQuery(query);
    rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
  } catch {
    rows = [];
  }

  // activityByCategory[categoryId][month] = cents
  const activityByCategory = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const categoryId = toStr(row.category);
    if (!categoryId) {
      continue;
    }
    const rowMonth = monthUtils.getMonth(toStr(row.month));
    if (!activityByCategory.has(categoryId)) {
      activityByCategory.set(categoryId, new Map());
    }
    activityByCategory.get(categoryId)!.set(rowMonth, toCents(row.amount));
  }

  const history: SnapshotCategoryHistory[] = [];
  for (const cat of variableCategories) {
    const byMonth = activityByCategory.get(cat.id);
    const monthEntries = months.map(m => ({
      month: m,
      activity: byMonth?.get(m) ?? 0,
    }));

    // NOTE: the schema asks for the engine's authoritative N-month average
    // (the value goal templates use). There is no read-only handler that
    // returns it — the engine only computes it inside the template-apply
    // mutators (budget/set-n-month-avg), which we must not invoke. So `average`
    // here is the mean of the months we already provide. A reader gets a
    // stable, present number; wiring the engine value is a deferred follow-up.
    const sum = monthEntries.reduce((acc, m) => acc + m.activity, 0);
    const average = monthEntries.length
      ? Math.round(sum / monthEntries.length)
      : 0;

    history.push({
      categoryId: cat.id,
      category: cat.name,
      months: monthEntries,
      average,
    });
  }

  return history;
}

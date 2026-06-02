// wnab coaching layer — all coaching copy lives here, in one editable place.
//
// The strings teach the four-rule budgeting mindset (give every dollar a job;
// embrace your true expenses; roll with the punches; age your money) in wnab's
// own voice. They are wrapped with i18n at the call site (see `useNudges`) so
// the keys are extractable by `yarn generate:i18n`.
//
// Keep this module pure: no React, no hooks. The resolvers map a budget number
// to a `BudgetState`, and the message getters are injected the `t` function so
// the strings stay translatable while the logic stays testable in isolation.

import type { TFunction } from 'i18next';

/**
 * The coaching-relevant states a budget surface can be in.
 *
 * - `unassigned`   — money is waiting for a job (To Assign > 0).
 * - `overAssigned` — more has been assigned than exists (To Assign < 0).
 * - `fullyFunded`  — every dollar has a job (To Assign === 0).
 * - `overspent`    — a single category's available balance went negative.
 */
export type BudgetState =
  | 'unassigned'
  | 'overAssigned'
  | 'fullyFunded'
  | 'overspent';

/**
 * Resolve the "To Assign" coaching state from the top-of-budget number.
 *
 * Positive means money still needs a job, negative means we've promised more
 * than we have, and zero means every dollar is accounted for.
 */
export function getToAssignState(toAssign: number): BudgetState {
  if (toAssign > 0) {
    return 'unassigned';
  }
  if (toAssign < 0) {
    return 'overAssigned';
  }
  return 'fullyFunded';
}

/**
 * Resolve the coaching state for a single category's available balance.
 *
 * Only a negative balance is coaching-worthy here (the category is overspent);
 * everything else is left to the per-cell pill colour and returns `null`.
 */
export function getCategoryBalanceState(available: number): BudgetState | null {
  if (available < 0) {
    return 'overspent';
  }
  return null;
}

/**
 * The single source of truth for coaching copy. Each entry receives the i18n
 * `t` function so the wording stays in one editable place while remaining
 * translatable. All copy is original to wnab — no third-party screen wording.
 */
export function getNudgeMessage(state: BudgetState, t: TFunction): string {
  switch (state) {
    case 'unassigned':
      return t('This money has no job yet. Assign every dollar down to zero.');
    case 'overAssigned':
      return t("You've assigned more than you have. Pull some back to zero.");
    case 'fullyFunded':
      return t('Every dollar has a job. This is what control feels like.');
    case 'overspent':
      return t(
        'This category is in the red. Roll with it — cover it from another job.',
      );
    default:
      return '';
  }
}

/**
 * Convenience resolver for the "To Assign" surface: number in, copy out.
 */
export function getToAssignNudge(toAssign: number, t: TFunction): string {
  return getNudgeMessage(getToAssignState(toAssign), t);
}

/**
 * Convenience resolver for a category balance: returns coaching copy only when
 * the category is overspent, otherwise `null` (no nudge to show).
 */
export function getCategoryOverspentNudge(
  available: number,
  t: TFunction,
): string | null {
  const state = getCategoryBalanceState(available);
  return state ? getNudgeMessage(state, t) : null;
}

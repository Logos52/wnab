// wnab coaching layer — first-run persistence.
//
// The onboarding tour should appear automatically exactly once per budget. We
// gate it on a localStorage flag (view-layer only) rather than a loot-core
// pref so the engine stays untouched: no schema change, no sync, no migration,
// no merge risk. The key is scoped by budget id to mirror the `useLocalPref`
// convention (`${budgetId}-${name}`).

const ONBOARDING_SEEN_SUFFIX = 'onboarding-seen';

function getOnboardingKey(budgetId: string): string {
  return `${budgetId}-${ONBOARDING_SEEN_SUFFIX}`;
}

/**
 * Whether the onboarding tour has already been shown (or skipped) for this
 * budget. Returns `false` when there is no budget id yet, so the trigger stays
 * inert until the budget is loaded.
 */
export function getHasSeenOnboarding(budgetId: string | undefined): boolean {
  if (!budgetId) {
    return true;
  }
  return localStorage.getItem(getOnboardingKey(budgetId)) === 'true';
}

/**
 * Mark the onboarding tour as seen for this budget so it won't auto-open again.
 * Called on completion or skip. Replaying from the menu does NOT clear this.
 */
export function setHasSeenOnboarding(budgetId: string | undefined): void {
  if (!budgetId) {
    return;
  }
  localStorage.setItem(getOnboardingKey(budgetId), 'true');
}

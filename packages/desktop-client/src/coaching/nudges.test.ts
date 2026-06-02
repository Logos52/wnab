import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import {
  getCategoryBalanceState,
  getCategoryOverspentNudge,
  getNudgeMessage,
  getToAssignNudge,
  getToAssignState,
} from './nudges';

// A passthrough stand-in for i18next's `t`: returns the source string so we can
// assert on the actual copy without booting the full i18n runtime.
const t = ((key: string) => key) as unknown as TFunction;

describe('getToAssignState', () => {
  it('returns "unassigned" when money is waiting for a job', () => {
    expect(getToAssignState(100)).toBe('unassigned');
  });

  it('returns "overAssigned" when more is assigned than available', () => {
    expect(getToAssignState(-100)).toBe('overAssigned');
  });

  it('returns "fullyFunded" when every dollar has a job', () => {
    expect(getToAssignState(0)).toBe('fullyFunded');
  });
});

describe('getCategoryBalanceState', () => {
  it('returns "overspent" for a negative balance', () => {
    expect(getCategoryBalanceState(-1)).toBe('overspent');
  });

  it('returns null for zero or positive balances', () => {
    expect(getCategoryBalanceState(0)).toBeNull();
    expect(getCategoryBalanceState(50)).toBeNull();
  });
});

describe('getNudgeMessage', () => {
  it('maps every state to original wnab coaching copy', () => {
    expect(getNudgeMessage('unassigned', t)).toContain('no job yet');
    expect(getNudgeMessage('overAssigned', t)).toContain('more than you have');
    expect(getNudgeMessage('fullyFunded', t)).toContain('control feels like');
    expect(getNudgeMessage('overspent', t)).toContain('Roll with it');
  });
});

describe('getToAssignNudge', () => {
  it('returns the unassigned nudge for positive amounts', () => {
    expect(getToAssignNudge(100, t)).toContain('no job yet');
  });

  it('returns the over-assigned nudge for negative amounts', () => {
    expect(getToAssignNudge(-100, t)).toContain('more than you have');
  });

  it('returns the fully-funded nudge for zero', () => {
    expect(getToAssignNudge(0, t)).toContain('control feels like');
  });
});

describe('getCategoryOverspentNudge', () => {
  it('returns the overspent nudge only when the category is in the red', () => {
    expect(getCategoryOverspentNudge(-25, t)).toContain('Roll with it');
  });

  it('returns null when the category is funded or empty', () => {
    expect(getCategoryOverspentNudge(0, t)).toBeNull();
    expect(getCategoryOverspentNudge(25, t)).toBeNull();
  });
});

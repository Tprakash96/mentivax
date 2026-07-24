import { describe, expect, it } from 'vitest';
import { splitEven, rupeesToPaise, formatMoney } from './money';
import {
  resolveFeeAmount,
  computeDiscount,
  buildStudentLines,
  invoiceTotals,
  deriveStatus,
} from './fees';
import type { FeeStructureInput } from './types';

const yearFee: FeeStructureInput = {
  key: 'year', name: 'School Fee', period: 'TERM', pricingMode: 'SPLIT',
  periodCount: 2, optIn: false, flatAmount: 6000000, newAmount: 6000000, oldAmount: 5400000,
};
const vanFee: FeeStructureInput = {
  key: 'van', name: 'Van Fee', period: 'MONTHLY', pricingMode: 'COMMON',
  periodCount: 11, optIn: true, flatAmount: 1100000, newAmount: 1100000, oldAmount: 1100000,
};

describe('money', () => {
  it('splits without losing paise', () => {
    const parts = splitEven(1001, 3);
    expect(parts).toEqual([334, 334, 333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1001);
  });
  it('converts rupees to paise', () => {
    expect(rupeesToPaise(14000)).toBe(1400000);
  });
  it('formats INR without decimals', () => {
    expect(formatMoney(1400000)).toBe('₹14,000');
  });
});

describe('fee resolution', () => {
  it('picks new vs old for SPLIT pricing', () => {
    expect(resolveFeeAmount(yearFee, true)).toBe(6000000);
    expect(resolveFeeAmount(yearFee, false)).toBe(5400000);
  });
  it('ignores admission status for COMMON pricing', () => {
    expect(resolveFeeAmount(vanFee, true)).toBe(1100000);
  });
});

describe('discounts', () => {
  it('applies percent as basis points and clamps', () => {
    expect(computeDiscount(1000000, 'PERCENT', 1000)).toBe(100000); // 10%
    expect(computeDiscount(1000000, 'FLAT', 5000000)).toBe(1000000); // clamped to gross
  });
});

describe('student billing', () => {
  it('skips opt-in fees for students without transport', () => {
    const noVan = buildStudentLines([yearFee, vanFee], { isNewAdmission: false, hasTransport: false });
    expect(noVan.map((l) => l.key)).toEqual(['year']);
    const withVan = buildStudentLines([yearFee, vanFee], { isNewAdmission: false, hasTransport: true });
    expect(withVan.map((l) => l.key)).toEqual(['year', 'van']);
  });
  it('totals lines correctly', () => {
    const lines = buildStudentLines([yearFee], { isNewAdmission: false, hasTransport: false });
    expect(invoiceTotals(lines)).toEqual({ gross: 5400000, discount: 0, net: 5400000 });
  });
});

describe('status', () => {
  it('derives from paid vs net', () => {
    expect(deriveStatus(1000, 0)).toBe('PENDING');
    expect(deriveStatus(1000, 500)).toBe('PARTIAL');
    expect(deriveStatus(1000, 1000)).toBe('PAID');
  });
});

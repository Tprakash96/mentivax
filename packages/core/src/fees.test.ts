import { describe, expect, it } from 'vitest';
import { splitEven, rupeesToPaise, formatMoney } from './money';
import {
  resolveFeeAmount,
  computeDiscount,
  buildStudentLines,
  buildInvoiceLines,
  resolveTransportFare,
  invoiceTotals,
  deriveStatus,
  periodMeta,
  periodBreakdown,
  academicYearMonths,
} from './fees';
import type { FeeStructureInput, TransportFareInput } from './types';

describe('period labels vs. the academic-year start', () => {
  const monthly = { period: 'MONTHLY' as const, periodCount: 12 };

  it('defaults to an April-starting year (Apr … Mar)', () => {
    const { labels } = periodMeta(monthly, 2026);
    expect(labels[0]).toBe('Apr 2026');
    expect(labels[9]).toBe('Jan 2027');
    expect(labels[11]).toBe('Mar 2027');
  });

  it('rolls from a March-starting year (15 Mar → 14 Mar): Mar … Feb', () => {
    // startMonth 2 = March
    const { labels } = periodMeta(monthly, 2026, 2);
    expect(labels[0]).toBe('Mar 2026');
    expect(labels[10]).toBe('Jan 2027');
    expect(labels[11]).toBe('Feb 2027');
    expect(labels).toHaveLength(12); // never 13
  });

  it('splits the amount by installment count, independent of the date span', () => {
    // ₹12,000 / 12 = ₹1,000 each, whatever the exact start/end days are.
    expect(periodBreakdown({ ...monthly } as FeeStructureInput, 1_200_000)).toEqual(
      Array.from({ length: 12 }, () => 100_000),
    );
  });

  it('counts a 15 Mar 2026 → 14 Mar 2027 year as 12 whole months, not 13', () => {
    expect(academicYearMonths('2026-03-15', '2027-03-14')).toBe(12);
    expect(academicYearMonths('2026-04-01', '2027-03-31')).toBe(12);
  });
});

const yearFee: FeeStructureInput = {
  key: 'year', name: 'School Fee', period: 'TERM', pricingMode: 'SPLIT',
  periodCount: 2, flatAmount: 6000000, newAmount: 6000000, oldAmount: 5400000,
};
const vanFee: FeeStructureInput = {
  key: 'van', name: 'Van Fee', period: 'MONTHLY', pricingMode: 'COMMON',
  periodCount: 11, flatAmount: 1100000, newAmount: 1100000, oldAmount: 1100000,
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
  it('bills every mapped fee for the student', () => {
    const lines = buildStudentLines([yearFee, vanFee], { isNewAdmission: false });
    expect(lines.map((l) => l.key)).toEqual(['year', 'van']);
  });
  it('resolves old-admission pricing for SPLIT fees', () => {
    const newAdm = buildStudentLines([yearFee], { isNewAdmission: true });
    expect(newAdm[0]?.gross).toBe(6000000);
  });
  it('totals lines correctly', () => {
    const lines = buildStudentLines([yearFee], { isNewAdmission: false });
    expect(invoiceTotals(lines)).toEqual({ gross: 5400000, discount: 0, net: 5400000 });
  });
});

const stopFare: TransportFareInput = {
  stopId: 'stop1', stopName: 'Gandhi Nagar', routeName: 'North',
  bothWayFare: 1200000, oneWayFare: 700000,
};

describe('transport', () => {
  it('charges both-way fare for BOTH shift, one-way otherwise', () => {
    expect(resolveTransportFare(stopFare, 'BOTH')).toBe(1200000);
    expect(resolveTransportFare(stopFare, 'MORNING')).toBe(700000);
    expect(resolveTransportFare(stopFare, 'EVENING')).toBe(700000);
  });
  it('adds a transport line to the invoice when assigned a stop', () => {
    const lines = buildInvoiceLines([yearFee], { isNewAdmission: false }, { fare: stopFare, shift: 'MORNING' });
    expect(lines.map((l) => l.key)).toEqual(['year', 'transport']);
    expect(lines[1]?.gross).toBe(700000);
    expect(invoiceTotals(lines).net).toBe(5400000 + 700000);
  });
  it('omits transport when no stop is assigned', () => {
    const lines = buildInvoiceLines([yearFee], { isNewAdmission: false });
    expect(lines.map((l) => l.key)).toEqual(['year']);
  });
});

describe('status', () => {
  it('derives from paid vs net', () => {
    expect(deriveStatus(1000, 0)).toBe('PENDING');
    expect(deriveStatus(1000, 500)).toBe('PARTIAL');
    expect(deriveStatus(1000, 1000)).toBe('PAID');
  });
});

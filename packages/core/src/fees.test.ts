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
} from './fees';
import type { FeeStructureInput, TransportFareInput } from './types';

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

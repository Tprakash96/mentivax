/**
 * Fee resolution + invoice math — the heart of the shared engine. The API and
 * every client compute totals through these functions so the numbers always
 * agree.
 */
import { clamp, splitEven } from './money';
import type {
  DiscountType,
  FeePeriod,
  FeeStructureInput,
  TransportFareInput,
  TransportShift,
} from './types';

/** Stable line key for the transport fee on an invoice. */
export const TRANSPORT_FEE_KEY = 'transport';

/**
 * The amount (paise) a student owes for a fee, honouring the pricing mode:
 * COMMON -> flat for everyone; SPLIT -> new vs old admission.
 */
export function resolveFeeAmount(fee: FeeStructureInput, isNewAdmission: boolean): number {
  if (fee.pricingMode === 'COMMON') return fee.flatAmount;
  return isNewAdmission ? fee.newAmount : fee.oldAmount;
}

/** Whether a fee is billed across multiple periods (terms/months). */
export const isPeriodic = (period: FeePeriod): boolean =>
  period === 'TERM' || period === 'MONTHLY';

export interface PeriodMeta {
  count: number;
  labels: string[];
}

/**
 * Period labels for a fee. `startYear` drives the calendar for monthly plans.
 */
export function periodMeta(fee: Pick<FeeStructureInput, 'period' | 'periodCount'>, startYear = 2026): PeriodMeta {
  if (fee.period === 'TERM') {
    return {
      count: fee.periodCount,
      labels: Array.from({ length: fee.periodCount }, (_, i) => `Term ${i + 1}`),
    };
  }
  if (fee.period === 'MONTHLY') {
    const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    return {
      count: fee.periodCount,
      labels: Array.from({ length: fee.periodCount }, (_, i) => {
        const m = months[i % 12] ?? '';
        const yr = i < 9 ? startYear : startYear + 1;
        return `${m} ${yr}`;
      }),
    };
  }
  if (fee.period === 'DUE_DATE') {
    return { count: 1, labels: ['Due date'] };
  }
  return { count: 1, labels: ['One-time'] };
}

/** Even per-period breakdown for a fee amount. */
export function periodBreakdown(fee: FeeStructureInput, amountPaise: number): number[] {
  if (!isPeriodic(fee.period)) return [amountPaise];
  return splitEven(amountPaise, fee.periodCount);
}

/** Compute the discount (paise) for a gross amount. */
export function computeDiscount(gross: number, type: DiscountType, value: number): number {
  if (type === 'NONE' || gross <= 0) return 0;
  // PERCENT value is basis points (1000 = 10%); FLAT value is paise.
  const raw = type === 'PERCENT' ? Math.round((gross * value) / 10_000) : value;
  return clamp(raw, 0, gross);
}

export interface DraftLine {
  key: string;
  name: string;
  period: FeePeriod;
  gross: number;
  discountType: DiscountType;
  discountValue: number;
  discount: number;
  net: number;
  periods: number[];
  reason?: string;
}

export interface StudentBillingInput {
  isNewAdmission: boolean;
  /** Optional flat discount (paise) applied at the invoice level. */
  presetDiscount?: number;
  discountReason?: string;
}

/**
 * Build the fee lines for one student from a set of fee structures. Every fee
 * mapped to the student's class applies to every student.
 */
export function buildStudentLines(
  fees: FeeStructureInput[],
  student: StudentBillingInput,
): DraftLine[] {
  const lines: DraftLine[] = [];
  for (const fee of fees) {
    const gross = resolveFeeAmount(fee, student.isNewAdmission);
    if (gross <= 0) continue;
    lines.push({
      key: fee.key,
      name: fee.name,
      period: fee.period,
      gross,
      discountType: 'NONE',
      discountValue: 0,
      discount: 0,
      net: gross,
      periods: periodBreakdown(fee, gross),
    });
  }
  return lines;
}

/**
 * The transport fare a student owes for a stop + shift (paise). Morning- or
 * evening-only (one-way) is charged the lower fare; both-way the full fare.
 */
export function resolveTransportFare(fare: TransportFareInput, shift: TransportShift): number {
  return shift === 'BOTH' ? fare.bothWayFare : fare.oneWayFare;
}

/** A billable transport line for a student's stop + shift (or null if free). */
export function buildTransportLine(
  fare: TransportFareInput,
  shift: TransportShift,
): DraftLine | null {
  const gross = resolveTransportFare(fare, shift);
  if (gross <= 0) return null;
  const shiftLabel = shift === 'BOTH' ? 'Both ways' : shift === 'MORNING' ? 'Morning' : 'Evening';
  const place = fare.landmarkName ? `${fare.stopName} · ${fare.landmarkName}` : fare.stopName;
  return {
    key: TRANSPORT_FEE_KEY,
    name: `Transport — ${fare.routeName} · ${place} (${shiftLabel})`,
    period: 'MONTHLY',
    gross,
    discountType: 'NONE',
    discountValue: 0,
    discount: 0,
    net: gross,
    periods: [gross],
  };
}

/** Optional transport assignment used when building a full invoice. */
export interface TransportBillingInput {
  fare: TransportFareInput;
  shift: TransportShift;
}

/**
 * Build every fee line for one student's invoice: academic fees from their
 * standard, plus a transport line when they're assigned a stop.
 */
export function buildInvoiceLines(
  fees: FeeStructureInput[],
  student: StudentBillingInput,
  transport?: TransportBillingInput,
): DraftLine[] {
  const lines = buildStudentLines(fees, student);
  if (transport) {
    const t = buildTransportLine(transport.fare, transport.shift);
    if (t) lines.push(t);
  }
  return lines;
}

export interface InvoiceTotals {
  gross: number;
  discount: number;
  net: number;
}

/** Sum lines into invoice-level totals (paise). */
export function invoiceTotals(lines: DraftLine[]): InvoiceTotals {
  let gross = 0;
  let discount = 0;
  for (const l of lines) {
    gross += l.gross;
    discount += l.discount;
  }
  return { gross, discount, net: Math.max(0, gross - discount) };
}

/** Derive an invoice status from its net vs paid amount (paise). */
export function deriveStatus(net: number, paid: number): 'PENDING' | 'PARTIAL' | 'PAID' {
  if (paid <= 0) return 'PENDING';
  if (paid >= net) return 'PAID';
  return 'PARTIAL';
}

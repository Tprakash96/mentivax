/**
 * Payroll engine — the single source of truth for salary maths, shared by the
 * API and every client (mirrors how fee math lives here, never in a handler).
 *
 * All amounts are integer paise. Each component is rounded to the nearest whole
 * rupee (100 paise) at its own boundary, then summed — matching the per-line
 * rounding of the design so a payslip's parts always add up to its total.
 *
 * The payable base is a fixed 30 days (LOP and EL encashment both divide gross
 * by 30, regardless of the calendar month's length).
 */

export type StaffRole = 'TEACHER' | 'TRANSPORT' | 'OFFICE' | 'SUPPORT' | 'MANAGEMENT' | 'VISITING';

/** Tunable, school-owned payroll settings (percentages are whole numbers). */
export interface PayrollSettings {
  daPercent: number;
  hraPercent: number;
  pfPercent: number;
  /** Professional tax, flat per month (paise). */
  ptMonthly: number;
  /** Conveyance allowance, flat per month (paise); 0 for visiting staff. */
  conveyance: number;
  postToAccounts: boolean;
}

export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  daPercent: 30,
  hraPercent: 20,
  pfPercent: 12,
  ptMonthly: 20000, // ₹200
  conveyance: 120000, // ₹1200
  postToAccounts: true,
};

// Statutory constants (paise / percent).
const PF_BASIC_CAP = 1_500_000; // PF is on basic capped at ₹15,000
const ESI_GROSS_CAP = 2_100_000; // ESI only when gross ≤ ₹21,000
const ESI_RATE = 0.75; // percent of payable
const ADVANCE_RECOVERY_CAP = 200_000; // at most ₹2,000 recovered per month
const PAYABLE_DAYS = 30;

/** Round a paise amount to the nearest whole rupee. */
export const roundRupee = (paise: number): number => Math.round(paise / 100) * 100;

/** The salary inputs the maths reads off an employee. */
export interface PayrollEmployee {
  role: StaffRole;
  basic: number;
  special: number;
  pfEnabled: boolean;
  esiEnabled: boolean;
  ptEnabled: boolean;
  tds: number;
  advance: number;
  elBalance: number;
}

export interface Earnings {
  basic: number;
  da: number;
  hra: number;
  conveyance: number;
  special: number;
  gross: number;
}

export function computeEarnings(emp: PayrollEmployee, s: PayrollSettings): Earnings {
  const da = roundRupee((emp.basic * s.daPercent) / 100);
  const hra = roundRupee((emp.basic * s.hraPercent) / 100);
  const conveyance = emp.role === 'VISITING' ? 0 : s.conveyance;
  const special = emp.special || 0;
  return {
    basic: emp.basic,
    da,
    hra,
    conveyance,
    special,
    gross: emp.basic + da + hra + conveyance + special,
  };
}

export interface Deductions {
  lop: number;
  pf: number;
  esi: number;
  pt: number;
  tds: number;
  advance: number;
  /** LOP + PF + ESI + PT + TDS + advance recovery. */
  total: number;
  /** gross − LOP (the ESI base). */
  payable: number;
  /** gross − total. */
  net: number;
}

export function computeDeductions(emp: PayrollEmployee, lopDays: number, s: PayrollSettings): Deductions {
  const c = computeEarnings(emp, s);
  const lop = roundRupee((c.gross / PAYABLE_DAYS) * (lopDays || 0));
  const payable = Math.max(0, c.gross - lop);
  const pf = emp.pfEnabled ? roundRupee((Math.min(emp.basic, PF_BASIC_CAP) * s.pfPercent) / 100) : 0;
  const esi = emp.esiEnabled && c.gross <= ESI_GROSS_CAP ? roundRupee((payable * ESI_RATE) / 100) : 0;
  const pt = emp.ptEnabled ? s.ptMonthly : 0;
  const tds = emp.tds || 0;
  const advance = emp.advance ? Math.min(emp.advance, ADVANCE_RECOVERY_CAP) : 0;
  const total = pf + esi + pt + tds + advance + lop;
  return { lop, pf, esi, pt, tds, advance, total, payable, net: Math.max(0, c.gross - total) };
}

/** The full payslip: every earning + deduction line and the net. */
export interface Payslip extends Earnings, Deductions {
  lopDays: number;
  /** Days actually paid for (30 − LOP days). */
  payableDays: number;
}

export function computePayslip(emp: PayrollEmployee, lopDays: number, s: PayrollSettings): Payslip {
  const earnings = computeEarnings(emp, s);
  const ded = computeDeductions(emp, lopDays, s);
  return { ...earnings, ...ded, lopDays, payableDays: Math.max(0, PAYABLE_DAYS - lopDays) };
}

/** Take-home for a full month (no LOP). */
export function computeNet(emp: PayrollEmployee, s: PayrollSettings): number {
  return computeDeductions(emp, 0, s).net;
}

export interface Settlement {
  /** Last month's net at 0 LOP. */
  lastNet: number;
  /** EL encashment: one day's gross × EL balance. */
  encashment: number;
  advance: number;
  /** lastNet + encashment − advance, floored at 0. */
  amount: number;
}

/** Full-and-final settlement on exit. */
export function computeSettlement(emp: PayrollEmployee, s: PayrollSettings): Settlement {
  const c = computeEarnings(emp, s);
  const encashment = roundRupee((c.gross / PAYABLE_DAYS) * (emp.elBalance || 0));
  const lastNet = computeNet(emp, s);
  const advance = emp.advance || 0;
  return { lastNet, encashment, advance, amount: Math.max(0, lastNet + encashment - advance) };
}

/**
 * A paise amount in words, Indian style — "Rupees Forty-two thousand only".
 * Whole rupees only (paise are dropped; payroll figures are rupee-rounded).
 */
export function rupeesInWords(paise: number): string {
  const rupees = Math.round(paise / 100);
  if (rupees === 0) return 'Rupees zero only';
  const ones = [
    '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
  ];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const two = (n: number): string => {
    if (n < 20) return ones[n]!;
    const t = tens[Math.floor(n / 10)]!;
    const o = n % 10;
    return o ? `${t}-${ones[o]}` : t;
  };
  const three = (n: number): string => {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return [h ? `${ones[h]} hundred` : '', r ? two(r) : ''].filter(Boolean).join(' ');
  };
  const parts: string[] = [];
  const crore = Math.floor(rupees / 10_000_000);
  const lakh = Math.floor((rupees % 10_000_000) / 100_000);
  const thousand = Math.floor((rupees % 100_000) / 1000);
  const rest = rupees % 1000;
  if (crore) parts.push(`${three(crore)} crore`);
  if (lakh) parts.push(`${three(lakh)} lakh`);
  if (thousand) parts.push(`${three(thousand)} thousand`);
  if (rest) parts.push(three(rest));
  const words = parts.join(' ').replace(/\s+/g, ' ').trim();
  return `Rupees ${words.charAt(0).toUpperCase()}${words.slice(1)} only`;
}

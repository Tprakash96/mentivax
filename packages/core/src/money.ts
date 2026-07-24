/**
 * Money handling. All amounts move through the system as integer MINOR UNITS
 * (paise for INR). Never use floats for money.
 */

/** ₹1 = 100 paise. */
export const MINOR_UNITS_PER_MAJOR = 100;

export const rupeesToPaise = (rupees: number): number =>
  Math.round(rupees * MINOR_UNITS_PER_MAJOR);

export const paiseToRupees = (paise: number): number => paise / MINOR_UNITS_PER_MAJOR;

/** Format paise as a localized currency string, e.g. 1400000 -> "₹14,000". */
export function formatMoney(
  paise: number,
  opts: { currency?: string; locale?: string; withDecimals?: boolean } = {},
): string {
  const { currency = 'INR', locale = 'en-IN', withDecimals = false } = opts;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: withDecimals ? 2 : 0,
  }).format(paiseToRupees(paise));
}

/**
 * Split a total (paise) into `n` whole-unit instalments, distributing the
 * remainder across the earliest periods so the parts always sum to the total.
 */
export function splitEven(totalPaise: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(totalPaise / n);
  const out = Array<number>(n).fill(base);
  let remainder = totalPaise - base * n;
  for (let i = 0; i < remainder; i++) out[i] = (out[i] ?? 0) + 1;
  return out;
}

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** Clamp a value into [min, max]. */
export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

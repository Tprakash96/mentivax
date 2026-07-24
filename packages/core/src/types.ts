/**
 * Canonical domain enums for the fees engine. These mirror the Prisma enums in
 * @mentivax/db but are declared here so the engine stays framework/DB-agnostic.
 */

export type FeePeriod = 'ONE_TIME' | 'TERM' | 'MONTHLY';
export type PricingMode = 'COMMON' | 'SPLIT';
export type DiscountType = 'NONE' | 'PERCENT' | 'FLAT';
export type InvoiceStatus = 'DRAFT' | 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED';
export type PaymentMode = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD';

/** The pricing definition for one fee type applied to one class. */
export interface FeeStructureInput {
  key: string;
  name: string;
  period: FeePeriod;
  pricingMode: PricingMode;
  periodCount: number;
  optIn: boolean;
  /** paise */
  flatAmount: number;
  newAmount: number;
  oldAmount: number;
}

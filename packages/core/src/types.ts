/**
 * Canonical domain enums for the fees engine. These mirror the Prisma enums in
 * @mentivax/db but are declared here so the engine stays framework/DB-agnostic.
 */

export type FeePeriod = 'ONE_TIME' | 'TERM' | 'MONTHLY' | 'DUE_DATE';
export type PricingMode = 'COMMON' | 'SPLIT';
export type DiscountType = 'NONE' | 'PERCENT' | 'FLAT';
export type InvoiceStatus = 'DRAFT' | 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED';
export type PaymentMode = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD';
export type VehicleType = 'BUS' | 'VAN';
/** Both = morning + evening (full fare); Morning/Evening = one-way (lower fare). */
export type TransportShift = 'BOTH' | 'MORNING' | 'EVENING';

/** The pricing definition for one fee type applied to one class. */
export interface FeeStructureInput {
  key: string;
  name: string;
  period: FeePeriod;
  pricingMode: PricingMode;
  periodCount: number;
  /** paise */
  flatAmount: number;
  newAmount: number;
  oldAmount: number;
}

/** A pickup landmark within a stop, with its own fares (paise). */
export interface LandmarkFare {
  name: string;
  bothWayFare: number;
  oneWayFare: number;
}

/** A transport stop's fares (paise). One-way is charged for morning/evening only. */
export interface TransportFareInput {
  stopId: string;
  stopName: string;
  routeName: string;
  /** paise */
  bothWayFare: number;
  oneWayFare: number;
  /** The pickup landmark this fare is for (when billed per landmark). */
  landmarkName?: string;
}

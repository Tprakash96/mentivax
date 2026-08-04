/**
 * Canonical domain enums for the fees engine. These mirror the Prisma enums in
 * @mentivax/db but are declared here so the engine stays framework/DB-agnostic.
 */

export type FeePeriod = 'ONE_TIME' | 'TERM' | 'MONTHLY' | 'DUE_DATE';
/**
 * COMMON/SPLIT are academic (amount set per class). STOP/DISTANCE/FLAT mark a
 * *transport* fee: the amount comes from the Transport module (assigned stop's
 * fare, or ₹/km × distance) or a single flat fare.
 */
export type PricingMode = 'COMMON' | 'SPLIT' | 'STOP' | 'DISTANCE' | 'FLAT';
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
  /** Flat transport fare (paise) — used only when pricingMode = FLAT. */
  transportFlatAmount?: number;
}

/** A pickup landmark within a stop, with its own fares (paise). */
export interface LandmarkFare {
  name: string;
  bothWayFare: number;
  oneWayFare: number;
  /** Distance from school (km) — used when transport fares are distance-based. */
  distanceKm?: number | null;
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

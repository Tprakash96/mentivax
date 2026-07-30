/**
 * Response shapes returned by the Mentivax API. Request shapes are the Zod DTOs
 * from @mentivax/core.
 */
import type {
  DiscountType,
  FareBasis,
  FeePeriod,
  InvoiceStatus,
  LandmarkFare,
  ModuleDef,
  PaymentMode,
  PricingMode,
  TransportShift,
  VehicleType,
} from '@mentivax/core';

export type { LandmarkFare };

/** Org-wide transport fare settings (basis + per-km rates in paise). */
export interface TransportSettings {
  fareBasis: FareBasis;
  ratePerKmBoth: number;
  ratePerKmOne: number;
}

/** A catalog module annotated with the current org's entitlement state. */
export interface ModuleView extends ModuleDef {
  enabled: boolean;
  status: 'ACTIVE' | 'TRIAL' | 'SUSPENDED' | null;
  expiresAt: string | null;
  missingDependencies: string[];
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  shortCode: string;
  currency: string;
}

export interface AcademicYear {
  id: string;
  label: string;
  isActive: boolean;
}

/** A financial year (internally AcademicYear) with full dates for management. */
export interface FinancialYear {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface TransportStop {
  id: string;
  routeId: string;
  name: string;
  /** Fares in paise. */
  bothWayFare: number;
  oneWayFare: number;
  rank: number;
  /** "HH:MM" pickup / drop times and pickup landmarks (each with its own fares). */
  pickupTime: string | null;
  dropTime: string | null;
  landmarks: LandmarkFare[];
}

export interface TransportRoute {
  id: string;
  name: string;
  vehicleNumber: string;
  vehicleType: VehicleType;
  rank: number;
  stops: TransportStop[];
}

export interface SchoolClass {
  id: string;
  name: string;
  rank: number;
  studentCount?: number;
}

export interface FeeType {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  period: FeePeriod;
  pricingMode: PricingMode;
  periodCount: number;
  /** ISO date for DUE_DATE fees; null otherwise. */
  dueDate?: string | null;
  rank: number;
}

export interface FeeStructureRow {
  feeTypeId: string;
  key: string;
  name: string;
  period: FeePeriod;
  pricingMode: PricingMode;
  periodCount: number;
  /** ISO date for DUE_DATE fees; null otherwise. */
  dueDate?: string | null;
  flatAmount: number;
  newAmount: number;
  oldAmount: number;
}

export interface Student {
  id: string;
  name: string;
  classId: string;
  className: string;
  isNewAdmission: boolean;
  parentName?: string | null;
  phone?: string | null;
  transportStopId?: string | null;
  transportShift?: TransportShift | null;
  /** Pickup landmark within the stop, if assigned. */
  transportLandmark?: string | null;
  /** "Route · Stop" label, or null when no transport. */
  transportStopName?: string | null;
  feeExempt: boolean;
  discountType: DiscountType;
  discountValue: number;
  annualFee: number;
  paid: number;
  pending: number;
  status: 'paid' | 'part' | 'due';
}

export interface InvoiceLine {
  id: string;
  feeKey: string;
  feeName: string;
  period: FeePeriod;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  periods?: number[] | null;
  reason?: string | null;
}

export interface Invoice {
  id: string;
  number: string;
  name: string;
  studentId: string;
  studentName: string;
  className: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
  lines?: InvoiceLine[];
}

/** One row in the batch review grid (server-computed defaults). */
export interface BatchPreviewRow {
  studentId: string;
  name: string;
  isNewAdmission: boolean;
  /** Gross amount per included fee key (paise). */
  amounts: Record<string, number | null>;
  gross: number;
  discount: number;
  net: number;
}

export interface BatchPreview {
  classId: string;
  className: string;
  columns: { key: string; name: string; period: FeePeriod }[];
  rows: BatchPreviewRow[];
  totals: { count: number; gross: number; discount: number; net: number };
}

/** One row in the Generate-invoices review grid. */
export interface GeneratePreviewRow {
  studentId: string;
  name: string;
  classId: string;
  className: string;
  classRank: number;
  /** Base gross before any discount (paise). */
  gross: number;
  /** Split of gross so a single invoice can be scoped by fee type. */
  academicGross: number;
  transportGross: number;
  feeExempt: boolean;
  discountType: DiscountType;
  discountValue: number;
  hasInvoice: boolean;
}

/** Period-wise split of a single invoice (Add-invoice breakdown preview). */
export interface InvoiceSinglePreview {
  rows: { feeKey: string; feeName: string; period: string; amount: number }[];
  gross: number;
}

export interface Payment {
  id: string;
  receiptNo: string;
  studentId: string;
  studentName: string;
  paidAt: string;
  amount: number;
  mode: PaymentMode;
  description?: string | null;
  /** Inactive (voided) payments keep their record but no longer affect invoices. */
  isActive: boolean;
}

export interface PaymentsSummary {
  totalInvoiced: number;
  collected: number;
  balanceDue: number;
  invoiceCount: number;
}

/** Period-wise breakdown of a single payment (fee × period it covered). */
export interface PaymentBreakdown {
  receiptNo: string;
  studentName: string;
  amount: number;
  rows: { feeName: string; period: string; amount: number }[];
}

// ---------------------------------------------------------------------------
// Identity, tenancy administration, and RBAC
// ---------------------------------------------------------------------------

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  /** SaaS operator: may administer every tenant from the platform console. */
  isPlatformAdmin: boolean;
}

/** One school the signed-in user may enter, with their authority inside it. */
export interface SessionMembership {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  shortCode: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  /** Already intersected with the org's enabled modules. */
  permissions: string[];
}

export interface Session {
  user: AuthenticatedUser;
  memberships: SessionMembership[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

export type LoginResult = AuthTokens & Session;

// --- Org-level team management ---------------------------------------------

export interface Member {
  /** Membership id — the handle for updates, not the user id. */
  id: string;
  userId: string;
  name: string;
  email: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  isSelf: boolean;
}

export interface RoleView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  /** Built-in roles are provisioned from code and cannot be edited. */
  isSystem: boolean;
  permissions: string[];
  memberCount: number;
}

export interface PermissionCatalogEntry {
  key: string;
  name: string;
  description: string;
  module: string;
}

export interface PermissionCatalog {
  groups: { group: string; permissions: PermissionCatalogEntry[] }[];
  /** Keys hidden because the owning module is not enabled for this org. */
  unavailable: string[];
}

// --- Platform admin console --------------------------------------------------

export interface AdminOrgSummary {
  id: string;
  slug: string;
  name: string;
  shortCode: string;
  currency: string;
  isActive: boolean;
  createdAt: string;
  memberCount: number;
  studentCount: number;
  modules: string[];
  activeYear: string | null;
}

export interface AdminOrgDetail {
  id: string;
  slug: string;
  name: string;
  shortCode: string;
  currency: string;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  academicYears: { id: string; label: string; isActive: boolean }[];
  members: {
    id: string;
    userId: string;
    name: string;
    email: string;
    roleId: string;
    roleName: string;
    roleKey: string;
    isActive: boolean;
    lastLoginAt: string | null;
  }[];
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  isPlatformAdmin: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  organizations: {
    organizationId: string;
    name: string;
    shortCode: string;
    roleName: string;
  }[];
}

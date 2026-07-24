/**
 * Response shapes returned by the Mentivax API. Request shapes are the Zod DTOs
 * from @mentivax/core.
 */
import type { FeePeriod, InvoiceStatus, ModuleDef, PaymentMode, PricingMode } from '@mentivax/core';

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
  optIn: boolean;
  rank: number;
}

export interface FeeStructureRow {
  feeTypeId: string;
  key: string;
  name: string;
  period: FeePeriod;
  pricingMode: PricingMode;
  periodCount: number;
  optIn: boolean;
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
  hasTransport: boolean;
  parentName?: string | null;
  phone?: string | null;
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
  hasTransport: boolean;
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

export interface Payment {
  id: string;
  receiptNo: string;
  studentId: string;
  studentName: string;
  paidAt: string;
  amount: number;
  mode: PaymentMode;
  description?: string | null;
}

export interface PaymentsSummary {
  totalInvoiced: number;
  collected: number;
  balanceDue: number;
  invoiceCount: number;
}

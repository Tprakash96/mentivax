/**
 * Zod schemas for the Fees API. Shared by the NestJS API (validation) and the
 * typed api-client (request/response types).
 */
import { z } from 'zod';

export const feePeriod = z.enum(['ONE_TIME', 'TERM', 'MONTHLY', 'DUE_DATE']);
export const pricingMode = z.enum(['COMMON', 'SPLIT']);
export const discountType = z.enum(['NONE', 'PERCENT', 'FLAT']);
export const invoiceStatus = z.enum(['DRAFT', 'PENDING', 'PARTIAL', 'PAID', 'CANCELLED']);
export const paymentMode = z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD']);
export const studentSegment = z.enum(['all', 'new', 'old']);
export const vehicleType = z.enum(['BUS', 'VAN']);
export const transportShift = z.enum(['BOTH', 'MORNING', 'EVENING']);

// --- Students -------------------------------------------------------------

export const createStudentSchema = z
  .object({
    name: z.string().min(1),
    classId: z.string().min(1),
    isNewAdmission: z.boolean().default(false),
    parentName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    /** Optional transport assignment: a stop + which shift they take. */
    transportStopId: z.string().optional(),
    transportShift: transportShift.optional(),
    /** Persistent fee adjustments applied on every invoice generation. */
    feeExempt: z.boolean().optional(),
    discountType: discountType.optional(),
    /** PERCENT: basis points (1000 = 10%); FLAT: paise. */
    discountValue: z.number().int().nonnegative().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.transportStopId && !v.transportShift) {
      ctx.addIssue({ code: 'custom', path: ['transportShift'], message: 'Pick a shift for the stop' });
    }
  });
export type CreateStudentDto = z.infer<typeof createStudentSchema>;

/** Assign (or clear) a student's transport stop + shift. */
export const updateStudentTransportSchema = z.object({
  transportStopId: z.string().nullable(),
  transportShift: transportShift.nullable(),
});
export type UpdateStudentTransportDto = z.infer<typeof updateStudentTransportSchema>;

/** A student's persistent fee adjustment (exemption / whole-invoice discount). */
export const studentAdjustmentSchema = z.object({
  feeExempt: z.boolean().default(false),
  discountType: discountType.default('NONE'),
  /** PERCENT: basis points; FLAT: paise. */
  discountValue: z.number().int().nonnegative().default(0),
});
export type StudentAdjustmentDto = z.infer<typeof studentAdjustmentSchema>;

// --- Classes (school-defined; names vary per school) ----------------------

export const createClassSchema = z.object({
  name: z.string().min(1).max(60),
  /** Display order; server assigns (max + 1) when omitted. */
  rank: z.number().int().nonnegative().optional(),
});
export type CreateClassDto = z.infer<typeof createClassSchema>;

export const updateClassSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  rank: z.number().int().nonnegative().optional(),
});
export type UpdateClassDto = z.infer<typeof updateClassSchema>;

// --- Transport (routes, stops, per-stop fares) ----------------------------

export const createRouteSchema = z.object({
  name: z.string().min(1).max(80),
  vehicleNumber: z.string().min(1).max(30),
  vehicleType: vehicleType.default('BUS'),
  rank: z.number().int().nonnegative().optional(),
});
export type CreateRouteDto = z.infer<typeof createRouteSchema>;

export const updateRouteSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  vehicleNumber: z.string().min(1).max(30).optional(),
  vehicleType: vehicleType.optional(),
  rank: z.number().int().nonnegative().optional(),
});
export type UpdateRouteDto = z.infer<typeof updateRouteSchema>;

export const createStopSchema = z.object({
  routeId: z.string().min(1),
  name: z.string().min(1).max(80),
  /** Fares in paise. */
  bothWayFare: z.number().int().nonnegative().default(0),
  oneWayFare: z.number().int().nonnegative().default(0),
  rank: z.number().int().nonnegative().optional(),
});
export type CreateStopDto = z.infer<typeof createStopSchema>;

export const updateStopSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  bothWayFare: z.number().int().nonnegative().optional(),
  oneWayFare: z.number().int().nonnegative().optional(),
  rank: z.number().int().nonnegative().optional(),
});
export type UpdateStopDto = z.infer<typeof updateStopSchema>;

/** Bulk-save fares from the transport mapping grid. */
export const saveStopFaresSchema = z.object({
  fares: z.array(
    z.object({
      stopId: z.string().min(1),
      bothWayFare: z.number().int().nonnegative(),
      oneWayFare: z.number().int().nonnegative(),
    }),
  ),
});
export type SaveStopFaresDto = z.infer<typeof saveStopFaresSchema>;

// --- Financial years ------------------------------------------------------

export const createFinancialYearSchema = z.object({
  label: z.string().min(1).max(20),
  startDate: z.string(),
  endDate: z.string(),
  /** Make this the active year immediately. */
  activate: z.boolean().default(false),
});
export type CreateFinancialYearDto = z.infer<typeof createFinancialYearSchema>;

export const updateFinancialYearSchema = z.object({
  label: z.string().min(1).max(20).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type UpdateFinancialYearDto = z.infer<typeof updateFinancialYearSchema>;

// --- Invoice generation (auto-bill students from their criteria) -----------

/** Which fees a single invoice should cover. */
export const feeScope = z.enum(['ALL', 'ACADEMIC', 'TRANSPORT']);
export type FeeScope = z.infer<typeof feeScope>;

/** Create a single invoice for one student (their standard's fees + transport). */
export const createInvoiceSchema = z.object({
  studentId: z.string().min(1),
  /** Restrict the invoice to academic fees, transport, or both (default). */
  feeScope: feeScope.default('ALL'),
  name: z.string().max(80).optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  discountType: discountType.optional(),
  /** PERCENT: basis points; FLAT: paise. */
  discountValue: z.number().int().nonnegative().optional(),
  /** Free-text reason shown when a discount is applied. */
  discountReason: z.string().max(200).optional(),
  /** Limit the discount to one fee (its key); omit to apply across all fees. */
  discountFeeKey: z.string().optional(),
  /** Limit the discount to one period of that fee (0-based index); omit for the whole fee. */
  discountPeriodIndex: z.number().int().nonnegative().optional(),
});
export type CreateInvoiceDto = z.infer<typeof createInvoiceSchema>;

/** Edit an existing invoice: label, dates, and an invoice-level discount. */
export const updateInvoiceSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  discountType: discountType.optional(),
  /** PERCENT: basis points; FLAT: paise. */
  discountValue: z.number().int().nonnegative().optional(),
});
export type UpdateInvoiceDto = z.infer<typeof updateInvoiceSchema>;

export const generateInvoicesSchema = z.object({
  /** Limit to one standard; omit for the whole roster. */
  classId: z.string().optional(),
  name: z.string().max(80).optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  /** Re-create invoices for students who already have one this year. */
  regenerate: z.boolean().default(false),
  /** Per-student exemption/discount to persist before generating (keyed by studentId). */
  adjustments: z.record(z.string(), studentAdjustmentSchema).optional(),
});
export type GenerateInvoicesDto = z.infer<typeof generateInvoicesSchema>;

// --- Fee structure --------------------------------------------------------

export const updateFeeStructureSchema = z.object({
  classId: z.string().min(1),
  entries: z.array(
    z.object({
      feeTypeId: z.string().min(1),
      flatAmount: z.number().int().nonnegative(),
      newAmount: z.number().int().nonnegative(),
      oldAmount: z.number().int().nonnegative(),
    }),
  ),
});
export type UpdateFeeStructureDto = z.infer<typeof updateFeeStructureSchema>;

// --- Fee type (school-wide fee item: name + duration + pricing mode) -------

/** Shared field shape for creating and updating a fee item (a "fee row"). */
const feeTypeFields = {
  /** Free-text fee / plan name (school-wide). */
  name: z.string().min(1).max(60),
  period: feePeriod,
  pricingMode,
  /** 1 for one-time / due-date; TERM: 1–3; MONTHLY: 1–12. */
  periodCount: z.number().int().min(1).max(12),
  /** Required when period is DUE_DATE: ISO date the fee is due. */
  dueDate: z.string().optional(),
};

/** Cross-field checks shared by create + update (duration ↔ count ↔ dueDate). */
const refineFeeType = (
  v: { period: z.infer<typeof feePeriod>; periodCount: number; dueDate?: string },
  ctx: z.RefinementCtx,
) => {
  if ((v.period === 'ONE_TIME' || v.period === 'DUE_DATE') && v.periodCount !== 1) {
    ctx.addIssue({ code: 'custom', path: ['periodCount'], message: 'This duration must have count = 1' });
  }
  if (v.period === 'TERM' && (v.periodCount < 1 || v.periodCount > 3)) {
    ctx.addIssue({ code: 'custom', path: ['periodCount'], message: 'Term count must be 1, 2 or 3' });
  }
  if (v.period === 'DUE_DATE' && !v.dueDate) {
    ctx.addIssue({ code: 'custom', path: ['dueDate'], message: 'A due date is required' });
  }
};

export const createFeeTypeSchema = z.object(feeTypeFields).superRefine(refineFeeType);
export type CreateFeeTypeDto = z.infer<typeof createFeeTypeSchema>;

export const updateFeeTypeSchema = z.object(feeTypeFields).superRefine(refineFeeType);
export type UpdateFeeTypeDto = z.infer<typeof updateFeeTypeSchema>;

// --- Invoice batch (the class-billing wizard) -----------------------------

/** Step 1: preview the batch — server fills each student's lines. */
export const previewBatchSchema = z.object({
  classId: z.string().min(1),
  segment: studentSegment.default('all'),
  /** Fee type keys to include; omit for all configured fees. */
  feeKeys: z.array(z.string()).optional(),
});
export type PreviewBatchDto = z.infer<typeof previewBatchSchema>;

const lineDiscountSchema = z.object({
  feeKey: z.string(),
  discountType,
  /** PERCENT: basis points; FLAT: paise. */
  discountValue: z.number().int().nonnegative(),
  reason: z.string().optional(),
  /** Optional explicit per-period breakdown (paise); must sum to the line net. */
  periods: z.array(z.number().int().nonnegative()).optional(),
});

/** Step 3: create every invoice in the reviewed batch. */
export const createBatchSchema = z.object({
  name: z.string().min(1),
  classId: z.string().min(1),
  segment: studentSegment.default('all'),
  feeKeys: z.array(z.string()).optional(),
  issueDate: z.string(),
  dueDate: z.string(),
  /** Per-student adjustments keyed by studentId. */
  adjustments: z
    .record(
      z.string(),
      z.object({
        lines: z.array(lineDiscountSchema).optional(),
        /** Invoice-level flat discount (paise). */
        flatDiscount: z.number().int().nonnegative().optional(),
        reason: z.string().optional(),
      }),
    )
    .optional(),
});
export type CreateBatchDto = z.infer<typeof createBatchSchema>;

// --- Modules (plug-in / plug-out) -----------------------------------------

export const enableModuleSchema = z.object({
  /** ACTIVE (purchased) or TRIAL. */
  status: z.enum(['ACTIVE', 'TRIAL']).default('ACTIVE'),
  /** Optional ISO date when the entitlement expires. */
  expiresAt: z.string().optional(),
  /** Module-specific sub-feature flags, e.g. { whatsappReminders: true }. */
  config: z.record(z.string(), z.unknown()).optional(),
});
export type EnableModuleDto = z.infer<typeof enableModuleSchema>;

// --- Payments -------------------------------------------------------------

export const createPaymentSchema = z.object({
  studentId: z.string().min(1),
  amount: z.number().int().positive(),
  mode: paymentMode.default('CASH'),
  paidAt: z.string().optional(),
  description: z.string().optional(),
  /** How the payment is split across invoices; auto-allocated if omitted. */
  allocations: z
    .array(z.object({ invoiceId: z.string(), amount: z.number().int().positive() }))
    .optional(),
});
export type CreatePaymentDto = z.infer<typeof createPaymentSchema>;

/** Edit an existing payment. Changing the amount re-allocates it to the
 * student's open invoices (old allocations are reversed first). */
export const updatePaymentSchema = z.object({
  amount: z.number().int().positive(),
  mode: paymentMode,
  paidAt: z.string().optional(),
  description: z.string().optional(),
});
export type UpdatePaymentDto = z.infer<typeof updatePaymentSchema>;

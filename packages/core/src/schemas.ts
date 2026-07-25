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

// --- Students -------------------------------------------------------------

export const createStudentSchema = z.object({
  name: z.string().min(1),
  classId: z.string().min(1),
  isNewAdmission: z.boolean().default(false),
  hasTransport: z.boolean().default(false),
  parentName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});
export type CreateStudentDto = z.infer<typeof createStudentSchema>;

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

// --- Fee type (school-wide plan: period + pricing mode) -------------------

export const updateFeeTypeSchema = z
  .object({
    /** Free-text fee / plan name (school-wide). */
    name: z.string().min(1).max(60),
    period: feePeriod,
    pricingMode,
    /** 1 for one-time / due-date; TERM: 1–3; MONTHLY: 1–12. */
    periodCount: z.number().int().min(1).max(12),
    /** Required when period is DUE_DATE: ISO date the fee is due. */
    dueDate: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.period === 'ONE_TIME' || v.period === 'DUE_DATE') && v.periodCount !== 1) {
      ctx.addIssue({ code: 'custom', path: ['periodCount'], message: 'This duration must have count = 1' });
    }
    if (v.period === 'TERM' && (v.periodCount < 1 || v.periodCount > 3)) {
      ctx.addIssue({ code: 'custom', path: ['periodCount'], message: 'Term count must be 1, 2 or 3' });
    }
    if (v.period === 'DUE_DATE' && !v.dueDate) {
      ctx.addIssue({ code: 'custom', path: ['dueDate'], message: 'A due date is required' });
    }
  });
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

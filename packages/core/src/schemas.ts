/**
 * Zod schemas for the Fees API. Shared by the NestJS API (validation) and the
 * typed api-client (request/response types).
 */
import { z } from 'zod';

export const feePeriod = z.enum(['ONE_TIME', 'TERM', 'MONTHLY', 'DUE_DATE']);
export const pricingMode = z.enum(['COMMON', 'SPLIT', 'STOP', 'DISTANCE', 'FLAT']);
export const discountType = z.enum(['NONE', 'PERCENT', 'FLAT']);
export const invoiceStatus = z.enum(['DRAFT', 'PENDING', 'PARTIAL', 'PAID', 'CANCELLED']);
export const paymentMode = z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD']);
export const studentSegment = z.enum(['all', 'new', 'old']);
export const vehicleType = z.enum(['BUS', 'VAN']);
export const transportShift = z.enum(['BOTH', 'MORNING', 'EVENING']);

// --- Students -------------------------------------------------------------

export const admissionType = z.enum(['NEW', 'TRANSFER', 'READMISSION']);
export type AdmissionType = z.infer<typeof admissionType>;

export const studentEnrollment = z.enum(['APPLICANT', 'ACTIVE', 'TC_ISSUED', 'ALUMNI']);
export type StudentEnrollmentKey = z.infer<typeof studentEnrollment>;

export const createStudentSchema = z
  .object({
    name: z.string().min(1),
    classId: z.string().min(1),
    admissionNo: z.string().max(40).optional(),
    admissionType: admissionType.optional(),
    isNewAdmission: z.boolean().default(false),
    /** ISO date. */
    dateOfBirth: z.string().optional(),
    emisNo: z.string().max(40).optional(),
    penNo: z.string().max(40).optional(),
    aadhaar: z.string().max(20).optional(),
    parentName: z.string().optional(),
    guardianRelation: z.string().max(40).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    /** Documents collected at admission (from the school's checklist). */
    documents: z.array(z.string()).optional(),
    /** Optional transport assignment: a stop + pickup landmark + which shift. */
    transportStopId: z.string().optional(),
    transportShift: transportShift.optional(),
    transportLandmark: z.string().optional(),
    /** Persistent fee adjustments applied on every invoice generation. */
    feeExempt: z.boolean().optional(),
    discountType: discountType.optional(),
    /** PERCENT: basis points (1000 = 10%); FLAT: paise. */
    discountValue: z.number().int().nonnegative().optional(),
    /** Fee key the discount targets (from the concession), or "" for whole invoice. */
    discountFeeKey: z.string().max(60).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.transportStopId && !v.transportShift) {
      ctx.addIssue({ code: 'custom', path: ['transportShift'], message: 'Pick a shift for the stop' });
    }
  });
export type CreateStudentDto = z.infer<typeof createStudentSchema>;

/** Edit an existing student (all fields optional — only sent fields change). */
export const updateStudentSchema = z.object({
  name: z.string().min(1).optional(),
  classId: z.string().min(1).optional(),
  admissionNo: z.string().max(40).optional(),
  admissionType: admissionType.optional(),
  isNewAdmission: z.boolean().optional(),
  dateOfBirth: z.string().nullish(),
  emisNo: z.string().max(40).optional(),
  penNo: z.string().max(40).optional(),
  aadhaar: z.string().max(20).optional(),
  parentName: z.string().nullish(),
  guardianRelation: z.string().max(40).optional(),
  phone: z.string().nullish(),
  email: z.string().email().nullish(),
  /** Lifecycle status + document checklist + exit info. */
  enrollmentStatus: studentEnrollment.optional(),
  documents: z.array(z.string()).optional(),
  exitReason: z.string().max(120).optional(),
  feeExempt: z.boolean().optional(),
  discountType: discountType.optional(),
  discountValue: z.number().int().nonnegative().optional(),
  discountFeeKey: z.string().max(60).optional(),
  transportStopId: z.string().nullish(),
  transportShift: transportShift.nullish(),
  transportLandmark: z.string().nullish(),
});
export type UpdateStudentDto = z.infer<typeof updateStudentSchema>;

/** Assign (or clear) a student's transport stop + shift. */
export const updateStudentTransportSchema = z.object({
  transportStopId: z.string().nullable(),
  transportShift: transportShift.nullable(),
  /** Which pickup landmark within the stop (name), if any. */
  transportLandmark: z.string().nullish(),
});
export type UpdateStudentTransportDto = z.infer<typeof updateStudentTransportSchema>;

/** A student's persistent fee adjustment (exemption / targeted discount). */
export const studentAdjustmentSchema = z.object({
  feeExempt: z.boolean().default(false),
  discountType: discountType.default('NONE'),
  /** PERCENT: basis points; FLAT: paise. */
  discountValue: z.number().int().nonnegative().default(0),
  /** Fee key the discount targets, or "" for the whole invoice. Omit to preserve. */
  discountFeeKey: z.string().max(60).optional(),
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
  /** Section labels within the class, e.g. ["A","B"]. */
  sections: z.array(z.string().min(1).max(8)).optional(),
  /** Employee id of the class teacher, or null to clear. */
  classTeacherId: z.string().nullable().optional(),
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

/** A pickup landmark within a stop, with its own fares (paise). */
export const landmarkFareSchema = z.object({
  name: z.string().min(1).max(120),
  bothWayFare: z.number().int().nonnegative().default(0),
  oneWayFare: z.number().int().nonnegative().default(0),
  /** Distance from school (km) — used when transport fares are distance-based. */
  distanceKm: z.number().nonnegative().nullish(),
});
export type LandmarkFareDto = z.infer<typeof landmarkFareSchema>;

/** Org-wide transport fare basis. */
export const fareBasis = z.enum(['STOP', 'DISTANCE']);
export type FareBasis = z.infer<typeof fareBasis>;

/** Update org-wide transport settings (basis + per-km rates in paise). */
export const transportSettingsSchema = z.object({
  fareBasis,
  ratePerKmBoth: z.number().int().nonnegative().default(0),
  ratePerKmOne: z.number().int().nonnegative().default(0),
});
export type TransportSettingsDto = z.infer<typeof transportSettingsSchema>;

export const createStopSchema = z.object({
  routeId: z.string().min(1),
  name: z.string().min(1).max(80),
  /** Fares in paise. */
  bothWayFare: z.number().int().nonnegative().default(0),
  oneWayFare: z.number().int().nonnegative().default(0),
  rank: z.number().int().nonnegative().optional(),
  /** "HH:MM" pickup / drop times and pickup landmarks (each with its own fares). */
  pickupTime: z.string().max(10).nullish(),
  dropTime: z.string().max(10).nullish(),
  landmarks: z.array(landmarkFareSchema).optional(),
});
export type CreateStopDto = z.infer<typeof createStopSchema>;

export const updateStopSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  bothWayFare: z.number().int().nonnegative().optional(),
  oneWayFare: z.number().int().nonnegative().optional(),
  rank: z.number().int().nonnegative().optional(),
  pickupTime: z.string().max(10).nullish(),
  dropTime: z.string().max(10).nullish(),
  landmarks: z.array(landmarkFareSchema).optional(),
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
  /** Why the discount was given (free text), or "" to clear it. */
  discountReason: z.string().max(200).optional(),
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
  /** Flat transport fare (paise) — used only when pricingMode = FLAT. */
  transportFlatAmount: z.number().int().nonnegative().default(0),
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
  /**
   * How the payment is split — omit for auto (oldest invoice/period first), or
   * pass explicit rows to control it. `lineId` targets a specific fee line so a
   * single payment can be split across fees (e.g. some to Store, rest to School).
   */
  allocations: z
    .array(z.object({ invoiceId: z.string(), lineId: z.string().optional(), amount: z.number().int().positive() }))
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
  allocations: z
    .array(z.object({ invoiceId: z.string(), lineId: z.string().optional(), amount: z.number().int().positive() }))
    .optional(),
});
export type UpdatePaymentDto = z.infer<typeof updatePaymentSchema>;

// ---------------------------------------------------------------------------
// Expenses & accounts
// ---------------------------------------------------------------------------

export const ledgerKind = z.enum(['INCOME', 'EXPENSE']);
export type LedgerKind = z.infer<typeof ledgerKind>;

export const ledgerStatus = z.enum(['POSTED', 'PENDING']);
export type LedgerStatus = z.infer<typeof ledgerStatus>;

export const expenseMode = z.enum(['CASH', 'UPI', 'BANK', 'CHEQUE']);
export type ExpenseMode = z.infer<typeof expenseMode>;

/** Record an income or expense voucher. Amount is positive paise. */
export const createLedgerEntrySchema = z.object({
  kind: ledgerKind,
  accountId: z.string().min(1),
  categoryId: z.string().optional(),
  title: z.string().min(1).max(120),
  person: z.string().max(120).optional(),
  amount: z.number().int().positive(),
  mode: expenseMode.default('CASH'),
  /** ISO date (YYYY-MM-DD); defaults to today. */
  date: z.string().optional(),
  note: z.string().max(400).optional(),
});
export type CreateLedgerEntryDto = z.infer<typeof createLedgerEntrySchema>;

export const updateLedgerEntrySchema = z.object({
  accountId: z.string().min(1).optional(),
  categoryId: z.string().nullable().optional(),
  title: z.string().min(1).max(120).optional(),
  person: z.string().max(120).optional(),
  amount: z.number().int().positive().optional(),
  mode: expenseMode.optional(),
  date: z.string().optional(),
  note: z.string().max(400).optional(),
});
export type UpdateLedgerEntryDto = z.infer<typeof updateLedgerEntrySchema>;

export const createAccountSchema = z.object({
  label: z.string().min(1).max(80),
  note: z.string().max(160).optional(),
  openingBalance: z.number().int().default(0),
});
export type CreateAccountDto = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  note: z.string().max(160).optional(),
  openingBalance: z.number().int().optional(),
});
export type UpdateAccountDto = z.infer<typeof updateAccountSchema>;

export const createCategorySchema = z.object({
  label: z.string().min(1).max(80),
  kind: ledgerKind.default('EXPENSE'),
  /** Yearly budget in paise; 0 = no ceiling. */
  budget: z.number().int().nonnegative().default(0),
  color: z.string().max(9).optional(),
});
export type CreateCategoryDto = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  label: z.string().min(1).max(80).optional(),
  kind: ledgerKind.optional(),
  budget: z.number().int().nonnegative().optional(),
  color: z.string().max(9).optional(),
});
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;

export const createVendorSchema = z.object({
  name: z.string().min(1).max(120),
  supplies: z.string().max(160).optional(),
  phone: z.string().max(40).optional(),
});
export type CreateVendorDto = z.infer<typeof createVendorSchema>;

export const updateVendorSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  supplies: z.string().max(160).optional(),
  phone: z.string().max(40).optional(),
});
export type UpdateVendorDto = z.infer<typeof updateVendorSchema>;

export const expenseSettingsSchema = z.object({
  approvalsOn: z.boolean(),
  categoriesOn: z.boolean(),
  /** Approval threshold in paise. */
  approvalLimit: z.number().int().nonnegative(),
});
export type ExpenseSettingsDto = z.infer<typeof expenseSettingsSchema>;

// ---------------------------------------------------------------------------
// Staff & payroll
// ---------------------------------------------------------------------------

export const staffRole = z.enum(['TEACHER', 'TRANSPORT', 'OFFICE', 'SUPPORT', 'MANAGEMENT', 'VISITING']);
export type StaffRoleKey = z.infer<typeof staffRole>;

export const leaveType = z.enum(['CASUAL', 'SICK', 'EARNED']);
export type LeaveTypeKey = z.infer<typeof leaveType>;

export const leaveStatus = z.enum(['PENDING', 'APPROVED', 'REJECTED']);
export type LeaveStatusKey = z.infer<typeof leaveStatus>;

/** Hire an employee. Salary amounts are paise; server fills sensible defaults. */
export const createEmployeeSchema = z.object({
  name: z.string().min(1).max(120),
  role: staffRole.default('TEACHER'),
  designation: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  /** ISO date. */
  doj: z.string().optional(),
  basic: z.number().int().nonnegative().default(0),
  special: z.number().int().nonnegative().default(0),
  pfEnabled: z.boolean().optional(),
  esiEnabled: z.boolean().optional(),
  ptEnabled: z.boolean().optional(),
  // Transport-only.
  licence: z.string().max(60).optional(),
  licExp: z.string().optional(),
  vehicle: z.string().max(40).optional(),
  route: z.string().max(60).optional(),
});
export type CreateEmployeeDto = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: staffRole.optional(),
  designation: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  doj: z.string().optional(),
  basic: z.number().int().nonnegative().optional(),
  special: z.number().int().nonnegative().optional(),
  pfEnabled: z.boolean().optional(),
  esiEnabled: z.boolean().optional(),
  ptEnabled: z.boolean().optional(),
  tds: z.number().int().nonnegative().optional(),
  advance: z.number().int().nonnegative().optional(),
  licence: z.string().max(60).optional(),
  licExp: z.string().optional(),
  vehicle: z.string().max(40).optional(),
  route: z.string().max(60).optional(),
  accountName: z.string().max(120).optional(),
  accountNo: z.string().max(40).optional(),
  ifsc: z.string().max(20).optional(),
  docs: z.array(z.string()).optional(),
});
export type UpdateEmployeeDto = z.infer<typeof updateEmployeeSchema>;

/** Record a pay raise: bumps basic by `delta` paise and logs it. */
export const recordRaiseSchema = z.object({
  delta: z.number().int(),
  note: z.string().max(120).optional(),
});
export type RecordRaiseDto = z.infer<typeof recordRaiseSchema>;

export const markExitSchema = z.object({
  date: z.string().optional(),
  reason: z.string().max(120).optional(),
});
export type MarkExitDto = z.infer<typeof markExitSchema>;

/** Replace an employee's attendance string for a month ("YYYY-MM"). */
export const setAttendanceSchema = z.object({
  employeeId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  /** One char per day: P/A/L/H. */
  days: z.string().max(31),
});
export type SetAttendanceDto = z.infer<typeof setAttendanceSchema>;

export const createLeaveSchema = z.object({
  employeeId: z.string().min(1),
  type: leaveType.default('CASUAL'),
  days: z.number().int().positive().default(1),
  fromDate: z.string().optional(),
  reason: z.string().max(200).optional(),
});
export type CreateLeaveDto = z.infer<typeof createLeaveSchema>;

export const decideLeaveSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
});
export type DecideLeaveDto = z.infer<typeof decideLeaveSchema>;

/** Pay one employee for a month. Server snapshots the computation + posts it. */
export const payStaffSchema = z.object({
  employeeId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  lopDays: z.number().int().nonnegative().default(0),
  mode: expenseMode.default('BANK'),
});
export type PayStaffDto = z.infer<typeof payStaffSchema>;

export const settleExitSchema = z.object({
  mode: expenseMode.default('BANK'),
});
export type SettleExitDto = z.infer<typeof settleExitSchema>;

export const payrollSettingsSchema = z.object({
  daPercent: z.number().int().min(0).max(100),
  hraPercent: z.number().int().min(0).max(100),
  pfPercent: z.number().int().min(0).max(100),
  ptMonthly: z.number().int().nonnegative(),
  conveyance: z.number().int().nonnegative(),
  postToAccounts: z.boolean(),
});
export type PayrollSettingsDto = z.infer<typeof payrollSettingsSchema>;

// ---------------------------------------------------------------------------
// School Setup
// ---------------------------------------------------------------------------

export const updateSchoolProfileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  shortCode: z.string().min(1).max(8).optional(),
  affiliation: z.string().max(60).optional(),
  board: z.string().max(40).optional(),
  principalName: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().max(120).optional(),
  address: z.string().max(400).optional(),
});
export type UpdateSchoolProfileDto = z.infer<typeof updateSchoolProfileSchema>;

export const createSubjectSchema = z.object({
  name: z.string().min(1).max(60),
  classIds: z.array(z.string()).optional(),
});
export type CreateSubjectDto = z.infer<typeof createSubjectSchema>;

export const updateSubjectSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  classIds: z.array(z.string()).optional(),
});
export type UpdateSubjectDto = z.infer<typeof updateSubjectSchema>;

export const holidayKind = z.enum(['State holiday', 'National holiday', 'Vacation', 'School holiday']);
export type HolidayKind = z.infer<typeof holidayKind>;

export const createHolidaySchema = z.object({
  name: z.string().min(1).max(80),
  /** ISO date. */
  date: z.string(),
  kind: holidayKind.default('School holiday'),
});
export type CreateHolidayDto = z.infer<typeof createHolidaySchema>;

// --- Discount rules (School Setup → Discounts) -----------------------------

/** A named concession. PERCENT value = basis points; FLAT value = paise. */
export const createDiscountRuleSchema = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(['PERCENT', 'FLAT']).default('PERCENT'),
  value: z.number().int().nonnegative().default(0),
  /** Fee key it applies to, or "" for the whole invoice. */
  appliesTo: z.string().max(60).optional(),
});
export type CreateDiscountRuleDto = z.infer<typeof createDiscountRuleSchema>;

export const updateDiscountRuleSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  kind: z.enum(['PERCENT', 'FLAT']).optional(),
  value: z.number().int().nonnegative().optional(),
  appliesTo: z.string().max(60).optional(),
});
export type UpdateDiscountRuleDto = z.infer<typeof updateDiscountRuleSchema>;

// --- Student document uploads (S3) -----------------------------------------

/** Request a presigned URL to upload one document file. */
export const presignDocumentSchema = z.object({
  docType: z.string().min(1).max(60),
  fileName: z.string().min(1).max(200),
  contentType: z.string().max(120).optional(),
});
export type PresignDocumentDto = z.infer<typeof presignDocumentSchema>;

/** Record a document after the browser has uploaded it to S3. */
export const confirmDocumentSchema = z.object({
  docType: z.string().min(1).max(60),
  fileName: z.string().min(1).max(200),
  s3Key: z.string().min(1).max(500),
  sizeBytes: z.number().int().nonnegative().default(0),
  contentType: z.string().max(120).optional(),
});
export type ConfirmDocumentDto = z.infer<typeof confirmDocumentSchema>;

// --- Document types (school-configurable document checklist) ----------------

export const createDocumentTypeSchema = z.object({
  name: z.string().min(1).max(60),
  required: z.boolean().default(false),
});
export type CreateDocumentTypeDto = z.infer<typeof createDocumentTypeSchema>;

export const updateDocumentTypeSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  required: z.boolean().optional(),
});
export type UpdateDocumentTypeDto = z.infer<typeof updateDocumentTypeSchema>;

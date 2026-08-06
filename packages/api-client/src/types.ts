/**
 * Response shapes returned by the Mentivax API. Request shapes are the Zod DTOs
 * from @mentivax/core.
 */
import type {
  DiscountType,
  ExpenseMode,
  FareBasis,
  FeePeriod,
  InvoiceStatus,
  LandmarkFare,
  LeaveStatusKey,
  LeaveTypeKey,
  LedgerKind,
  LedgerStatus,
  ModuleDef,
  PaymentMode,
  PricingMode,
  StaffRoleKey,
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
  sections: string[];
  classTeacherId: string | null;
  classTeacherName: string | null;
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
  /** Flat transport fare (paise) — used only when pricingMode = FLAT. */
  transportFlatAmount: number;
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
  admissionNo: string;
  admissionType: 'NEW' | 'TRANSFER' | 'READMISSION';
  isNewAdmission: boolean;
  enrollment: 'APPLICANT' | 'ACTIVE' | 'TC_ISSUED' | 'ALUMNI';
  documents: string[];
  exitDate?: string | null;
  exitReason: string;
  dateOfBirth?: string | null;
  emisNo: string;
  penNo: string;
  aadhaar: string;
  parentName?: string | null;
  guardianRelation: string;
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
  /** Fee key the discount targets, or "" for the whole invoice. */
  discountFeeKey: string;
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
  /** Why the discount was given (free text), or null. */
  discountReason?: string | null;
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
  discountFeeKey: string;
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

// --- Expenses & accounts ---------------------------------------------------

/** A ledger/book with its live balances for the active year (paise). */
export interface ExpenseAccount {
  id: string;
  label: string;
  note: string;
  openingBalance: number;
  rank: number;
  /** opening + posted income − posted expense, in range. */
  closing: number;
  /** Sum of pending (awaiting-approval) expenses. */
  awaiting: number;
}

export interface ExpenseCategory {
  id: string;
  label: string;
  kind: LedgerKind;
  budget: number;
  color: string;
  rank: number;
  /** Posted amount booked against this category (paise). */
  used: number;
}

export interface Vendor {
  id: string;
  name: string;
  supplies: string;
  phone: string;
  /** Number of posted expense entries paid to this vendor. */
  bills: number;
  /** Posted expenses paid to this vendor (paise). */
  paid: number;
  /** Pending expenses to this vendor (paise). */
  due: number;
}

/** One income/expense voucher. Amount is positive paise; sign from `kind`. */
export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  accountId: string;
  accountLabel: string;
  categoryId: string | null;
  categoryLabel: string | null;
  voucherNo: string;
  date: string;
  title: string;
  person: string;
  amount: number;
  mode: ExpenseMode;
  note: string;
  status: LedgerStatus;
  signed: boolean;
}

export interface ExpenseSettings {
  approvalsOn: boolean;
  categoriesOn: boolean;
  approvalLimit: number;
}

/** Day-book overview: books, KPIs, and the entry list, all for the active year. */
export interface ExpenseOverview {
  accounts: ExpenseAccount[];
  settings: ExpenseSettings;
  income: number;
  expense: number;
  awaiting: number;
  closing: number;
}

/** A single row of the running account statement. */
export interface StatementRow {
  id: string;
  date: string;
  voucherNo: string;
  title: string;
  person: string;
  credit: number;
  debit: number;
  balance: number;
}

export interface AccountStatement {
  opening: number;
  closing: number;
  rows: StatementRow[];
}

/** Expense reports for the active year. */
export interface ExpenseReport {
  spent: number;
  income: number;
  net: number;
  awaiting: number;
  overBudget: number;
  byCategory: { label: string; color: string; kind: LedgerKind; amount: number; budget: number }[];
  byPayee: { name: string; amount: number }[];
  byMonth: { month: string; income: number; expense: number }[];
}

// --- Staff & payroll -------------------------------------------------------

/** An increment/raise record on an employee. */
export interface Increment {
  date: string;
  note: string;
  delta: number;
}

export interface Employee {
  id: string;
  code: string;
  name: string;
  role: StaffRoleKey;
  designation: string;
  phone: string;
  doj: string;
  basic: number;
  special: number;
  pfEnabled: boolean;
  esiEnabled: boolean;
  ptEnabled: boolean;
  tds: number;
  advance: number;
  clBalance: number;
  slBalance: number;
  elBalance: number;
  licence: string | null;
  licExp: string | null;
  vehicle: string | null;
  route: string | null;
  accountName: string;
  accountNo: string;
  ifsc: string;
  docs: string[];
  increments: Increment[];
  status: 'ACTIVE' | 'EXITED';
  exitDate: string | null;
  exitReason: string | null;
  exitSettled: boolean;
  // --- derived (server-computed, full month, 0 LOP) ---
  gross: number;
  net: number;
  /** True once a payslip exists for the current pay month. */
  paidThisMonth: boolean;
  paidMode: ExpenseMode | null;
}

export interface LeaveRequestView {
  id: string;
  employeeId: string;
  employeeName: string;
  type: LeaveTypeKey;
  days: number;
  fromDate: string;
  reason: string;
  status: LeaveStatusKey;
}

/** One month of attendance for one employee. */
export interface AttendanceRow {
  employeeId: string;
  employeeName: string;
  code: string;
  role: StaffRoleKey;
  days: string;
  present: number;
  absent: number;
  leave: number;
}

export interface AttendanceMonth {
  month: string;
  dayCount: number;
  sundays: number[];
  rows: AttendanceRow[];
}

/** A processed payslip (snapshotted). */
export interface Payslip {
  id: string;
  payslipNo: string;
  employeeId: string;
  employeeName: string;
  code: string;
  designation: string;
  month: string;
  paidAt: string;
  mode: ExpenseMode;
  lopDays: number;
  payableDays: number;
  basic: number;
  da: number;
  hra: number;
  conveyance: number;
  special: number;
  gross: number;
  lop: number;
  pf: number;
  esi: number;
  pt: number;
  tds: number;
  advanceRecovered: number;
  deductionsTotal: number;
  net: number;
  amountInWords: string;
}

/** One row of the Pay-staff table (live figures for the pay month). */
export interface PayrollRow {
  employeeId: string;
  name: string;
  code: string;
  role: StaffRoleKey;
  gross: number;
  lopDays: number;
  lop: number;
  deductions: number;
  net: number;
  paid: boolean;
  mode: ExpenseMode | null;
  payslipNo: string | null;
}

export interface PayrollOverview {
  month: string;
  postToAccounts: boolean;
  rows: PayrollRow[];
  stillToPay: number;
  paid: number;
}

/** Exit / full-and-final row. */
export interface ExitRow {
  employeeId: string;
  name: string;
  code: string;
  role: StaffRoleKey;
  lastDay: string | null;
  reason: string | null;
  lastNet: number;
  encashment: number;
  advance: number;
  amount: number;
  settled: boolean;
}

export interface StaffSummary {
  headcount: number;
  monthlyBill: number;
  paidThisMonth: number;
  toPayCount: number;
  teacherCount: number;
  transportCount: number;
}

export interface PayrollSettingsView {
  daPercent: number;
  hraPercent: number;
  pfPercent: number;
  ptMonthly: number;
  conveyance: number;
  postToAccounts: boolean;
}

// --- School Setup ----------------------------------------------------------

export interface SchoolProfile {
  name: string;
  shortCode: string;
  affiliation: string;
  board: string;
  principalName: string;
  phone: string;
  email: string;
  address: string;
}

export interface Subject {
  id: string;
  name: string;
  classIds: string[];
  rank: number;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  kind: string;
}

/** Setup completion snapshot: which essential steps are done. */
export interface SetupOverview {
  profile: boolean;
  year: boolean;
  classes: boolean;
  subjects: boolean;
  staff: boolean;
  fees: boolean;
  doneMusts: number;
  totalMusts: number;
}

/** A named concession defined in School Setup → Discounts. */
export interface DiscountRule {
  id: string;
  name: string;
  kind: 'PERCENT' | 'FLAT';
  /** PERCENT: basis points (1000 = 10%); FLAT: paise. */
  value: number;
  /** Fee key it applies to, or "" for the whole invoice. */
  appliesTo: string;
  rank: number;
}

/** One standard's promotion mapping in a year rollover. */
export interface RolloverRow {
  classId: string;
  className: string;
  /** Next standard students move to, or null when they graduate (become alumni). */
  nextClassId: string | null;
  nextClassName: string | null;
  count: number;
}

/** An uploaded student document file (stored in S3). */
export interface StudentDocument {
  id: string;
  docType: string;
  fileName: string;
  sizeBytes: number;
  contentType: string;
  uploadedAt: string;
}

export interface StudentDocumentList {
  /** False when the server has no S3 storage configured. */
  configured: boolean;
  files: StudentDocument[];
}

/** A document the school collects (configurable checklist). */
export interface DocumentType {
  id: string;
  name: string;
  required: boolean;
  rank: number;
}

// --- Reports (fees & collections) ------------------------------------------

/** One payment mode's share of the money received. */
export interface ReportModeSlice {
  key: string;
  label: string;
  amount: number;
}

/**
 * The Overview tab. Every money figure is paise and covers *live* invoices —
 * drafts and cancelled invoices are excluded, so `collected`/`invoiced` agree
 * with the Payments summary. Student counts roll a student's invoices together.
 */
export interface ReportsOverview {
  /** The active academic year these figures cover, e.g. "2026-27". */
  academicYear: string;
  invoiced: number;
  collected: number;
  pending: number;
  concession: number;
  /** Collected as a whole-number percentage of invoiced. */
  collectionRate: number;
  liveInvoices: number;
  pendingStudents: number;
  concessionStudents: number;
  receiptCount: number;
  averageReceipt: number;
  fullyPaidStudents: number;
  partPaidStudents: number;
  unpaidStudents: number;
  modes: ReportModeSlice[];
}

/** One period (Term 1, Aug 2026, …) of a multi-period fee head. */
export interface FeeHeadPeriod {
  index: number;
  label: string;
  billed: number;
  paid: number;
  /** Paid as a whole-number percentage of billed. */
  rate: number;
  full: number;
  part: number;
  none: number;
}

/** How one fee head is collecting across the school. */
export interface FeeHeadRow {
  key: string;
  name: string;
  /** Marker colour, stable per head. */
  dot: string;
  period: FeePeriod;
  billed: number;
  paid: number;
  due: number;
  rate: number;
  /** Students billed this head. */
  students: number;
  full: number;
  part: number;
  none: number;
  /** Empty for one-time fees; one row per instalment otherwise. */
  periods: FeeHeadPeriod[];
}

export interface FeeHeadsReport {
  rows: FeeHeadRow[];
}

/** A concession rule and what it actually took off this year. */
export interface ConcessionRow {
  id: string;
  label: string;
  kind: DiscountType;
  /** PERCENT: basis points (1000 = 10%); FLAT: paise. */
  value: number;
  /** Fee key it applies to, or "" for the whole invoice. */
  appliesTo: string;
  amount: number;
  students: number;
}

export interface ConcessionsReport {
  rows: ConcessionRow[];
  total: number;
  students: number;
  grossBeforeConcession: number;
  netAsked: number;
  liveInvoices: number;
}

/** Transport collection for one pickup stop. */
export interface TransportReportRow {
  id: string;
  name: string;
  route: string;
  riders: number;
  billed: number;
  collected: number;
}

export interface TransportReport {
  rows: TransportReportRow[];
  billedRiders: number;
  assignedRiders: number;
  /** Stops with no billed rider yet. */
  quietStops: number;
}

/** One figure alongside an Ask answer. */
export interface AskStat {
  label: string;
  value: string;
  sub: string;
}

/** A place in the app an answer can send you, with the filters pre-applied. */
export interface AskLink {
  label: string;
  /** App path including any query string, e.g. "/students?class=8+STD&due=owing". */
  to: string;
}

/** The table of records or groups an answer was computed from. */
export interface AskTable {
  columns: { key: string; label: string; money: boolean }[];
  rows: Record<string, string | number>[];
  /** Totals across everything matched, not just the rows shown. */
  totals: Record<string, number>;
  matched: number;
  truncated: boolean;
}

/** What the server actually queried, so an answer can be audited. */
export interface AskQueryTrace {
  dataset: string;
  mode: 'rows' | 'summary';
  groupBy?: string;
  filters: { field: string; op: string; value: string | number | boolean }[];
  /** Parts of the model's plan the catalog refused, if any. */
  ignored: string[];
}

/** The answer to a natural-language question about the school's data. */
export interface AskAnswer {
  question: string;
  answer: string;
  stats: AskStat[];
  /** Present when the question resolved to a real query. */
  table?: AskTable;
  /** Where to go next — dataset page plus any relevant actions. */
  links: AskLink[];
  /** What was queried; useful for "why did it say that". */
  trace?: AskQueryTrace;
  /**
   * False when no Gemini key is configured or reachable. The figures are still
   * real either way — only the phrasing and the range of answerable questions
   * differ. See `note` for why.
   */
  ai: boolean;
  /** A short, non-technical footnote. Never carries server or config detail. */
  note?: string;
  /**
   * False when the question could not be turned into a query. The stats then
   * carry general context, *not* an answer — render it as such.
   */
  understood?: boolean;
  /**
   * How the question was read, in plain words ("students in 8 STD, still
   * owing"). Shown so a wrong reading is obvious and can be rephrased, rather
   * than the user trusting an answer to a question they didn't ask.
   */
  reading?: string;
  /** Words auto-corrected on the way in: `[typed, readAs]`. */
  corrections?: [string, string][];
  /**
   * Which route produced the answer. Non-sensitive, unlike the query itself:
   * useful for support ("was this the AI or the reader?") and for tests.
   *
   * The SQL behind an AI answer is deliberately **not** returned. It names tables
   * and internal ids, and a school administrator cannot act on it — it belongs in
   * the server log, where support can find it, not in the browser.
   */
  source?: 'ai-sql' | 'reader';
}

/**
 * Typed Mentivax API client. Shared by web, desktop, and mobile.
 *
 *   const api = createClient({ baseUrl, getToken, getOrgId });
 *   const students = await api.students.list();
 */
import type {
  CreateAccountDto,
  CreateBatchDto,
  CreateCategoryDto,
  CreateClassDto,
  ConfirmDocumentDto,
  CreateDiscountRuleDto,
  CreateDocumentTypeDto,
  UpdateDocumentTypeDto,
  CreateEmployeeDto,
  CreateHolidayDto,
  CreateLeaveDto,
  CreateSubjectDto,
  PresignDocumentDto,
  CreateFeeTypeDto,
  CreateFinancialYearDto,
  CreateInvoiceDto,
  CreateLedgerEntryDto,
  CreateMemberDto,
  CreateOrganizationDto,
  CreatePaymentDto,
  CreateRoleDto,
  CreateRouteDto,
  CreateStopDto,
  CreateStudentDto,
  CreateVendorDto,
  DecideLeaveDto,
  EnableModuleDto,
  ExpenseSettingsDto,
  FeeScope,
  GenerateInvoicesDto,
  MarkExitDto,
  PayStaffDto,
  PayrollSettingsDto,
  PreviewBatchDto,
  RecordRaiseDto,
  SaveStopFaresDto,
  SetAttendanceDto,
  SettleExitDto,
  TransportSettingsDto,
  UpdateAccountDto,
  UpdateCategoryDto,
  UpdateClassDto,
  UpdateEmployeeDto,
  UpdateFeeStructureDto,
  UpdateFeeTypeDto,
  UpdateFinancialYearDto,
  UpdateInvoiceDto,
  UpdateLedgerEntryDto,
  UpdateMemberDto,
  UpdateOrganizationDto,
  UpdatePaymentDto,
  UpdateRoleDto,
  UpdateRouteDto,
  UpdateSchoolProfileDto,
  UpdateStopDto,
  UpdateDiscountRuleDto,
  UpdateStudentDto,
  UpdateStudentTransportDto,
  UpdateSubjectDto,
  UpdateVendorDto,
} from '@mentivax/core';
import type {
  AcademicYear,
  AccountStatement,
  AdminOrgDetail,
  AdminOrgSummary,
  AdminUser,
  AttendanceMonth,
  BatchPreview,
  Employee,
  ExitRow,
  ExpenseAccount,
  ExpenseCategory,
  ExpenseOverview,
  ExpenseReport,
  ExpenseSettings,
  LeaveRequestView,
  LedgerEntry,
  LoginResult,
  Payslip,
  PayrollOverview,
  PayrollSettingsView,
  DiscountRule,
  Holiday,
  SchoolProfile,
  SetupOverview,
  StaffSummary,
  Subject,
  Member,
  PermissionCatalog,
  RoleView,
  Session,
  FeeStructureRow,
  FeeType,
  FinancialYear,
  GeneratePreviewRow,
  Invoice,
  InvoiceSinglePreview,
  ModuleView,
  Organization,
  Payment,
  PaymentBreakdown,
  PaymentsSummary,
  RolloverRow,
  SchoolClass,
  Student,
  StudentDocument,
  StudentDocumentList,
  DocumentType,
  TransportRoute,
  TransportSettings,
  Vendor,
} from './types';

export * from './types';

export interface ClientOptions {
  baseUrl: string;
  /** Returns the bearer access token (or null when unauthenticated). */
  getToken?: () => string | null | undefined;
  /** Returns the refresh token, enabling transparent retry of expired calls. */
  getRefreshToken?: () => string | null | undefined;
  /** Called with the new token pair after a successful silent refresh. */
  onTokens?: (tokens: LoginResult) => void;
  /** Called when the refresh token is rejected — the client should sign out. */
  onAuthFailure?: () => void;
  /** Returns the active organization id to scope requests. */
  getOrgId?: () => string | null | undefined;
  /** Custom fetch (for React Native / Node polyfills). */
  fetch?: typeof fetch;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function createClient(opts: ClientOptions) {
  const doFetch = opts.fetch ?? globalThis.fetch;

  /**
   * In-flight refresh, shared by every caller.
   *
   * Without this, a page that fires six requests at once on an expired token
   * would kick off six refreshes; because the API rotates refresh tokens and
   * treats reuse as a leak, five of them would fail and revoke the session.
   */
  let refreshing: Promise<boolean> | null = null;

  async function refreshTokens(): Promise<boolean> {
    const refreshToken = opts.getRefreshToken?.();
    if (!refreshToken) return false;

    const res = await doFetch(`${opts.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      opts.onAuthFailure?.();
      return false;
    }

    const result = (await res.json()) as LoginResult;
    opts.onTokens?.(result);
    return true;
  }

  async function send(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = opts.getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    const orgId = opts.getOrgId?.();
    if (orgId) headers['x-organization-id'] = orgId;

    return doFetch(`${opts.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res = await send(method, path, body);

    // A 401 on anything but the auth endpoints means the access token aged out.
    // Refresh once and replay; a second 401 is a real authentication failure.
    if (res.status === 401 && !path.startsWith('/auth/')) {
      refreshing ??= refreshTokens().finally(() => {
        refreshing = null;
      });
      if (await refreshing) res = await send(method, path, body);
    }

    if (!res.ok) {
      let payload: unknown;
      try {
        payload = await res.json();
      } catch {
        payload = await res.text().catch(() => undefined);
      }
      const message =
        (payload && typeof payload === 'object' && 'message' in payload
          ? String((payload as { message: unknown }).message)
          : undefined) ?? `Request failed (${res.status})`;
      throw new ApiError(res.status, message, payload);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  const q = (params: Record<string, string | undefined>) => {
    const pairs = Object.entries(params).filter(([, v]) => v != null && v !== '') as [string, string][];
    return pairs.length ? `?${new URLSearchParams(pairs).toString()}` : '';
  };

  return {
    request,
    auth: {
      login: (email: string, password: string) =>
        request<LoginResult>('POST', '/auth/login', { email, password }),
      /** Restores the session on app boot from a stored access token. */
      me: () => request<Session>('GET', '/auth/me'),
      /** Usually unnecessary — `request` refreshes transparently on a 401. */
      refresh: (refreshToken: string) =>
        request<LoginResult>('POST', '/auth/refresh', { refreshToken }),
      logout: (refreshToken?: string) =>
        request<{ ok: true }>('POST', '/auth/logout', { refreshToken }),
      changePassword: (currentPassword: string, newPassword: string) =>
        request<{ ok: true }>('POST', '/auth/change-password', { currentPassword, newPassword }),
    },
    /** Team management for the active organization. */
    members: {
      list: () => request<Member[]>('GET', '/members'),
      create: (dto: CreateMemberDto) => request<Member[]>('POST', '/members', dto),
      update: (id: string, dto: UpdateMemberDto) => request<Member[]>('PATCH', `/members/${id}`, dto),
      remove: (id: string) => request<Member[]>('DELETE', `/members/${id}`),
      resetPassword: (id: string, newPassword: string) =>
        request<{ ok: true }>('POST', `/members/${id}/reset-password`, { newPassword }),
    },
    /** Roles and permission grants for the active organization. */
    roles: {
      list: () => request<RoleView[]>('GET', '/roles'),
      /** The permission checklist, limited to modules this org has enabled. */
      permissions: () => request<PermissionCatalog>('GET', '/roles/permissions'),
      create: (dto: CreateRoleDto) => request<RoleView[]>('POST', '/roles', dto),
      update: (id: string, dto: UpdateRoleDto) => request<RoleView[]>('PATCH', `/roles/${id}`, dto),
      remove: (id: string) => request<RoleView[]>('DELETE', `/roles/${id}`),
    },
    /** SaaS-operator console. Requires a platform admin account. */
    admin: {
      organizations: {
        list: () => request<AdminOrgSummary[]>('GET', '/admin/organizations'),
        get: (id: string) => request<AdminOrgDetail>('GET', `/admin/organizations/${id}`),
        create: (dto: CreateOrganizationDto) =>
          request<AdminOrgDetail>('POST', '/admin/organizations', dto),
        update: (id: string, dto: UpdateOrganizationDto) =>
          request<AdminOrgDetail>('PATCH', `/admin/organizations/${id}`, dto),
        modules: (id: string) => request<ModuleView[]>('GET', `/admin/organizations/${id}/modules`),
        enableModule: (id: string, key: string, dto: EnableModuleDto = { status: 'ACTIVE' }) =>
          request<ModuleView[]>('POST', `/admin/organizations/${id}/modules/${key}/enable`, dto),
        disableModule: (id: string, key: string) =>
          request<ModuleView[]>('POST', `/admin/organizations/${id}/modules/${key}/disable`, {}),
      },
      users: {
        list: () => request<AdminUser[]>('GET', '/admin/users'),
        setActive: (id: string, isActive: boolean) =>
          request<{ ok: true }>('PATCH', `/admin/users/${id}/active`, { isActive }),
      },
    },
    modules: {
      /** Full catalog annotated with this org's entitlement state. */
      catalog: () => request<ModuleView[]>('GET', '/modules'),
      /** Effective enabled module keys (enabled + always-on core). */
      enabled: () => request<{ modules: string[] }>('GET', '/modules/enabled'),
      /** Plug a module in (platform/owner-admin action). */
      enable: (key: string, dto: EnableModuleDto = { status: 'ACTIVE' }) =>
        request<ModuleView[]>('POST', `/modules/${key}/enable`, dto),
      /** Plug a module out. */
      disable: (key: string) => request<ModuleView[]>('POST', `/modules/${key}/disable`, {}),
    },
    organizations: {
      listMine: () => request<Organization[]>('GET', '/organizations'),
      years: (orgId: string) =>
        request<AcademicYear[]>('GET', `/organizations/${orgId}/academic-years`),
    },
    /** School-configurable document checklist (Students → Documents). */
    documentTypes: {
      list: () => request<DocumentType[]>('GET', '/document-types'),
      create: (dto: CreateDocumentTypeDto) => request<DocumentType>('POST', '/document-types', dto),
      update: (id: string, dto: UpdateDocumentTypeDto) => request<DocumentType>('PATCH', `/document-types/${id}`, dto),
      remove: (id: string) => request<void>('DELETE', `/document-types/${id}`),
    },
    classes: {
      list: () => request<SchoolClass[]>('GET', '/classes'),
      create: (dto: CreateClassDto) => request<SchoolClass>('POST', '/classes', dto),
      update: (id: string, dto: UpdateClassDto) =>
        request<SchoolClass>('PATCH', `/classes/${id}`, dto),
      remove: (id: string) => request<void>('DELETE', `/classes/${id}`),
    },
    feeTypes: {
      list: () => request<FeeType[]>('GET', '/fee-types'),
      create: (dto: CreateFeeTypeDto) => request<FeeType>('POST', '/fee-types', dto),
      update: (id: string, dto: UpdateFeeTypeDto) =>
        request<FeeType>('PATCH', `/fee-types/${id}`, dto),
      remove: (id: string) => request<void>('DELETE', `/fee-types/${id}`),
    },
    feeStructure: {
      get: (classId: string) =>
        request<FeeStructureRow[]>('GET', `/fee-structure${q({ classId })}`),
      update: (dto: UpdateFeeStructureDto) =>
        request<FeeStructureRow[]>('PUT', '/fee-structure', dto),
    },
    students: {
      list: (params: { classId?: string; status?: string; enrollment?: string; search?: string } = {}) =>
        request<Student[]>('GET', `/students${q(params)}`),
      get: (id: string) => request<Student>('GET', `/students/${id}`),
      create: (dto: CreateStudentDto) => request<Student>('POST', '/students', dto),
      update: (id: string, dto: UpdateStudentDto) => request<Student>('PATCH', `/students/${id}`, dto),
      /** Year rollover: preview and promote all active students to the next standard. */
      rolloverPreview: () => request<RolloverRow[]>('GET', '/students/rollover/preview'),
      rollover: () => request<{ promoted: number; graduated: number }>('POST', '/students/rollover', {}),
      /** Document files stored in S3 under {admissionYear}/{admissionNo}/. */
      documents: {
        list: (studentId: string) => request<StudentDocumentList>('GET', `/students/${studentId}/documents`),
        presign: (studentId: string, dto: PresignDocumentDto) =>
          request<{ uploadUrl: string; s3Key: string }>('POST', `/students/${studentId}/documents/presign`, dto),
        confirm: (studentId: string, dto: ConfirmDocumentDto) =>
          request<StudentDocument>('POST', `/students/${studentId}/documents`, dto),
        url: (studentId: string, docId: string) =>
          request<{ url: string }>('GET', `/students/${studentId}/documents/${docId}/url`),
        remove: (studentId: string, docId: string) =>
          request<void>('DELETE', `/students/${studentId}/documents/${docId}`),
      },
      /** Assign or clear a student's transport stop + shift. */
      assignTransport: (id: string, dto: UpdateStudentTransportDto) =>
        request<Student>('PATCH', `/students/${id}/transport`, dto),
    },
    transport: {
      routes: {
        list: () => request<TransportRoute[]>('GET', '/transport/routes'),
        create: (dto: CreateRouteDto) => request<TransportRoute[]>('POST', '/transport/routes', dto),
        update: (id: string, dto: UpdateRouteDto) =>
          request<TransportRoute[]>('PATCH', `/transport/routes/${id}`, dto),
        remove: (id: string) => request<TransportRoute[]>('DELETE', `/transport/routes/${id}`),
      },
      stops: {
        create: (dto: CreateStopDto) => request<TransportRoute[]>('POST', '/transport/stops', dto),
        update: (id: string, dto: UpdateStopDto) =>
          request<TransportRoute[]>('PATCH', `/transport/stops/${id}`, dto),
        remove: (id: string) => request<TransportRoute[]>('DELETE', `/transport/stops/${id}`),
        saveFares: (dto: SaveStopFaresDto) =>
          request<TransportRoute[]>('PUT', '/transport/stops/fares', dto),
      },
      settings: {
        get: () => request<TransportSettings>('GET', '/transport/settings'),
        update: (dto: TransportSettingsDto) =>
          request<TransportSettings>('PUT', '/transport/settings', dto),
      },
    },
    financialYears: {
      list: () => request<FinancialYear[]>('GET', '/financial-years'),
      create: (dto: CreateFinancialYearDto) =>
        request<FinancialYear>('POST', '/financial-years', dto),
      update: (id: string, dto: UpdateFinancialYearDto) =>
        request<FinancialYear>('PATCH', `/financial-years/${id}`, dto),
      activate: (id: string) =>
        request<FinancialYear[]>('POST', `/financial-years/${id}/activate`, {}),
    },
    invoices: {
      list: (params: { status?: string; search?: string } = {}) =>
        request<Invoice[]>('GET', `/invoices${q(params)}`),
      get: (id: string) => request<Invoice>('GET', `/invoices/${id}`),
      previewBatch: (dto: PreviewBatchDto) =>
        request<BatchPreview>('POST', '/invoices/batch/preview', dto),
      createBatch: (dto: CreateBatchDto) =>
        request<{ created: number; invoiceIds: string[] }>('POST', '/invoices/batch', dto),
      createOne: (dto: CreateInvoiceDto) => request<{ id: string }>('POST', '/invoices/single', dto),
      /** Period-wise split of the invoice a student would get under a fee scope. */
      previewSingle: (studentId: string, feeScope: FeeScope) =>
        request<InvoiceSinglePreview>('GET', `/invoices/single/preview${q({ studentId, feeScope })}`),
      update: (id: string, dto: UpdateInvoiceDto) => request<Invoice>('PATCH', `/invoices/${id}`, dto),
      generatePreview: () =>
        request<GeneratePreviewRow[]>('GET', '/invoices/generate/preview'),
      generate: (dto: GenerateInvoicesDto) =>
        request<{ created: number; skipped: number; exempted: number }>('POST', '/invoices/generate', dto),
    },
    payments: {
      list: (params: { search?: string } = {}) =>
        request<Payment[]>('GET', `/payments${q(params)}`),
      summary: () => request<PaymentsSummary>('GET', '/payments/summary'),
      breakdown: (id: string) => request<PaymentBreakdown>('GET', `/payments/${id}/breakdown`),
      create: (dto: CreatePaymentDto) => request<Payment>('POST', '/payments', dto),
      update: (id: string, dto: UpdatePaymentDto) =>
        request<Payment>('PATCH', `/payments/${id}`, dto),
      /** Void a payment: mark inactive and reverse its effect on invoices. */
      deactivate: (id: string) => request<Payment>('POST', `/payments/${id}/deactivate`, {}),
    },
    expenses: {
      /** Books + KPIs for the active year (respecting the date filter). */
      overview: (params: { from?: string; to?: string } = {}) =>
        request<ExpenseOverview>('GET', `/expenses/overview${q(params)}`),
      entries: (
        params: {
          kind?: string;
          accountId?: string;
          categoryId?: string;
          status?: string;
          from?: string;
          to?: string;
          search?: string;
        } = {},
      ) => request<LedgerEntry[]>('GET', `/expenses/entries${q(params)}`),
      createEntry: (dto: CreateLedgerEntryDto) =>
        request<LedgerEntry>('POST', '/expenses/entries', dto),
      updateEntry: (id: string, dto: UpdateLedgerEntryDto) =>
        request<LedgerEntry>('PATCH', `/expenses/entries/${id}`, dto),
      removeEntry: (id: string) => request<void>('DELETE', `/expenses/entries/${id}`),
      approveEntry: (id: string) => request<LedgerEntry>('POST', `/expenses/entries/${id}/approve`, {}),
      rejectEntry: (id: string) => request<void>('POST', `/expenses/entries/${id}/reject`, {}),
      statement: (params: { accountId?: string; from?: string; to?: string } = {}) =>
        request<AccountStatement>('GET', `/expenses/statement${q(params)}`),
      report: () => request<ExpenseReport>('GET', '/expenses/report'),
      accounts: {
        list: () => request<ExpenseAccount[]>('GET', '/expenses/accounts'),
        create: (dto: CreateAccountDto) => request<ExpenseAccount>('POST', '/expenses/accounts', dto),
        update: (id: string, dto: UpdateAccountDto) =>
          request<ExpenseAccount>('PATCH', `/expenses/accounts/${id}`, dto),
        remove: (id: string) => request<void>('DELETE', `/expenses/accounts/${id}`),
      },
      categories: {
        list: () => request<ExpenseCategory[]>('GET', '/expenses/categories'),
        create: (dto: CreateCategoryDto) =>
          request<ExpenseCategory>('POST', '/expenses/categories', dto),
        update: (id: string, dto: UpdateCategoryDto) =>
          request<ExpenseCategory>('PATCH', `/expenses/categories/${id}`, dto),
        remove: (id: string) => request<void>('DELETE', `/expenses/categories/${id}`),
      },
      vendors: {
        list: () => request<Vendor[]>('GET', '/expenses/vendors'),
        create: (dto: CreateVendorDto) => request<Vendor>('POST', '/expenses/vendors', dto),
        update: (id: string, dto: UpdateVendorDto) =>
          request<Vendor>('PATCH', `/expenses/vendors/${id}`, dto),
        remove: (id: string) => request<void>('DELETE', `/expenses/vendors/${id}`),
      },
      settings: {
        get: () => request<ExpenseSettings>('GET', '/expenses/settings'),
        update: (dto: ExpenseSettingsDto) =>
          request<ExpenseSettings>('PUT', '/expenses/settings', dto),
      },
    },
    staff: {
      summary: () => request<StaffSummary>('GET', '/staff/summary'),
      list: (params: { role?: string; search?: string; status?: string } = {}) =>
        request<Employee[]>('GET', `/staff/employees${q(params)}`),
      get: (id: string) => request<Employee>('GET', `/staff/employees/${id}`),
      hire: (dto: CreateEmployeeDto) => request<Employee>('POST', '/staff/employees', dto),
      update: (id: string, dto: UpdateEmployeeDto) =>
        request<Employee>('PATCH', `/staff/employees/${id}`, dto),
      recordRaise: (id: string, dto: RecordRaiseDto) =>
        request<Employee>('POST', `/staff/employees/${id}/raise`, dto),
      markExit: (id: string, dto: MarkExitDto) =>
        request<Employee>('POST', `/staff/employees/${id}/exit`, dto),
      attendance: (month: string) =>
        request<AttendanceMonth>('GET', `/staff/attendance${q({ month })}`),
      setAttendance: (dto: SetAttendanceDto) =>
        request<AttendanceMonth>('PUT', '/staff/attendance', dto),
      leave: {
        list: () => request<LeaveRequestView[]>('GET', '/staff/leave'),
        create: (dto: CreateLeaveDto) => request<LeaveRequestView>('POST', '/staff/leave', dto),
        decide: (id: string, dto: DecideLeaveDto) =>
          request<LeaveRequestView>('PATCH', `/staff/leave/${id}`, dto),
      },
      payroll: (month: string) => request<PayrollOverview>('GET', `/staff/payroll${q({ month })}`),
      pay: (dto: PayStaffDto) => request<Payslip>('POST', '/staff/payroll/pay', dto),
      payslips: () => request<Payslip[]>('GET', '/staff/payslips'),
      exits: () => request<ExitRow[]>('GET', '/staff/exits'),
      settle: (employeeId: string, dto: SettleExitDto) =>
        request<ExitRow>('POST', `/staff/exits/${employeeId}/settle`, dto),
      settings: {
        get: () => request<PayrollSettingsView>('GET', '/staff/settings'),
        update: (dto: PayrollSettingsDto) =>
          request<PayrollSettingsView>('PUT', '/staff/settings', dto),
      },
    },
    setup: {
      overview: () => request<SetupOverview>('GET', '/setup/overview'),
      profile: {
        get: () => request<SchoolProfile>('GET', '/setup/profile'),
        update: (dto: UpdateSchoolProfileDto) =>
          request<SchoolProfile>('PATCH', '/setup/profile', dto),
      },
      subjects: {
        list: () => request<Subject[]>('GET', '/setup/subjects'),
        create: (dto: CreateSubjectDto) => request<Subject>('POST', '/setup/subjects', dto),
        update: (id: string, dto: UpdateSubjectDto) =>
          request<Subject>('PATCH', `/setup/subjects/${id}`, dto),
        remove: (id: string) => request<void>('DELETE', `/setup/subjects/${id}`),
      },
      holidays: {
        list: () => request<Holiday[]>('GET', '/setup/holidays'),
        create: (dto: CreateHolidayDto) => request<Holiday>('POST', '/setup/holidays', dto),
        remove: (id: string) => request<void>('DELETE', `/setup/holidays/${id}`),
      },
      discounts: {
        list: () => request<DiscountRule[]>('GET', '/setup/discounts'),
        create: (dto: CreateDiscountRuleDto) => request<DiscountRule>('POST', '/setup/discounts', dto),
        update: (id: string, dto: UpdateDiscountRuleDto) =>
          request<DiscountRule>('PATCH', `/setup/discounts/${id}`, dto),
        remove: (id: string) => request<void>('DELETE', `/setup/discounts/${id}`),
      },
    },
  };
}

export type MentivaxClient = ReturnType<typeof createClient>;

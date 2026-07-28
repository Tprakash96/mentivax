/**
 * Typed Mentivax API client. Shared by web, desktop, and mobile.
 *
 *   const api = createClient({ baseUrl, getToken, getOrgId });
 *   const students = await api.students.list();
 */
import type {
  CreateBatchDto,
  CreateClassDto,
  CreateFeeTypeDto,
  CreateFinancialYearDto,
  CreateInvoiceDto,
  CreatePaymentDto,
  CreateRouteDto,
  CreateStopDto,
  CreateStudentDto,
  EnableModuleDto,
  FeeScope,
  GenerateInvoicesDto,
  PreviewBatchDto,
  SaveStopFaresDto,
  UpdateClassDto,
  UpdateFeeStructureDto,
  UpdateFeeTypeDto,
  UpdateFinancialYearDto,
  UpdateInvoiceDto,
  UpdatePaymentDto,
  UpdateRouteDto,
  UpdateStopDto,
  UpdateStudentTransportDto,
} from '@mentivax/core';
import type {
  AcademicYear,
  BatchPreview,
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
  SchoolClass,
  Student,
  TransportRoute,
} from './types';

export * from './types';

export interface ClientOptions {
  baseUrl: string;
  /** Returns the bearer token (or null when unauthenticated). */
  getToken?: () => string | null | undefined;
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

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = opts.getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    const orgId = opts.getOrgId?.();
    if (orgId) headers['x-organization-id'] = orgId;

    const res = await doFetch(`${opts.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

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
      list: (params: { classId?: string; status?: string; search?: string } = {}) =>
        request<Student[]>('GET', `/students${q(params)}`),
      get: (id: string) => request<Student>('GET', `/students/${id}`),
      create: (dto: CreateStudentDto) => request<Student>('POST', '/students', dto),
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
  };
}

export type MentivaxClient = ReturnType<typeof createClient>;

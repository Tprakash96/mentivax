/**
 * Typed Mentivax API client. Shared by web, desktop, and mobile.
 *
 *   const api = createClient({ baseUrl, getToken, getOrgId });
 *   const students = await api.students.list();
 */
import type {
  CreateBatchDto,
  CreatePaymentDto,
  CreateStudentDto,
  EnableModuleDto,
  PreviewBatchDto,
  UpdateFeeStructureDto,
} from '@mentivax/core';
import type {
  AcademicYear,
  BatchPreview,
  FeeStructureRow,
  FeeType,
  Invoice,
  ModuleView,
  Organization,
  Payment,
  PaymentsSummary,
  SchoolClass,
  Student,
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
    },
    feeTypes: {
      list: () => request<FeeType[]>('GET', '/fee-types'),
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
    },
    invoices: {
      list: (params: { status?: string; search?: string } = {}) =>
        request<Invoice[]>('GET', `/invoices${q(params)}`),
      get: (id: string) => request<Invoice>('GET', `/invoices/${id}`),
      previewBatch: (dto: PreviewBatchDto) =>
        request<BatchPreview>('POST', '/invoices/batch/preview', dto),
      createBatch: (dto: CreateBatchDto) =>
        request<{ created: number; invoiceIds: string[] }>('POST', '/invoices/batch', dto),
    },
    payments: {
      list: (params: { search?: string } = {}) =>
        request<Payment[]>('GET', `/payments${q(params)}`),
      summary: () => request<PaymentsSummary>('GET', '/payments/summary'),
      create: (dto: CreatePaymentDto) => request<Payment>('POST', '/payments', dto),
    },
  };
}

export type MentivaxClient = ReturnType<typeof createClient>;

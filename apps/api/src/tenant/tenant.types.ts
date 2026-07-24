import type { Request } from 'express';

/** Resolved per-request tenant context. Every service query scopes to this. */
export interface TenantContext {
  organizationId: string;
  /** The active academic year for the org (fees are year-scoped). */
  academicYearId: string;
  academicYearLabel: string;
  currency: string;
  /** Effective module keys this org can use (enabled + always-on core). */
  enabledModules: string[];
  /** Per-module sub-feature config, keyed by module key. */
  moduleConfig: Record<string, unknown>;
}

export interface TenantRequest extends Request {
  tenant?: TenantContext;
}

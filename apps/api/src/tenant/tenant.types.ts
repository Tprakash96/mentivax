import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.types';

/** Resolved per-request tenant context. Every service query scopes to this. */
export interface TenantContext {
  organizationId: string;
  organizationName: string;
  /** The active academic year for the org (fees are year-scoped). */
  academicYearId: string;
  academicYearLabel: string;
  currency: string;
  /** Effective module keys this org can use (enabled + always-on core). */
  enabledModules: string[];
  /** Per-module sub-feature config, keyed by module key. */
  moduleConfig: Record<string, unknown>;

  // --- Who is asking -------------------------------------------------------
  /** The authenticated user acting in this organization. */
  userId: string;
  /** Null for platform admins, who act without a Membership row. */
  membershipId: string | null;
  roleId: string | null;
  roleKey: string | null;
  roleName: string | null;
  /**
   * Permission keys this member holds in this org, already intersected with
   * the org's enabled modules. Platform admins get the full catalog.
   */
  permissions: string[];
  /** True when the caller is a SaaS operator rather than a school member. */
  isPlatformAdmin: boolean;
}

export interface TenantRequest extends Request {
  tenant?: TenantContext;
  user?: AuthUser;
}

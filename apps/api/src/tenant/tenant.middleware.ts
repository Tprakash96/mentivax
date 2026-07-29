import { ForbiddenException, Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { ALL_PERMISSION_KEYS, effectiveModuleKeys, effectivePermissions } from '@mentivax/core';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantRequest } from './tenant.types';

/**
 * Resolves the active organization, academic year, and the caller's authority
 * within that organization.
 *
 * Runs after AuthMiddleware, so `req.user` is already populated. The requested
 * org comes from the `x-organization-id` header (set by api-client from the org
 * switcher); when it is absent we fall back to the user's first membership so
 * the app works immediately after sign-in.
 *
 * Access rules:
 *  - A school member may only enter an organization they hold an active
 *    membership in. Anything else is a 403, never a "not found" — the org's
 *    existence is not something other tenants get to probe.
 *  - Platform admins may enter any organization and receive the full permission
 *    catalog; they hold no Membership rows.
 */
/**
 * Route prefixes that must never resolve a tenant.
 *
 * `MiddlewareConsumer.exclude()` proved unreliable against `forRoutes('*')`
 * with a global prefix set, so the skip list lives here where it is explicit
 * and cannot silently stop matching. These routes either need no organization
 * (health, auth) or take one as an explicit parameter (the admin console, the
 * org switcher) — and several must work for a user who belongs to no org yet.
 */
const UNSCOPED_PREFIXES = ['/api/health', '/api/auth/', '/api/admin/', '/api/organizations'];

const isUnscoped = (path: string): boolean =>
  UNSCOPED_PREFIXES.some((p) => path === p || path.startsWith(p));

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: TenantRequest, _res: Response, next: NextFunction) {
    if (isUnscoped(req.baseUrl || req.path)) return next();

    const user = req.user;
    // Authentication policy belongs to JwtAuthGuard, not here: a @Public() route
    // that happens to match this middleware must still be reachable. With no
    // principal there is no tenant to resolve, so pass through and let the guard
    // decide — it 401s for protected routes and allows public ones.
    if (!user) return next();

    const headerOrgId = req.header('x-organization-id') ?? undefined;

    const membership = await this.prisma.membership.findFirst({
      where: {
        userId: user.id,
        isActive: true,
        organization: { isActive: true },
        ...(headerOrgId ? { organizationId: headerOrgId } : {}),
      },
      include: {
        organization: true,
        role: { include: { permissions: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    let org = membership?.organization ?? null;

    if (!org) {
      if (!user.isPlatformAdmin) {
        throw new ForbiddenException({
          error: 'organization_access_denied',
          message: headerOrgId
            ? 'You do not have access to this organization.'
            : 'Your account is not attached to any organization yet.',
        });
      }
      // Platform admin acting on a tenant they are not a member of.
      org = headerOrgId
        ? await this.prisma.organization.findUnique({ where: { id: headerOrgId } })
        : await this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });

      if (!org) {
        throw new NotFoundException(
          headerOrgId ? `Organization ${headerOrgId} not found` : 'No organization exists yet',
        );
      }
    }

    const year =
      (await this.prisma.academicYear.findFirst({
        where: { organizationId: org.id, isActive: true },
      })) ??
      (await this.prisma.academicYear.findFirst({
        where: { organizationId: org.id },
        orderBy: { startDate: 'desc' },
      }));

    if (!year) {
      throw new NotFoundException(`No academic year configured for ${org.name}`);
    }

    // Load this org's plugged-in modules (active/trial and not expired).
    const now = new Date();
    const rows = await this.prisma.organizationModule.findMany({
      where: {
        organizationId: org.id,
        status: { in: ['ACTIVE', 'TRIAL'] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
    const enabledModules = [...effectiveModuleKeys(rows.map((r) => r.moduleKey))];
    const moduleConfig: Record<string, unknown> = {};
    for (const r of rows) if (r.config != null) moduleConfig[r.moduleKey] = r.config;

    // A permission only counts if the module that owns it is plugged in, so
    // disabling Fees revokes every fee permission without touching a role.
    const permissions = user.isPlatformAdmin
      ? effectivePermissions(ALL_PERMISSION_KEYS, enabledModules)
      : effectivePermissions(
          (membership?.role.permissions ?? []).map((p) => p.permission),
          enabledModules,
        );

    req.tenant = {
      organizationId: org.id,
      organizationName: org.name,
      academicYearId: year.id,
      academicYearLabel: year.label,
      currency: org.currency,
      enabledModules,
      moduleConfig,
      userId: user.id,
      membershipId: membership?.id ?? null,
      roleId: membership?.roleId ?? null,
      roleKey: membership?.role.key ?? null,
      roleName: membership?.role.name ?? null,
      permissions,
      isPlatformAdmin: user.isPlatformAdmin,
    };
    next();
  }
}

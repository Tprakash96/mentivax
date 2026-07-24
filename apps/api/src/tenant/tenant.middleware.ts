import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { effectiveModuleKeys } from '@mentivax/core';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantRequest } from './tenant.types';

/**
 * Resolves the active organization + academic year for each request.
 *
 * The org id comes from the `x-organization-id` header (set by the api-client
 * from the user's org switcher). In this scaffold, auth is stubbed: if no
 * header is present we fall back to the first organization so the app works
 * immediately after seeding. Replace the fallback with real auth before prod.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: TenantRequest, _res: Response, next: NextFunction) {
    const headerOrgId = req.header('x-organization-id') ?? undefined;

    const org = headerOrgId
      ? await this.prisma.organization.findUnique({ where: { id: headerOrgId } })
      : await this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });

    if (!org) {
      throw new NotFoundException(
        headerOrgId ? `Organization ${headerOrgId} not found` : 'No organization found — run `pnpm db:seed`',
      );
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

    req.tenant = {
      organizationId: org.id,
      academicYearId: year.id,
      academicYearLabel: year.label,
      currency: org.currency,
      enabledModules,
      moduleConfig,
    };
    next();
  }
}

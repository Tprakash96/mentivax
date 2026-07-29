import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CORE_MODULE_KEYS,
  MODULES,
  MODULE_MAP,
  effectiveModuleKeys,
  getDependents,
  getMissingDependencies,
  isValidModuleKey,
  type EnableModuleDto,
  type ModuleDef,
} from '@mentivax/core';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';

export interface ModuleView extends ModuleDef {
  enabled: boolean;
  status: 'ACTIVE' | 'TRIAL' | 'SUSPENDED' | null;
  expiresAt: string | null;
  /** Deps not yet enabled (blockers for turning this on). */
  missingDependencies: string[];
}

@Injectable()
export class ModulesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Live enabled keys from the DB (effective = enabled + core). */
  private async enabledKeys(orgId: string): Promise<Set<string>> {
    const now = new Date();
    const rows = await this.prisma.organizationModule.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['ACTIVE', 'TRIAL'] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { moduleKey: true },
    });
    return effectiveModuleKeys(rows.map((r) => r.moduleKey));
  }

  /**
   * The catalog, annotated with an org's entitlement state.
   *
   * Takes a plain org id rather than a TenantContext so the platform admin
   * console can render the same view for any tenant it administers.
   */
  catalog(organizationId: string): Promise<ModuleView[]> {
    return this.catalogFresh(organizationId);
  }

  enabled(t: TenantContext): string[] {
    return t.enabledModules;
  }

  /** Plug a module in for the org. */
  async enable(organizationId: string, key: string, dto: EnableModuleDto): Promise<ModuleView[]> {
    if (!isValidModuleKey(key)) throw new BadRequestException(`Unknown module "${key}"`);
    if (MODULE_MAP[key]!.core) throw new BadRequestException(`"${key}" is a core module and is always on`);

    const enabled = await this.enabledKeys(organizationId);
    const missing = getMissingDependencies(key, enabled);
    if (missing.length) {
      throw new BadRequestException({
        error: 'missing_dependencies',
        module: key,
        missing,
        message: `Enable ${missing.map((k) => `"${MODULE_MAP[k]?.name ?? k}"`).join(', ')} first.`,
      });
    }

    await this.prisma.organizationModule.upsert({
      where: { organizationId_moduleKey: { organizationId, moduleKey: key } },
      create: {
        organizationId,
        moduleKey: key,
        status: dto.status,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        config: (dto.config ?? undefined) as never,
      },
      update: {
        status: dto.status,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        config: (dto.config ?? undefined) as never,
      },
    });

    return this.catalogFresh(organizationId);
  }

  /** Plug a module out. Refuses if other enabled modules depend on it. */
  async disable(organizationId: string, key: string): Promise<ModuleView[]> {
    if (!isValidModuleKey(key)) throw new BadRequestException(`Unknown module "${key}"`);
    if (MODULE_MAP[key]!.core || CORE_MODULE_KEYS.includes(key)) {
      throw new BadRequestException(`"${key}" is a core module and cannot be disabled`);
    }

    const enabled = await this.enabledKeys(organizationId);
    const dependents = getDependents(key, enabled);
    if (dependents.length) {
      throw new BadRequestException({
        error: 'has_dependents',
        module: key,
        dependents,
        message: `Disable ${dependents.map((k) => `"${MODULE_MAP[k]?.name ?? k}"`).join(', ')} first.`,
      });
    }

    await this.prisma.organizationModule.deleteMany({
      where: { organizationId, moduleKey: key },
    });

    return this.catalogFresh(organizationId);
  }

  /** Rebuild the catalog view from fresh DB state (after a mutation). */
  private async catalogFresh(orgId: string): Promise<ModuleView[]> {
    const enabled = await this.enabledKeys(orgId);
    const rows = await this.prisma.organizationModule.findMany({ where: { organizationId: orgId } });
    const byKey = new Map(rows.map((r) => [r.moduleKey, r]));
    return MODULES.map((m) => {
      const row = byKey.get(m.key);
      return {
        ...m,
        enabled: enabled.has(m.key),
        status: m.core ? 'ACTIVE' : (row?.status ?? null),
        expiresAt: row?.expiresAt ? row.expiresAt.toISOString() : null,
        missingDependencies: getMissingDependencies(m.key, enabled),
      };
    });
  }
}

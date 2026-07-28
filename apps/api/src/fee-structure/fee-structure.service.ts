import { Injectable } from '@nestjs/common';
import type { FeeStructureInput } from '@mentivax/core';
import type { FeeStructureRow } from '@mentivax/api-client';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';

@Injectable()
export class FeeStructureService {
  constructor(private readonly prisma: PrismaService) {}

  /** All fee types with the given class's amounts (0 where unset). */
  async getRows(t: TenantContext, classId: string): Promise<FeeStructureRow[]> {
    const feeTypes = await this.prisma.feeType.findMany({
      where: { organizationId: t.organizationId },
      orderBy: { rank: 'asc' },
    });
    const structures = await this.prisma.feeStructure.findMany({
      where: { organizationId: t.organizationId, academicYearId: t.academicYearId, classId },
    });
    const byType = new Map(structures.map((s) => [s.feeTypeId, s]));

    return feeTypes.map((f) => {
      const s = byType.get(f.id);
      return {
        feeTypeId: f.id,
        key: f.key,
        name: f.name,
        period: f.period,
        pricingMode: f.pricingMode,
        periodCount: f.periodCount,
        dueDate: f.dueDate ? f.dueDate.toISOString() : null,
        flatAmount: s?.flatAmount ?? 0,
        newAmount: s?.newAmount ?? 0,
        oldAmount: s?.oldAmount ?? 0,
      };
    });
  }

  /** Engine-ready fee inputs for a class, filtered to keys if provided. */
  async getInputs(t: TenantContext, classId: string, feeKeys?: string[]): Promise<FeeStructureInput[]> {
    const rows = await this.getRows(t, classId);
    const filtered = feeKeys?.length ? rows.filter((r) => feeKeys.includes(r.key)) : rows;
    return filtered.map((r) => ({
      key: r.key,
      name: r.name,
      period: r.period,
      pricingMode: r.pricingMode,
      periodCount: r.periodCount,
      flatAmount: r.flatAmount,
      newAmount: r.newAmount,
      oldAmount: r.oldAmount,
    }));
  }

  async update(
    t: TenantContext,
    classId: string,
    entries: { feeTypeId: string; flatAmount: number; newAmount: number; oldAmount: number }[],
  ): Promise<FeeStructureRow[]> {
    await this.prisma.$transaction(
      entries.map((e) =>
        this.prisma.feeStructure.upsert({
          where: {
            classId_feeTypeId_academicYearId: {
              classId,
              feeTypeId: e.feeTypeId,
              academicYearId: t.academicYearId,
            },
          },
          create: {
            organizationId: t.organizationId,
            academicYearId: t.academicYearId,
            classId,
            feeTypeId: e.feeTypeId,
            flatAmount: e.flatAmount,
            newAmount: e.newAmount,
            oldAmount: e.oldAmount,
          },
          update: { flatAmount: e.flatAmount, newAmount: e.newAmount, oldAmount: e.oldAmount },
        }),
      ),
    );
    return this.getRows(t, classId);
  }
}

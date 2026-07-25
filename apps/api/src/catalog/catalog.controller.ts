import { Body, Controller, Get, NotFoundException, Param, Patch, UseGuards } from '@nestjs/common';
import { updateFeeTypeSchema, type UpdateFeeTypeDto } from '@mentivax/core';
import { PrismaService } from '../prisma/prisma.service';
import { ZodBody } from '../common/zod-body.pipe';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { ModuleGuard } from '../modules/module.guard';
import { RequiresModule } from '../modules/requires-module.decorator';

@Controller('classes')
export class ClassesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Tenant() t: TenantContext) {
    const classes = await this.prisma.schoolClass.findMany({
      where: { organizationId: t.organizationId, academicYearId: t.academicYearId },
      orderBy: { rank: 'asc' },
      include: { _count: { select: { students: true } } },
    });
    return classes.map((c) => ({
      id: c.id,
      name: c.name,
      rank: c.rank,
      studentCount: c._count.students,
    }));
  }
}

@Controller('fee-types')
export class FeeTypesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Tenant() t: TenantContext) {
    const types = await this.prisma.feeType.findMany({
      where: { organizationId: t.organizationId },
      orderBy: { rank: 'asc' },
    });
    return types.map((f) => this.toDto(f));
  }

  /** Update a fee type's period + pricing mode (school-wide, all classes). */
  @Patch(':id')
  @RequiresModule('fees')
  @UseGuards(ModuleGuard)
  async update(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(updateFeeTypeSchema)) dto: UpdateFeeTypeDto,
  ) {
    const { count } = await this.prisma.feeType.updateMany({
      where: { id, organizationId: t.organizationId },
      data: {
        name: dto.name,
        period: dto.period,
        pricingMode: dto.pricingMode,
        periodCount: dto.periodCount,
        // Only DUE_DATE fees carry a date; clear it otherwise.
        dueDate: dto.period === 'DUE_DATE' && dto.dueDate ? new Date(dto.dueDate) : null,
      },
    });
    if (count === 0) throw new NotFoundException('Fee type not found');
    const updated = await this.prisma.feeType.findFirstOrThrow({
      where: { id, organizationId: t.organizationId },
    });
    return this.toDto(updated);
  }

  private toDto(f: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    period: string;
    pricingMode: string;
    periodCount: number;
    dueDate: Date | null;
    optIn: boolean;
    rank: number;
  }) {
    return {
      id: f.id,
      key: f.key,
      name: f.name,
      description: f.description,
      period: f.period,
      pricingMode: f.pricingMode,
      periodCount: f.periodCount,
      dueDate: f.dueDate ? f.dueDate.toISOString() : null,
      optIn: f.optIn,
      rank: f.rank,
    };
  }
}

import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';

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
    return types.map((f) => ({
      id: f.id,
      key: f.key,
      name: f.name,
      description: f.description,
      period: f.period,
      pricingMode: f.pricingMode,
      periodCount: f.periodCount,
      optIn: f.optIn,
      rank: f.rank,
    }));
  }
}

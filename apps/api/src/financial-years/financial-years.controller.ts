import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  createFinancialYearSchema,
  updateFinancialYearSchema,
  type CreateFinancialYearDto,
  type UpdateFinancialYearDto,
} from '@mentivax/core';
import { PrismaService } from '../prisma/prisma.service';
import { ZodBody } from '../common/zod-body.pipe';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';

type YearRecord = { id: string; label: string; startDate: Date; endDate: Date; isActive: boolean };

/**
 * Financial years (internally `AcademicYear`). The active year drives every
 * tenant-scoped query via TenantMiddleware, so exactly one is active at a time.
 */
@Controller('financial-years')
export class FinancialYearsController {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(y: YearRecord) {
    return {
      id: y.id,
      label: y.label,
      startDate: y.startDate.toISOString(),
      endDate: y.endDate.toISOString(),
      isActive: y.isActive,
    };
  }

  @Get()
  async list(@Tenant() t: TenantContext) {
    const years = await this.prisma.academicYear.findMany({
      where: { organizationId: t.organizationId },
      orderBy: { startDate: 'desc' },
    });
    return years.map((y) => this.toDto(y));
  }

  @Post()
  async create(
    @Tenant() t: TenantContext,
    @Body(new ZodBody(createFinancialYearSchema)) dto: CreateFinancialYearDto,
  ) {
    const dupe = await this.prisma.academicYear.findFirst({
      where: { organizationId: t.organizationId, label: dto.label.trim() },
    });
    if (dupe) throw new BadRequestException('A year with this label already exists');

    const created = await this.prisma.$transaction(async (tx) => {
      if (dto.activate) {
        await tx.academicYear.updateMany({
          where: { organizationId: t.organizationId },
          data: { isActive: false },
        });
      }
      return tx.academicYear.create({
        data: {
          organizationId: t.organizationId,
          label: dto.label.trim(),
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          isActive: dto.activate,
        },
      });
    });
    return this.toDto(created);
  }

  @Patch(':id')
  async update(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(updateFinancialYearSchema)) dto: UpdateFinancialYearDto,
  ) {
    const { count } = await this.prisma.academicYear.updateMany({
      where: { id, organizationId: t.organizationId },
      data: {
        label: dto.label?.trim(),
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
    if (count === 0) throw new NotFoundException('Year not found');
    const y = await this.prisma.academicYear.findFirstOrThrow({
      where: { id, organizationId: t.organizationId },
    });
    return this.toDto(y);
  }

  @Post(':id/activate')
  async activate(@Tenant() t: TenantContext, @Param('id') id: string) {
    const target = await this.prisma.academicYear.findFirst({
      where: { id, organizationId: t.organizationId },
    });
    if (!target) throw new NotFoundException('Year not found');
    await this.prisma.$transaction([
      this.prisma.academicYear.updateMany({
        where: { organizationId: t.organizationId },
        data: { isActive: false },
      }),
      this.prisma.academicYear.update({ where: { id }, data: { isActive: true } }),
    ]);
    return this.list(t);
  }
}

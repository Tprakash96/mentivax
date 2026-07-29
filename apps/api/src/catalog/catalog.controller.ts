import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  createClassSchema,
  createFeeTypeSchema,
  updateClassSchema,
  updateFeeTypeSchema,
  type CreateClassDto,
  type CreateFeeTypeDto,
  type UpdateClassDto,
  type UpdateFeeTypeDto,
} from '@mentivax/core';
import { PrismaService } from '../prisma/prisma.service';
import { ZodBody } from '../common/zod-body.pipe';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { ModuleGuard } from '../modules/module.guard';
import { RequiresModule } from '../modules/requires-module.decorator';
import { RequirePermissions } from '../auth/auth.decorators';

/** Slugify a fee name into a stable engine key, e.g. "Van Fee" -> "van-fee". */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'fee'
  );
}

/**
 * Classes are school-defined (names vary per school). List/create/rename stay
 * ungated because `students` is a core module and needs classes; deletion is
 * blocked while students reference the class.
 */
@Controller('classes')
export class ClassesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('classes:read')
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

  @Post()
  @RequirePermissions('classes:write')
  async create(@Tenant() t: TenantContext, @Body(new ZodBody(createClassSchema)) dto: CreateClassDto) {
    const name = dto.name.trim();
    const dupe = await this.prisma.schoolClass.findFirst({
      where: { organizationId: t.organizationId, academicYearId: t.academicYearId, name },
    });
    if (dupe) throw new BadRequestException('A class with this name already exists');

    const rank = dto.rank ?? (await this.nextRank(t));
    const c = await this.prisma.schoolClass.create({
      data: {
        organizationId: t.organizationId,
        academicYearId: t.academicYearId,
        name,
        rank,
      },
    });
    return { id: c.id, name: c.name, rank: c.rank, studentCount: 0 };
  }

  @Patch(':id')
  @RequirePermissions('classes:write')
  async update(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(updateClassSchema)) dto: UpdateClassDto,
  ) {
    const existing = await this.prisma.schoolClass.findFirst({
      where: { id, organizationId: t.organizationId, academicYearId: t.academicYearId },
    });
    if (!existing) throw new NotFoundException('Class not found');

    const name = dto.name?.trim();
    if (name && name !== existing.name) {
      const dupe = await this.prisma.schoolClass.findFirst({
        where: { organizationId: t.organizationId, academicYearId: t.academicYearId, name, id: { not: id } },
      });
      if (dupe) throw new BadRequestException('A class with this name already exists');
    }

    const updated = await this.prisma.schoolClass.update({
      where: { id },
      data: { name: name ?? undefined, rank: dto.rank ?? undefined },
      include: { _count: { select: { students: true } } },
    });
    return { id: updated.id, name: updated.name, rank: updated.rank, studentCount: updated._count.students };
  }

  @Delete(':id')
  @RequirePermissions('classes:write')
  @HttpCode(204)
  async remove(@Tenant() t: TenantContext, @Param('id') id: string) {
    const cls = await this.prisma.schoolClass.findFirst({
      where: { id, organizationId: t.organizationId, academicYearId: t.academicYearId },
      include: { _count: { select: { students: true } } },
    });
    if (!cls) throw new NotFoundException('Class not found');
    if (cls._count.students > 0) {
      throw new BadRequestException('Move or remove this class’s students before deleting it');
    }
    // FeeStructure rows for this class cascade on delete.
    await this.prisma.schoolClass.delete({ where: { id } });
  }

  private async nextRank(t: TenantContext): Promise<number> {
    const top = await this.prisma.schoolClass.findFirst({
      where: { organizationId: t.organizationId, academicYearId: t.academicYearId },
      orderBy: { rank: 'desc' },
      select: { rank: true },
    });
    return (top?.rank ?? -1) + 1;
  }
}

type FeeTypeRecord = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  period: string;
  pricingMode: string;
  periodCount: number;
  dueDate: Date | null;
  rank: number;
};

/**
 * Fee types are the school-wide "fee items" (a row: name + duration + pricing).
 * Amounts per class live in FeeStructure. Write routes require the `fees` module.
 */
@Controller('fee-types')
export class FeeTypesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('fees:read')
  async list(@Tenant() t: TenantContext) {
    const types = await this.prisma.feeType.findMany({
      where: { organizationId: t.organizationId },
      orderBy: { rank: 'asc' },
    });
    return types.map((f) => this.toDto(f));
  }

  /** Create a fee item; auto-generates a stable slug key unique per org. */
  @Post()
  @RequirePermissions('fees:write')
  @RequiresModule('fees')
  @UseGuards(ModuleGuard)
  async create(@Tenant() t: TenantContext, @Body(new ZodBody(createFeeTypeSchema)) dto: CreateFeeTypeDto) {
    const key = await this.uniqueKey(t, slugify(dto.name));
    const rank = await this.nextRank(t);
    const created = await this.prisma.feeType.create({
      data: {
        organizationId: t.organizationId,
        key,
        name: dto.name.trim(),
        period: dto.period,
        pricingMode: dto.pricingMode,
        periodCount: dto.periodCount,
        dueDate: dto.period === 'DUE_DATE' && dto.dueDate ? new Date(dto.dueDate) : null,
        rank,
      },
    });
    return this.toDto(created);
  }

  /** Update a fee item's name / duration / pricing (school-wide, all classes). */
  @Patch(':id')
  @RequirePermissions('fees:write')
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

  @Delete(':id')
  @RequirePermissions('fees:write')
  @RequiresModule('fees')
  @UseGuards(ModuleGuard)
  @HttpCode(204)
  async remove(@Tenant() t: TenantContext, @Param('id') id: string) {
    // FeeStructure rows for this fee cascade on delete; issued invoices keep
    // their snapshotted feeKey/feeName and are unaffected.
    const { count } = await this.prisma.feeType.deleteMany({
      where: { id, organizationId: t.organizationId },
    });
    if (count === 0) throw new NotFoundException('Fee type not found');
  }

  private async nextRank(t: TenantContext): Promise<number> {
    const top = await this.prisma.feeType.findFirst({
      where: { organizationId: t.organizationId },
      orderBy: { rank: 'desc' },
      select: { rank: true },
    });
    return (top?.rank ?? -1) + 1;
  }

  /** Ensure the slug key is unique per org, appending -2, -3, … on collision. */
  private async uniqueKey(t: TenantContext, base: string): Promise<string> {
    let key = base;
    let n = 2;
    // Keys are unique per (organizationId, key) in the schema.
    while (
      await this.prisma.feeType.findFirst({
        where: { organizationId: t.organizationId, key },
        select: { id: true },
      })
    ) {
      key = `${base}-${n++}`;
    }
    return key;
  }

  private toDto(f: FeeTypeRecord) {
    return {
      id: f.id,
      key: f.key,
      name: f.name,
      description: f.description,
      period: f.period,
      pricingMode: f.pricingMode,
      periodCount: f.periodCount,
      dueDate: f.dueDate ? f.dueDate.toISOString() : null,
      rank: f.rank,
    };
  }
}

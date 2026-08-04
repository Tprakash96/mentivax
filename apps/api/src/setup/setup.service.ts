import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateDiscountRuleDto,
  CreateHolidayDto,
  CreateSubjectDto,
  UpdateDiscountRuleDto,
  UpdateSchoolProfileDto,
  UpdateSubjectDto,
} from '@mentivax/core';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';

@Injectable()
export class SetupService {
  constructor(private readonly prisma: PrismaService) {}

  private org(t: TenantContext) {
    return { organizationId: t.organizationId };
  }

  // --- Profile -------------------------------------------------------------

  async getProfile(t: TenantContext) {
    const o = await this.prisma.organization.findUnique({ where: { id: t.organizationId } });
    if (!o) throw new NotFoundException('Organization not found');
    return {
      name: o.name,
      shortCode: o.shortCode,
      affiliation: o.affiliation,
      board: o.board,
      principalName: o.principalName,
      phone: o.phone,
      email: o.email,
      address: o.address,
    };
  }

  async updateProfile(t: TenantContext, dto: UpdateSchoolProfileDto) {
    await this.prisma.organization.update({
      where: { id: t.organizationId },
      data: {
        name: dto.name ?? undefined,
        shortCode: dto.shortCode ?? undefined,
        affiliation: dto.affiliation ?? undefined,
        board: dto.board ?? undefined,
        principalName: dto.principalName ?? undefined,
        phone: dto.phone ?? undefined,
        email: dto.email ?? undefined,
        address: dto.address ?? undefined,
      },
    });
    return this.getProfile(t);
  }

  // --- Subjects ------------------------------------------------------------

  async listSubjects(t: TenantContext) {
    const rows = await this.prisma.subject.findMany({ where: this.org(t), orderBy: { rank: 'asc' } });
    return rows.map((s) => ({ id: s.id, name: s.name, classIds: s.classIds, rank: s.rank }));
  }

  async createSubject(t: TenantContext, dto: CreateSubjectDto) {
    const max = await this.prisma.subject.aggregate({ where: this.org(t), _max: { rank: true } });
    const s = await this.prisma.subject.create({
      data: {
        organizationId: t.organizationId,
        name: dto.name.trim(),
        classIds: dto.classIds ?? [],
        rank: (max._max.rank ?? -1) + 1,
      },
    });
    return { id: s.id, name: s.name, classIds: s.classIds, rank: s.rank };
  }

  async updateSubject(t: TenantContext, id: string, dto: UpdateSubjectDto) {
    const existing = await this.prisma.subject.findFirst({ where: { id, ...this.org(t) } });
    if (!existing) throw new NotFoundException('Subject not found');
    const s = await this.prisma.subject.update({
      where: { id },
      data: { name: dto.name?.trim() ?? undefined, classIds: dto.classIds ?? undefined },
    });
    return { id: s.id, name: s.name, classIds: s.classIds, rank: s.rank };
  }

  async removeSubject(t: TenantContext, id: string) {
    const existing = await this.prisma.subject.findFirst({ where: { id, ...this.org(t) } });
    if (!existing) throw new NotFoundException('Subject not found');
    await this.prisma.subject.delete({ where: { id } });
  }

  // --- Holidays ------------------------------------------------------------

  async listHolidays(t: TenantContext) {
    const rows = await this.prisma.holiday.findMany({
      where: { ...this.org(t), academicYearId: t.academicYearId },
      orderBy: { date: 'asc' },
    });
    return rows.map((h) => ({ id: h.id, name: h.name, date: h.date.toISOString().slice(0, 10), kind: h.kind }));
  }

  async createHoliday(t: TenantContext, dto: CreateHolidayDto) {
    const h = await this.prisma.holiday.create({
      data: {
        organizationId: t.organizationId,
        academicYearId: t.academicYearId,
        name: dto.name.trim(),
        date: new Date(dto.date),
        kind: dto.kind ?? 'School holiday',
      },
    });
    return { id: h.id, name: h.name, date: h.date.toISOString().slice(0, 10), kind: h.kind };
  }

  async removeHoliday(t: TenantContext, id: string) {
    const existing = await this.prisma.holiday.findFirst({ where: { id, ...this.org(t) } });
    if (!existing) throw new NotFoundException('Holiday not found');
    await this.prisma.holiday.delete({ where: { id } });
  }

  // --- Discount rules ------------------------------------------------------

  private discountDto(r: { id: string; name: string; kind: string; value: number; appliesTo: string; rank: number }) {
    return { id: r.id, name: r.name, kind: r.kind as 'PERCENT' | 'FLAT', value: r.value, appliesTo: r.appliesTo, rank: r.rank };
  }

  async listDiscounts(t: TenantContext) {
    const rows = await this.prisma.discountRule.findMany({ where: this.org(t), orderBy: { rank: 'asc' } });
    return rows.map((r) => this.discountDto(r));
  }

  async createDiscount(t: TenantContext, dto: CreateDiscountRuleDto) {
    const max = await this.prisma.discountRule.aggregate({ where: this.org(t), _max: { rank: true } });
    const r = await this.prisma.discountRule.create({
      data: {
        organizationId: t.organizationId,
        name: dto.name.trim(),
        kind: dto.kind ?? 'PERCENT',
        value: dto.value ?? 0,
        appliesTo: dto.appliesTo ?? '',
        rank: (max._max.rank ?? -1) + 1,
      },
    });
    return this.discountDto(r);
  }

  async updateDiscount(t: TenantContext, id: string, dto: UpdateDiscountRuleDto) {
    const existing = await this.prisma.discountRule.findFirst({ where: { id, ...this.org(t) } });
    if (!existing) throw new NotFoundException('Discount rule not found');
    const r = await this.prisma.discountRule.update({
      where: { id },
      data: {
        name: dto.name?.trim() ?? undefined,
        kind: dto.kind ?? undefined,
        value: dto.value ?? undefined,
        appliesTo: dto.appliesTo === undefined ? undefined : dto.appliesTo,
      },
    });
    return this.discountDto(r);
  }

  async removeDiscount(t: TenantContext, id: string) {
    const existing = await this.prisma.discountRule.findFirst({ where: { id, ...this.org(t) } });
    if (!existing) throw new NotFoundException('Discount rule not found');
    await this.prisma.discountRule.delete({ where: { id } });
  }

  // --- Overview (completion of the essential steps) ------------------------

  async overview(t: TenantContext) {
    const [org, activeYear, classes, subjectCount, teacherCount, feeCount] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: t.organizationId } }),
      this.prisma.academicYear.findFirst({ where: { ...this.org(t), isActive: true } }),
      this.prisma.schoolClass.findMany({
        where: { ...this.org(t), academicYearId: t.academicYearId },
        select: { sections: true, classTeacherId: true },
      }),
      this.prisma.subject.count({ where: this.org(t) }),
      this.prisma.employee.count({ where: { ...this.org(t), status: 'ACTIVE', role: 'TEACHER' } }),
      this.prisma.feeType.count({ where: this.org(t) }),
    ]);

    const profile = !!(org && org.name && org.affiliation && org.phone);
    const year = !!activeYear;
    const classesDone = classes.length > 0 && classes.every((c) => c.sections.length > 0);
    const subjects = subjectCount > 0;
    const staff = teacherCount > 0 && classes.length > 0 && classes.every((c) => !!c.classTeacherId);
    const fees = feeCount > 0;

    const musts = [profile, year, classesDone, subjects, staff, fees];
    return {
      profile,
      year,
      classes: classesDone,
      subjects,
      staff,
      fees,
      doneMusts: musts.filter(Boolean).length,
      totalMusts: musts.length,
    };
  }
}

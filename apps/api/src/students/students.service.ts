import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateStudentDto } from '@mentivax/core';
import type { Student } from '@mentivax/api-client';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';

type StudentRecord = {
  id: string;
  name: string;
  classId: string;
  isNewAdmission: boolean;
  hasTransport: boolean;
  parentName: string | null;
  phone: string | null;
  schoolClass: { name: string };
  invoices: { netAmount: number; paidAmount: number }[];
};

function toDto(s: StudentRecord): Student {
  const annualFee = s.invoices.reduce((a, i) => a + i.netAmount, 0);
  const paid = s.invoices.reduce((a, i) => a + i.paidAmount, 0);
  const pending = Math.max(0, annualFee - paid);
  const status: Student['status'] = pending <= 0 && annualFee > 0 ? 'paid' : paid > 0 ? 'part' : 'due';
  return {
    id: s.id,
    name: s.name,
    classId: s.classId,
    className: s.schoolClass.name,
    isNewAdmission: s.isNewAdmission,
    hasTransport: s.hasTransport,
    parentName: s.parentName,
    phone: s.phone,
    annualFee,
    paid,
    pending,
    status,
  };
}

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    t: TenantContext,
    filters: { classId?: string; status?: string; search?: string },
  ): Promise<Student[]> {
    const students = await this.prisma.student.findMany({
      where: {
        organizationId: t.organizationId,
        academicYearId: t.academicYearId,
        classId: filters.classId || undefined,
        name: filters.search ? { contains: filters.search, mode: 'insensitive' } : undefined,
      },
      orderBy: { name: 'asc' },
      include: {
        schoolClass: { select: { name: true } },
        invoices: { select: { netAmount: true, paidAmount: true } },
      },
    });
    const mapped = students.map(toDto);
    return filters.status && filters.status !== 'all'
      ? mapped.filter((s) => s.status === filters.status)
      : mapped;
  }

  async get(t: TenantContext, id: string): Promise<Student> {
    const s = await this.prisma.student.findFirst({
      where: { id, organizationId: t.organizationId },
      include: {
        schoolClass: { select: { name: true } },
        invoices: { select: { netAmount: true, paidAmount: true } },
      },
    });
    if (!s) throw new NotFoundException('Student not found');
    return toDto(s);
  }

  async create(t: TenantContext, dto: CreateStudentDto): Promise<Student> {
    const created = await this.prisma.student.create({
      data: {
        organizationId: t.organizationId,
        academicYearId: t.academicYearId,
        classId: dto.classId,
        name: dto.name,
        isNewAdmission: dto.isNewAdmission,
        hasTransport: dto.hasTransport,
        parentName: dto.parentName,
        phone: dto.phone,
        email: dto.email,
      },
      include: {
        schoolClass: { select: { name: true } },
        invoices: { select: { netAmount: true, paidAmount: true } },
      },
    });
    return toDto(created);
  }
}

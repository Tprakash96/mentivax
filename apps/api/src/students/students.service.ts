import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateStudentDto, DiscountType, TransportShift, UpdateStudentTransportDto } from '@mentivax/core';
import type { Student } from '@mentivax/api-client';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceGenerationService } from '../invoices/invoice-generation.service';
import type { TenantContext } from '../tenant/tenant.types';

type StudentRecord = {
  id: string;
  name: string;
  classId: string;
  isNewAdmission: boolean;
  parentName: string | null;
  phone: string | null;
  transportStopId: string | null;
  transportShift: TransportShift | null;
  feeExempt: boolean;
  discountType: DiscountType;
  discountValue: number;
  schoolClass: { name: string };
  transportStop: { name: string; route: { name: string } } | null;
  invoices: { netAmount: number; paidAmount: number }[];
};

const STUDENT_INCLUDE = {
  schoolClass: { select: { name: true } },
  transportStop: { select: { name: true, route: { select: { name: true } } } },
  invoices: { select: { netAmount: true, paidAmount: true } },
} as const;

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
    parentName: s.parentName,
    phone: s.phone,
    transportStopId: s.transportStopId,
    transportShift: s.transportShift,
    transportStopName: s.transportStop
      ? `${s.transportStop.route.name} · ${s.transportStop.name}`
      : null,
    feeExempt: s.feeExempt,
    discountType: s.discountType,
    discountValue: s.discountValue,
    annualFee,
    paid,
    pending,
    status,
  };
}

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: InvoiceGenerationService,
  ) {}

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
      include: STUDENT_INCLUDE,
    });
    const mapped = students.map(toDto);
    return filters.status && filters.status !== 'all'
      ? mapped.filter((s) => s.status === filters.status)
      : mapped;
  }

  async get(t: TenantContext, id: string): Promise<Student> {
    const s = await this.prisma.student.findFirst({
      where: { id, organizationId: t.organizationId },
      include: STUDENT_INCLUDE,
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
        parentName: dto.parentName,
        phone: dto.phone,
        email: dto.email,
        transportStopId: dto.transportStopId || null,
        transportShift: dto.transportStopId ? dto.transportShift : null,
        feeExempt: dto.feeExempt ?? false,
        discountType: dto.discountType ?? 'NONE',
        discountValue: dto.discountValue ?? 0,
      },
      select: { id: true },
    });

    // Auto-generate this student's invoice from their standard's fees + transport.
    await this.generation.generateForStudent(t, created.id);

    return this.get(t, created.id);
  }

  /** Assign or clear a student's transport stop + shift. */
  async assignTransport(t: TenantContext, id: string, dto: UpdateStudentTransportDto): Promise<Student> {
    const stopId = dto.transportStopId || null;
    const { count } = await this.prisma.student.updateMany({
      where: { id, organizationId: t.organizationId, academicYearId: t.academicYearId },
      data: {
        transportStopId: stopId,
        transportShift: stopId ? dto.transportShift : null,
      },
    });
    if (count === 0) throw new NotFoundException('Student not found');
    return this.get(t, id);
  }
}

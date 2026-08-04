import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateStudentDto,
  DiscountType,
  TransportShift,
  UpdateStudentDto,
  UpdateStudentTransportDto,
} from '@mentivax/core';
import type { Student } from '@mentivax/api-client';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceGenerationService } from '../invoices/invoice-generation.service';
import type { TenantContext } from '../tenant/tenant.types';

type StudentRecord = {
  id: string;
  name: string;
  classId: string;
  admissionNo: string;
  admissionType: string;
  isNewAdmission: boolean;
  enrollmentStatus: string;
  documents: string[];
  exitDate: Date | null;
  exitReason: string;
  dateOfBirth: Date | null;
  emisNo: string;
  penNo: string;
  aadhaar: string;
  guardianRelation: string;
  parentName: string | null;
  phone: string | null;
  transportStopId: string | null;
  transportShift: TransportShift | null;
  transportLandmark: string | null;
  feeExempt: boolean;
  discountType: DiscountType;
  discountValue: number;
  discountFeeKey: string;
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
    admissionNo: s.admissionNo,
    admissionType: s.admissionType as Student['admissionType'],
    isNewAdmission: s.isNewAdmission,
    enrollment: s.enrollmentStatus as Student['enrollment'],
    documents: s.documents,
    exitDate: s.exitDate ? s.exitDate.toISOString().slice(0, 10) : null,
    exitReason: s.exitReason,
    dateOfBirth: s.dateOfBirth ? s.dateOfBirth.toISOString().slice(0, 10) : null,
    emisNo: s.emisNo,
    penNo: s.penNo,
    aadhaar: s.aadhaar,
    parentName: s.parentName,
    guardianRelation: s.guardianRelation,
    phone: s.phone,
    transportStopId: s.transportStopId,
    transportShift: s.transportShift,
    transportLandmark: s.transportLandmark,
    transportStopName: s.transportStop
      ? `${s.transportStop.route.name} · ${s.transportStop.name}`
      : null,
    feeExempt: s.feeExempt,
    discountType: s.discountType,
    discountValue: s.discountValue,
    discountFeeKey: s.discountFeeKey,
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
    filters: { classId?: string; status?: string; enrollment?: string; search?: string },
  ): Promise<Student[]> {
    const enrollments = ['APPLICANT', 'ACTIVE', 'TC_ISSUED', 'ALUMNI'];
    const students = await this.prisma.student.findMany({
      where: {
        organizationId: t.organizationId,
        academicYearId: t.academicYearId,
        classId: filters.classId || undefined,
        name: filters.search ? { contains: filters.search, mode: 'insensitive' } : undefined,
        // Filter by lifecycle: a given status, else everyone still on the roll.
        enrollmentStatus: enrollments.includes(filters.enrollment ?? '')
          ? (filters.enrollment as never)
          : { not: 'ALUMNI' },
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
        admissionNo: dto.admissionNo ?? '',
        admissionType: dto.admissionType ?? 'NEW',
        isNewAdmission: dto.admissionType ? dto.admissionType === 'NEW' : dto.isNewAdmission,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        emisNo: dto.emisNo ?? '',
        penNo: dto.penNo ?? '',
        aadhaar: dto.aadhaar ?? '',
        parentName: dto.parentName,
        guardianRelation: dto.guardianRelation ?? '',
        phone: dto.phone,
        email: dto.email,
        documents: dto.documents ?? [],
        transportStopId: dto.transportStopId || null,
        transportShift: dto.transportStopId ? dto.transportShift : null,
        transportLandmark: dto.transportStopId ? (dto.transportLandmark || null) : null,
        feeExempt: dto.feeExempt ?? false,
        discountType: dto.discountType ?? 'NONE',
        discountValue: dto.discountValue ?? 0,
        discountFeeKey: dto.discountFeeKey ?? '',
      },
      select: { id: true },
    });

    // Auto-generate this student's invoice from their standard's fees + transport.
    await this.generation.generateForStudent(t, created.id);

    return this.get(t, created.id);
  }

  /** Edit an existing student. Only the fields present in `dto` are changed. */
  async update(t: TenantContext, id: string, dto: UpdateStudentDto): Promise<Student> {
    const data: Record<string, unknown> = {
      name: dto.name?.trim(),
      classId: dto.classId,
      admissionNo: dto.admissionNo,
      admissionType: dto.admissionType,
      isNewAdmission: dto.admissionType ? dto.admissionType === 'NEW' : dto.isNewAdmission,
      dateOfBirth: dto.dateOfBirth === undefined ? undefined : dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
      emisNo: dto.emisNo,
      penNo: dto.penNo,
      aadhaar: dto.aadhaar,
      parentName: dto.parentName === undefined ? undefined : dto.parentName || null,
      guardianRelation: dto.guardianRelation,
      phone: dto.phone === undefined ? undefined : dto.phone || null,
      email: dto.email === undefined ? undefined : dto.email || null,
      enrollmentStatus: dto.enrollmentStatus,
      documents: dto.documents,
      exitReason: dto.exitReason,
      feeExempt: dto.feeExempt,
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      discountFeeKey: dto.discountFeeKey,
    };
    // Stamp/clear the exit date as the student leaves or returns to the roll.
    if (dto.enrollmentStatus === 'TC_ISSUED' || dto.enrollmentStatus === 'ALUMNI') {
      data.exitDate = new Date();
    } else if (dto.enrollmentStatus === 'ACTIVE' || dto.enrollmentStatus === 'APPLICANT') {
      data.exitDate = null;
    }
    if (dto.transportStopId !== undefined) {
      const stopId = dto.transportStopId || null;
      data.transportStopId = stopId;
      data.transportShift = stopId ? (dto.transportShift ?? 'BOTH') : null;
      data.transportLandmark = stopId ? (dto.transportLandmark || null) : null;
    }
    const { count } = await this.prisma.student.updateMany({
      where: { id, organizationId: t.organizationId, academicYearId: t.academicYearId },
      data,
    });
    if (count === 0) throw new NotFoundException('Student not found');
    return this.get(t, id);
  }

  // --- Year rollover -------------------------------------------------------

  /** Ordered standards + the standard each promotes into (null = graduate). */
  private async promotionMap(t: TenantContext) {
    const classes = await this.prisma.schoolClass.findMany({
      where: { organizationId: t.organizationId, academicYearId: t.academicYearId },
      orderBy: { rank: 'asc' },
      select: { id: true, name: true, rank: true },
    });
    return classes.map((c, i) => ({
      classId: c.id,
      className: c.name,
      next: classes[i + 1] ?? null,
    }));
  }

  async rolloverPreview(t: TenantContext) {
    const map = await this.promotionMap(t);
    const counts = await this.prisma.student.groupBy({
      by: ['classId'],
      where: { organizationId: t.organizationId, academicYearId: t.academicYearId, enrollmentStatus: 'ACTIVE' },
      _count: { _all: true },
    });
    const byClass = new Map(counts.map((c) => [c.classId, c._count._all]));
    return map.map((m) => ({
      classId: m.classId,
      className: m.className,
      nextClassId: m.next?.id ?? null,
      nextClassName: m.next?.name ?? null,
      count: byClass.get(m.classId) ?? 0,
    }));
  }

  /** Promote every active student one standard up; the top standard graduates. */
  async rollover(t: TenantContext) {
    const map = await this.promotionMap(t);
    const nextByClass = new Map(map.map((m) => [m.classId, m.next?.id ?? null]));
    const students = await this.prisma.student.findMany({
      where: { organizationId: t.organizationId, academicYearId: t.academicYearId, enrollmentStatus: 'ACTIVE' },
      select: { id: true, classId: true },
    });
    let promoted = 0;
    let graduated = 0;
    await this.prisma.$transaction(
      students.map((s) => {
        const nextId = nextByClass.get(s.classId);
        if (nextId) {
          promoted++;
          return this.prisma.student.update({ where: { id: s.id }, data: { classId: nextId, isNewAdmission: false } });
        }
        graduated++;
        return this.prisma.student.update({
          where: { id: s.id },
          data: { enrollmentStatus: 'ALUMNI', exitDate: new Date(), exitReason: 'Graduated' },
        });
      }),
    );
    return { promoted, graduated };
  }

  /** Assign or clear a student's transport stop + shift. */
  async assignTransport(t: TenantContext, id: string, dto: UpdateStudentTransportDto): Promise<Student> {
    const stopId = dto.transportStopId || null;
    const { count } = await this.prisma.student.updateMany({
      where: { id, organizationId: t.organizationId, academicYearId: t.academicYearId },
      data: {
        transportStopId: stopId,
        transportShift: stopId ? dto.transportShift : null,
        transportLandmark: stopId ? dto.transportLandmark || null : null,
      },
    });
    if (count === 0) throw new NotFoundException('Student not found');
    return this.get(t, id);
  }
}

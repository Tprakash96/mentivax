import { BadRequestException, Injectable } from '@nestjs/common';
import {
  buildInvoiceLines,
  computeDiscount,
  deriveStatus,
  invoiceTotals,
  periodMeta,
  TRANSPORT_FEE_KEY,
  type CreateInvoiceDto,
  type DiscountType,
  type DraftLine,
  type FeeScope,
  type GenerateInvoicesDto,
  type LandmarkFare,
  type TransportBillingInput,
  type TransportShift,
} from '@mentivax/core';
import { PrismaService } from '../prisma/prisma.service';
import { FeeStructureService } from '../fee-structure/fee-structure.service';
import type { TenantContext } from '../tenant/tenant.types';

type StudentRow = {
  id: string;
  classId: string;
  isNewAdmission: boolean;
  transportStopId: string | null;
  transportShift: TransportShift | null;
  transportLandmark: string | null;
  feeExempt: boolean;
  discountType: DiscountType;
  discountValue: number;
  discountFeeKey: string;
};

const STUDENT_SELECT = {
  id: true,
  classId: true,
  isNewAdmission: true,
  transportStopId: true,
  transportShift: true,
  transportLandmark: true,
  feeExempt: true,
  discountType: true,
  discountValue: true,
  discountFeeKey: true,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** One period slot of a single invoice, for the Add-invoice split preview. */
export interface InvoicePeriodRow {
  feeKey: string;
  feeName: string;
  period: string;
  amount: number;
}
export interface InvoiceSinglePreview {
  rows: InvoicePeriodRow[];
  gross: number;
}

/** One preview row for the Generate-invoices review screen. */
export interface GeneratePreviewRow {
  studentId: string;
  name: string;
  classId: string;
  className: string;
  classRank: number;
  /** Base gross before any discount (paise). */
  gross: number;
  /** Split of gross so the client can scope by fee type. */
  academicGross: number;
  transportGross: number;
  feeExempt: boolean;
  discountType: DiscountType;
  discountValue: number;
  discountFeeKey: string;
  hasInvoice: boolean;
}

/**
 * Auto-invoicing: builds each student's invoice from their criteria — the
 * academic fees for their standard plus a transport line for their stop/shift —
 * honouring the student's persistent fee adjustments (exemption + whole-invoice
 * discount). Used on student creation (single) and the bulk Generate action.
 */
@Injectable()
export class InvoiceGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feeStructure: FeeStructureService,
  ) {}

  /** Resolve a student's transport fare input, if they're assigned a stop. */
  private async transportFor(
    t: TenantContext,
    student: StudentRow,
  ): Promise<TransportBillingInput | undefined> {
    if (!student.transportStopId || !student.transportShift) return undefined;
    const stop = await this.prisma.transportStop.findFirst({
      where: { id: student.transportStopId, organizationId: t.organizationId },
      include: { route: { select: { name: true } } },
    });
    if (!stop) return undefined;
    // Transport is billed per landmark: use the student's landmark fare, else the stop fare.
    const landmarks = (Array.isArray(stop.landmarks) ? stop.landmarks : []) as unknown as LandmarkFare[];
    const lm = student.transportLandmark
      ? landmarks.find((l) => l.name === student.transportLandmark)
      : undefined;

    // The school's transport fee head (if defined) drives the fare basis and the
    // line name; otherwise fall back to the org transport setting.
    const [transportFee, settings] = await Promise.all([
      this.prisma.feeType.findFirst({
        where: { organizationId: t.organizationId, pricingMode: { in: ['STOP', 'DISTANCE', 'FLAT'] } },
        orderBy: { rank: 'asc' },
      }),
      this.prisma.transportSetting.findUnique({ where: { organizationId: t.organizationId } }),
    ]);
    const basis = transportFee?.pricingMode ?? settings?.fareBasis ?? 'STOP';

    let bothWayFare = lm?.bothWayFare ?? stop.bothWayFare;
    let oneWayFare = lm?.oneWayFare ?? stop.oneWayFare;
    if (basis === 'FLAT') {
      // One flat fare for every rider, regardless of stop/distance.
      bothWayFare = transportFee?.transportFlatAmount ?? 0;
      oneWayFare = transportFee?.transportFlatAmount ?? 0;
    } else if (basis === 'DISTANCE') {
      // fare = distance (km) × per-km rate (rates live in the transport setting).
      const km = lm?.distanceKm ?? 0;
      bothWayFare = Math.round(km * (settings?.ratePerKmBoth ?? 0));
      oneWayFare = Math.round(km * (settings?.ratePerKmOne ?? 0));
    }

    return {
      fare: {
        stopId: stop.id,
        stopName: stop.name,
        routeName: stop.route.name,
        bothWayFare,
        oneWayFare,
        landmarkName: lm?.name,
      },
      shift: student.transportShift,
      headName: transportFee?.name,
    };
  }

  /**
   * Build (not persist) an invoice for a student, or null if nothing billable.
   *
   * A concession is scoped by `discountFeeKey`: when set, the discount is
   * computed on **that fee head's gross alone** and recorded on that fee's line
   * (so a 50% concession on School Fee is 50% of School Fee, never touching
   * Store or Transport). With no key ("") it stays a whole-invoice discount.
   */
  private async buildFor(t: TenantContext, student: StudentRow) {
    const fees = await this.feeStructure.getInputs(t, student.classId);
    const transport = await this.transportFor(t, student);
    const lines = buildInvoiceLines(fees, { isNewAdmission: student.isNewAdmission }, transport);
    if (lines.length === 0) return null;

    const gross = invoiceTotals(lines).gross;
    const transportGross = lines
      .filter((l) => l.key === TRANSPORT_FEE_KEY)
      .reduce((a, l) => a + l.gross, 0);
    const academicGross = gross - transportGross;

    // Fee head the discount targets (from the concession). "" = whole invoice.
    const targetKey = student.discountFeeKey || '';
    const targetGross = targetKey
      ? lines.filter((l) => l.key === targetKey).reduce((a, l) => a + l.gross, 0)
      : gross;
    const discount = computeDiscount(targetGross, student.discountType, student.discountValue);

    const lineData = lines.map((l) => {
      // A targeted discount is booked against its own fee line; an untargeted
      // (whole-invoice) discount stays at the invoice level (lines at gross).
      const onThisLine = targetKey !== '' && discount > 0 && l.key === targetKey;
      return {
        feeKey: l.key,
        feeName: l.name,
        period: l.period,
        grossAmount: l.gross,
        discountType: onThisLine ? student.discountType : ('NONE' as const),
        discountValue: onThisLine ? student.discountValue : 0,
        discountAmount: onThisLine ? discount : 0,
        netAmount: onThisLine ? Math.max(0, l.gross - discount) : l.gross,
        periods: l.periods,
      };
    });

    const net = Math.max(0, gross - discount);
    return { lineData, gross, academicGross, transportGross, discount, net };
  }

  private async nextSeq(t: TenantContext): Promise<number> {
    return (await this.prisma.invoice.count({ where: { organizationId: t.organizationId } })) + 1;
  }

  private async persist(
    t: TenantContext,
    studentId: string,
    built: NonNullable<Awaited<ReturnType<InvoiceGenerationService['buildFor']>>>,
    seq: number,
    opts?: { name?: string; issueDate?: string; dueDate?: string; discountReason?: string },
  ) {
    const issueDate = opts?.issueDate ? new Date(opts.issueDate) : new Date();
    const dueDate = opts?.dueDate ? new Date(opts.dueDate) : new Date(issueDate.getTime() + 30 * DAY_MS);
    return this.prisma.invoice.create({
      data: {
        organizationId: t.organizationId,
        academicYearId: t.academicYearId,
        studentId,
        number: `INV-${String(seq).padStart(4, '0')}`,
        name: opts?.name?.trim() || `Fees ${t.academicYearLabel}`,
        issueDate,
        dueDate,
        status: deriveStatus(built.net, 0),
        grossAmount: built.gross,
        discountAmount: built.discount,
        netAmount: built.net,
        paidAmount: 0,
        discountReason: built.discount > 0 ? opts?.discountReason?.trim() || null : null,
        lines: { create: built.lineData },
      },
    });
  }

  /** Generate + persist one student's invoice (called on student creation). */
  async generateForStudent(
    t: TenantContext,
    studentId: string,
    opts?: { name?: string; issueDate?: string; dueDate?: string },
  ): Promise<string | null> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, organizationId: t.organizationId, academicYearId: t.academicYearId },
      select: STUDENT_SELECT,
    });
    if (!student || student.feeExempt) return null;
    const built = await this.buildFor(t, student);
    if (!built) return null;
    const inv = await this.persist(t, student.id, built, await this.nextSeq(t), opts);
    return inv.id;
  }

  /** Create a single invoice for one student, with an optional invoice discount. */
  async createOne(t: TenantContext, dto: CreateInvoiceDto): Promise<{ id: string }> {
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, organizationId: t.organizationId, academicYearId: t.academicYearId },
      select: STUDENT_SELECT,
    });
    if (!student) throw new BadRequestException('Student not found');

    const fees = await this.feeStructure.getInputs(t, student.classId);
    const transport = await this.transportFor(t, student);
    const allLines = buildInvoiceLines(fees, { isNewAdmission: student.isNewAdmission }, transport);

    const lines = this.scopeLines(allLines, dto.feeScope);
    if (lines.length === 0) {
      throw new BadRequestException(
        dto.feeScope === 'TRANSPORT'
          ? 'No transport is configured for this student'
          : 'No fees are configured for this student’s standard',
      );
    }

    const lineData = lines.map((l) => ({
      feeKey: l.key,
      feeName: l.name,
      period: l.period,
      grossAmount: l.gross,
      discountType: 'NONE' as const,
      discountValue: 0,
      discountAmount: 0,
      netAmount: l.gross,
      periods: l.periods,
    }));
    const gross = invoiceTotals(lines).gross;
    const transportGross = lines
      .filter((l) => l.key === TRANSPORT_FEE_KEY)
      .reduce((a, l) => a + l.gross, 0);
    const academicGross = gross - transportGross;
    // The discount targets a specific period of a fee, a whole fee, or the whole invoice.
    let discountBase = gross;
    if (dto.discountFeeKey) {
      const targetLine = lines.find((l) => l.key === dto.discountFeeKey);
      if (targetLine) {
        discountBase =
          dto.discountPeriodIndex != null
            ? (targetLine.periods[dto.discountPeriodIndex] ?? 0)
            : targetLine.gross;
      } else {
        discountBase = 0;
      }
    }
    const discount = computeDiscount(discountBase, dto.discountType ?? 'NONE', dto.discountValue ?? 0);
    const net = Math.max(0, gross - discount);

    const inv = await this.persist(
      t,
      student.id,
      { lineData, gross, academicGross, transportGross, discount, net },
      await this.nextSeq(t),
      dto,
    );
    return { id: inv.id };
  }

  /** Restrict built lines to a fee scope (academic fees, transport, or both). */
  private scopeLines(lines: DraftLine[], scope: FeeScope): DraftLine[] {
    if (scope === 'ACADEMIC') return lines.filter((l) => l.key !== TRANSPORT_FEE_KEY);
    if (scope === 'TRANSPORT') return lines.filter((l) => l.key === TRANSPORT_FEE_KEY);
    return lines;
  }

  /**
   * Period-wise split of the invoice that would be created for a student under a
   * given fee scope — each fee broken into its periods (Term 1/2, monthly, …)
   * with the per-period amount. Powers the Add-invoice breakdown preview.
   */
  async previewSingle(
    t: TenantContext,
    studentId: string,
    scope: FeeScope,
  ): Promise<InvoiceSinglePreview> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, organizationId: t.organizationId, academicYearId: t.academicYearId },
      select: STUDENT_SELECT,
    });
    if (!student) throw new BadRequestException('Student not found');

    const fees = await this.feeStructure.getInputs(t, student.classId);
    const transport = await this.transportFor(t, student);
    const lines = this.scopeLines(
      buildInvoiceLines(fees, { isNewAdmission: student.isNewAdmission }, transport),
      scope,
    );

    const ayStart = t.academicYearStart ? new Date(t.academicYearStart) : null;
    const startYear = ayStart ? ayStart.getUTCFullYear() : Number.parseInt(t.academicYearLabel, 10) || 2026;
    const startMonth = ayStart ? ayStart.getUTCMonth() : 3;
    const rows: InvoicePeriodRow[] = [];
    for (const l of lines) {
      const { labels } = periodMeta({ period: l.period, periodCount: l.periods.length }, startYear, startMonth);
      l.periods.forEach((amount, i) => {
        rows.push({ feeKey: l.key, feeName: l.name, period: labels[i] ?? `Period ${i + 1}`, amount });
      });
    }
    return { rows, gross: invoiceTotals(lines).gross };
  }

  /** Per-student rows for the review screen (base gross + saved adjustments). */
  async previewForYear(t: TenantContext): Promise<GeneratePreviewRow[]> {
    const students = await this.prisma.student.findMany({
      where: { organizationId: t.organizationId, academicYearId: t.academicYearId },
      orderBy: [{ schoolClass: { rank: 'asc' } }, { name: 'asc' }],
      select: { ...STUDENT_SELECT, name: true, schoolClass: { select: { name: true, rank: true } } },
    });
    const invoiced = new Set(
      (
        await this.prisma.invoice.findMany({
          where: { organizationId: t.organizationId, academicYearId: t.academicYearId },
          select: { studentId: true },
        })
      ).map((i) => i.studentId),
    );

    const rows: GeneratePreviewRow[] = [];
    for (const s of students) {
      const built = await this.buildFor(t, s);
      rows.push({
        studentId: s.id,
        name: s.name,
        classId: s.classId,
        className: s.schoolClass.name,
        classRank: s.schoolClass.rank,
        gross: built?.gross ?? 0,
        academicGross: built?.academicGross ?? 0,
        transportGross: built?.transportGross ?? 0,
        feeExempt: s.feeExempt,
        discountType: s.discountType,
        discountValue: s.discountValue,
        discountFeeKey: s.discountFeeKey,
        hasInvoice: invoiced.has(s.id),
      });
    }
    return rows;
  }

  /**
   * Bulk-generate invoices for the active year (optionally one standard). First
   * persists any per-student adjustments, then creates one invoice per eligible
   * student — skipping exempt students and honouring their discount. Idempotent:
   * already-invoiced students are skipped unless `regenerate` (paid never touched).
   */
  async generateForYear(
    t: TenantContext,
    dto: GenerateInvoicesDto,
  ): Promise<{ created: number; skipped: number; exempted: number }> {
    // 1. Persist per-student adjustments (exemption / discount) first.
    if (dto.adjustments) {
      await this.prisma.$transaction(
        Object.entries(dto.adjustments).map(([studentId, adj]) =>
          this.prisma.student.updateMany({
            where: { id: studentId, organizationId: t.organizationId, academicYearId: t.academicYearId },
            data: {
              feeExempt: adj.feeExempt,
              discountType: adj.discountType,
              discountValue: adj.discountValue,
              // Only overwrite the fee target when the client sends one, so a
              // concession set at admission isn't silently reset to whole-invoice.
              ...(adj.discountFeeKey !== undefined ? { discountFeeKey: adj.discountFeeKey } : {}),
            },
          }),
        ),
      );
    }

    const students = await this.prisma.student.findMany({
      where: {
        organizationId: t.organizationId,
        academicYearId: t.academicYearId,
        classId: dto.classId || undefined,
      },
      orderBy: { name: 'asc' },
      select: STUDENT_SELECT,
    });

    let seq = await this.nextSeq(t);
    let created = 0;
    let skipped = 0;
    let exempted = 0;

    for (const s of students) {
      if (s.feeExempt) {
        exempted++;
        continue;
      }
      const existing = await this.prisma.invoice.findFirst({
        where: { studentId: s.id, academicYearId: t.academicYearId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, paidAmount: true },
      });
      if (existing && (!dto.regenerate || existing.paidAmount > 0)) {
        skipped++;
        continue;
      }
      if (existing && dto.regenerate) {
        await this.prisma.invoice.deleteMany({
          where: { studentId: s.id, academicYearId: t.academicYearId, paidAmount: 0 },
        });
      }
      const built = await this.buildFor(t, s);
      if (!built) {
        skipped++;
        continue;
      }
      await this.persist(t, s.id, built, seq++, dto);
      created++;
    }
    return { created, skipped, exempted };
  }
}

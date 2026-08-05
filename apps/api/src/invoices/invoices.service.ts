import { Injectable, NotFoundException } from '@nestjs/common';
import {
  buildStudentLines,
  computeDiscount,
  deriveStatus,
  invoiceTotals,
  periodBreakdown,
  resolveFeeAmount,
  type CreateBatchDto,
  type DiscountType,
  type FeeStructureInput,
  type PreviewBatchDto,
  type UpdateInvoiceDto,
} from '@mentivax/core';
import type { BatchPreview, BatchPreviewRow, Invoice } from '@mentivax/api-client';
import { PrismaService } from '../prisma/prisma.service';
import { FeeStructureService } from '../fee-structure/fee-structure.service';
import type { TenantContext } from '../tenant/tenant.types';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feeStructure: FeeStructureService,
  ) {}

  private async loadStudents(t: TenantContext, classId: string, segment: string) {
    const students = await this.prisma.student.findMany({
      where: { organizationId: t.organizationId, academicYearId: t.academicYearId, classId },
      orderBy: { name: 'asc' },
    });
    if (segment === 'new') return students.filter((s) => s.isNewAdmission);
    if (segment === 'old') return students.filter((s) => !s.isNewAdmission);
    return students;
  }

  /** Step 1/2: compute default lines for every student in the batch. */
  async previewBatch(t: TenantContext, dto: PreviewBatchDto): Promise<BatchPreview> {
    const cls = await this.prisma.schoolClass.findFirst({
      where: { id: dto.classId, organizationId: t.organizationId },
    });
    if (!cls) throw new NotFoundException('Class not found');

    const fees = await this.feeStructure.getInputs(t, dto.classId, dto.feeKeys);
    const students = await this.loadStudents(t, dto.classId, dto.segment);

    const rows: BatchPreviewRow[] = students.map((s) => {
      const lines = buildStudentLines(fees, {
        isNewAdmission: s.isNewAdmission,
      });
      const amounts: Record<string, number | null> = {};
      for (const fee of fees) {
        const line = lines.find((l) => l.key === fee.key);
        amounts[fee.key] = line ? line.gross : null;
      }
      const totals = invoiceTotals(lines);
      return {
        studentId: s.id,
        name: s.name,
        isNewAdmission: s.isNewAdmission,
        amounts,
        gross: totals.gross,
        discount: totals.discount,
        net: totals.net,
      };
    });

    const totals = rows.reduce(
      (acc, r) => ({
        count: acc.count + 1,
        gross: acc.gross + r.gross,
        discount: acc.discount + r.discount,
        net: acc.net + r.net,
      }),
      { count: 0, gross: 0, discount: 0, net: 0 },
    );

    return {
      classId: cls.id,
      className: cls.name,
      columns: fees.map((f) => ({ key: f.key, name: f.name, period: f.period })),
      rows,
      totals,
    };
  }

  /** Step 3: persist an invoice per student, applying per-student adjustments. */
  async createBatch(t: TenantContext, dto: CreateBatchDto): Promise<{ created: number; invoiceIds: string[] }> {
    const cls = await this.prisma.schoolClass.findFirst({
      where: { id: dto.classId, organizationId: t.organizationId },
    });
    if (!cls) throw new NotFoundException('Class not found');

    const fees = await this.feeStructure.getInputs(t, dto.classId, dto.feeKeys);
    const feeByKey = new Map<string, FeeStructureInput>(fees.map((f) => [f.key, f]));
    const students = await this.loadStudents(t, dto.classId, dto.segment);

    // Reserve a contiguous block of invoice numbers.
    const existing = await this.prisma.invoice.count({ where: { organizationId: t.organizationId } });
    let seq = existing + 1;

    const invoiceIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      const batch = await tx.invoiceBatch.create({
        data: {
          organizationId: t.organizationId,
          academicYearId: t.academicYearId,
          name: dto.name,
          classId: dto.classId,
          issueDate: new Date(dto.issueDate),
          dueDate: new Date(dto.dueDate),
        },
      });

      for (const s of students) {
        const adj = dto.adjustments?.[s.id];
        const baseLines = buildStudentLines(fees, {
          isNewAdmission: s.isNewAdmission,
        });
        if (baseLines.length === 0) continue;

        // Apply per-line discounts from the review grid.
        const lineData = baseLines.map((line) => {
          const override = adj?.lines?.find((l) => l.feeKey === line.key);
          const fee = feeByKey.get(line.key)!;
          const discountType: DiscountType = override?.discountType ?? 'NONE';
          const discountValue = override?.discountValue ?? 0;
          const discount = computeDiscount(line.gross, discountType, discountValue);
          const net = Math.max(0, line.gross - discount);
          const periods = override?.periods ?? periodBreakdown(fee, net);
          return {
            feeKey: line.key,
            feeName: line.name,
            period: line.period,
            grossAmount: line.gross,
            discountType,
            discountValue,
            discountAmount: discount,
            netAmount: net,
            periods,
            reason: override?.reason,
          };
        });

        let gross = lineData.reduce((a, l) => a + l.grossAmount, 0);
        let discount = lineData.reduce((a, l) => a + l.discountAmount, 0);
        // Optional invoice-level flat discount on top of line discounts.
        if (adj?.flatDiscount) discount = Math.min(gross, discount + adj.flatDiscount);
        const net = Math.max(0, gross - discount);

        const number = `INV-${String(seq++).padStart(4, '0')}`;
        const invoice = await tx.invoice.create({
          data: {
            organizationId: t.organizationId,
            academicYearId: t.academicYearId,
            studentId: s.id,
            batchId: batch.id,
            number,
            name: dto.name,
            issueDate: new Date(dto.issueDate),
            dueDate: new Date(dto.dueDate),
            status: deriveStatus(net, 0),
            grossAmount: gross,
            discountAmount: discount,
            netAmount: net,
            paidAmount: 0,
            lines: { create: lineData },
          },
        });
        invoiceIds.push(invoice.id);
      }
    });

    return { created: invoiceIds.length, invoiceIds };
  }

  async list(t: TenantContext, filters: { status?: string; search?: string }): Promise<Invoice[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId: t.organizationId,
        academicYearId: t.academicYearId,
        status: filters.status ? (filters.status.toUpperCase() as never) : undefined,
        student: filters.search
          ? { name: { contains: filters.search, mode: 'insensitive' } }
          : undefined,
      },
      orderBy: { createdAt: 'desc' },
      include: { student: { include: { schoolClass: { select: { name: true } } } } },
    });
    return invoices.map((i) => this.toDto(i));
  }

  /** Edit an invoice's label, dates, and invoice-level discount (net + status re-derived). */
  async update(t: TenantContext, id: string, dto: UpdateInvoiceDto): Promise<Invoice> {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, organizationId: t.organizationId },
    });
    if (!inv) throw new NotFoundException('Invoice not found');

    // Recompute the invoice-level discount only when a discount field is sent.
    let discountAmount = inv.discountAmount;
    let netAmount = inv.netAmount;
    if (dto.discountType !== undefined || dto.discountValue !== undefined) {
      discountAmount = computeDiscount(inv.grossAmount, dto.discountType ?? 'NONE', dto.discountValue ?? 0);
      netAmount = Math.max(0, inv.grossAmount - discountAmount);
    }

    const updated = await this.prisma.invoice.update({
      where: { id: inv.id },
      data: {
        name: dto.name?.trim() || undefined,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        discountAmount,
        netAmount,
        // Keep the reason in step with the discount: store it when there's a
        // discount, clear it when the discount goes to zero.
        ...(dto.discountReason !== undefined || dto.discountType !== undefined || dto.discountValue !== undefined
          ? { discountReason: discountAmount > 0 ? dto.discountReason?.trim() || null : null }
          : {}),
        status: deriveStatus(netAmount, inv.paidAmount),
      },
      include: {
        student: { include: { schoolClass: { select: { name: true } } } },
        lines: true,
      },
    });
    return this.toDto(updated);
  }

  async get(t: TenantContext, id: string): Promise<Invoice> {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, organizationId: t.organizationId },
      include: {
        student: { include: { schoolClass: { select: { name: true } } } },
        lines: true,
      },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    return this.toDto(inv);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDto(i: any): Invoice {
    return {
      id: i.id,
      number: i.number,
      name: i.name,
      studentId: i.studentId,
      studentName: i.student.name,
      className: i.student.schoolClass.name,
      issueDate: i.issueDate.toISOString(),
      dueDate: i.dueDate.toISOString(),
      status: i.status,
      grossAmount: i.grossAmount,
      discountAmount: i.discountAmount,
      discountReason: i.discountReason ?? null,
      netAmount: i.netAmount,
      paidAmount: i.paidAmount,
      lines: i.lines?.map((l: any) => ({
        id: l.id,
        feeKey: l.feeKey,
        feeName: l.feeName,
        period: l.period,
        grossAmount: l.grossAmount,
        discountAmount: l.discountAmount,
        netAmount: l.netAmount,
        periods: l.periods,
        reason: l.reason,
      })),
    };
  }
}

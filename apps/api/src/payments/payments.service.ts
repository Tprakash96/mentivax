import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { deriveStatus, type CreatePaymentDto, type UpdatePaymentDto } from '@mentivax/core';
import type { Payment, PaymentsSummary } from '@mentivax/api-client';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';

/** A human label for one period slot of a fee, from its duration type. */
function periodLabel(period: string, i: number, count: number): string {
  if (period === 'TERM') return count > 1 ? `Term ${i + 1}` : 'Term';
  if (period === 'MONTHLY') return `Month ${i + 1}`;
  if (period === 'DUE_DATE') return 'Due date';
  return 'One-time';
}

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(t: TenantContext): Promise<PaymentsSummary> {
    const agg = await this.prisma.invoice.aggregate({
      where: {
        organizationId: t.organizationId,
        academicYearId: t.academicYearId,
        status: { not: 'CANCELLED' },
      },
      _sum: { netAmount: true, paidAmount: true },
      _count: true,
    });
    const totalInvoiced = agg._sum.netAmount ?? 0;
    const collected = agg._sum.paidAmount ?? 0;
    return {
      totalInvoiced,
      collected,
      balanceDue: Math.max(0, totalInvoiced - collected),
      invoiceCount: agg._count,
    };
  }

  async list(t: TenantContext, filters: { search?: string }): Promise<Payment[]> {
    const payments = await this.prisma.payment.findMany({
      where: {
        organizationId: t.organizationId,
        student: filters.search
          ? { name: { contains: filters.search, mode: 'insensitive' } }
          : undefined,
      },
      orderBy: { paidAt: 'desc' },
      include: { student: { select: { name: true } } },
    });
    return payments.map((p) => ({
      id: p.id,
      receiptNo: p.receiptNo,
      studentId: p.studentId,
      studentName: p.student.name,
      paidAt: p.paidAt.toISOString(),
      amount: p.amount,
      mode: p.mode,
      description: p.description,
      isActive: p.isActive,
    }));
  }

  async create(t: TenantContext, dto: CreatePaymentDto): Promise<Payment> {
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, organizationId: t.organizationId },
    });
    if (!student) throw new BadRequestException('Student not found');

    // Determine allocations: explicit, or auto-apply to oldest open invoices.
    let allocations = dto.allocations;
    if (!allocations || allocations.length === 0) {
      const open = await this.prisma.invoice.findMany({
        where: {
          organizationId: t.organizationId,
          studentId: dto.studentId,
          status: { in: ['PENDING', 'PARTIAL'] },
        },
        orderBy: { dueDate: 'asc' },
      });
      allocations = [];
      let remaining = dto.amount;
      for (const inv of open) {
        if (remaining <= 0) break;
        const owed = Math.max(0, inv.netAmount - inv.paidAmount);
        const apply = Math.min(owed, remaining);
        if (apply > 0) {
          allocations.push({ invoiceId: inv.id, amount: apply });
          remaining -= apply;
        }
      }
    }

    const receiptNo = await this.nextReceiptNo(t);

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          organizationId: t.organizationId,
          studentId: dto.studentId,
          receiptNo,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          amount: dto.amount,
          mode: dto.mode,
          description: dto.description,
          allocations: { create: allocations!.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })) },
        },
        include: { student: { select: { name: true } } },
      });

      // Roll payments into invoice paidAmount + status.
      for (const a of allocations!) {
        const inv = await tx.invoice.findUniqueOrThrow({ where: { id: a.invoiceId } });
        const paidAmount = inv.paidAmount + a.amount;
        await tx.invoice.update({
          where: { id: a.invoiceId },
          data: { paidAmount, status: deriveStatus(inv.netAmount, paidAmount) },
        });
      }

      return {
        id: payment.id,
        receiptNo: payment.receiptNo,
        studentId: payment.studentId,
        studentName: payment.student.name,
        paidAt: payment.paidAt.toISOString(),
        amount: payment.amount,
        mode: payment.mode,
        description: payment.description,
        isActive: payment.isActive,
      };
    });
  }

  /**
   * Void a payment: reverse its allocations from the invoices they paid
   * (re-deriving each invoice's status), drop the allocations, and mark the
   * payment inactive. Collected / Balance due follow automatically since they
   * read invoice paidAmount. Idempotent — a second call is a no-op.
   */
  async deactivate(t: TenantContext, id: string): Promise<Payment> {
    const payment = await this.prisma.payment.findFirst({
      where: { id, organizationId: t.organizationId },
      include: { allocations: true, student: { select: { name: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    if (payment.isActive) {
      await this.prisma.$transaction(async (tx) => {
        for (const a of payment.allocations) {
          const inv = await tx.invoice.findUnique({ where: { id: a.invoiceId } });
          if (!inv) continue;
          const paidAmount = Math.max(0, inv.paidAmount - a.amount);
          await tx.invoice.update({
            where: { id: inv.id },
            data: { paidAmount, status: deriveStatus(inv.netAmount, paidAmount) },
          });
        }
        await tx.paymentAllocation.deleteMany({ where: { paymentId: id } });
        await tx.payment.update({ where: { id }, data: { isActive: false } });
      });
    }

    return {
      id: payment.id,
      receiptNo: payment.receiptNo,
      studentId: payment.studentId,
      studentName: payment.student.name,
      paidAt: payment.paidAt.toISOString(),
      amount: payment.amount,
      mode: payment.mode,
      description: payment.description,
      isActive: false,
    };
  }

  /** Edit a payment: reverse its old allocations, re-allocate the new amount. */
  async update(t: TenantContext, id: string, dto: UpdatePaymentDto): Promise<Payment> {
    const payment = await this.prisma.payment.findFirst({
      where: { id, organizationId: t.organizationId },
      include: { allocations: true, student: { select: { name: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    return this.prisma.$transaction(async (tx) => {
      // 1. Reverse the old allocations from their invoices.
      for (const a of payment.allocations) {
        const inv = await tx.invoice.findUnique({ where: { id: a.invoiceId } });
        if (!inv) continue;
        const paidAmount = Math.max(0, inv.paidAmount - a.amount);
        await tx.invoice.update({
          where: { id: inv.id },
          data: { paidAmount, status: deriveStatus(inv.netAmount, paidAmount) },
        });
      }
      await tx.paymentAllocation.deleteMany({ where: { paymentId: id } });

      // 2. Re-allocate the new amount to the student's oldest open invoices.
      const open = await tx.invoice.findMany({
        where: {
          organizationId: t.organizationId,
          studentId: payment.studentId,
          status: { in: ['PENDING', 'PARTIAL'] },
        },
        orderBy: { dueDate: 'asc' },
      });
      const allocations: { invoiceId: string; amount: number }[] = [];
      let remaining = dto.amount;
      for (const inv of open) {
        if (remaining <= 0) break;
        const owed = Math.max(0, inv.netAmount - inv.paidAmount);
        const apply = Math.min(owed, remaining);
        if (apply > 0) {
          allocations.push({ invoiceId: inv.id, amount: apply });
          remaining -= apply;
        }
      }
      for (const a of allocations) {
        const inv = await tx.invoice.findUniqueOrThrow({ where: { id: a.invoiceId } });
        const paidAmount = inv.paidAmount + a.amount;
        await tx.invoice.update({
          where: { id: a.invoiceId },
          data: { paidAmount, status: deriveStatus(inv.netAmount, paidAmount) },
        });
      }

      // 3. Update the payment itself.
      const updated = await tx.payment.update({
        where: { id },
        data: {
          amount: dto.amount,
          mode: dto.mode,
          description: dto.description ?? null,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : payment.paidAt,
          allocations: { create: allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })) },
        },
        include: { student: { select: { name: true } } },
      });
      return {
        id: updated.id,
        receiptNo: updated.receiptNo,
        studentId: updated.studentId,
        studentName: updated.student.name,
        paidAt: updated.paidAt.toISOString(),
        amount: updated.amount,
        mode: updated.mode,
        description: updated.description,
        isActive: updated.isActive,
      };
    });
  }

  /**
   * Period-wise breakdown of a single payment: which fee periods (Term 1/2,
   * months, …) this payment covered. Computed by ordering all payments on each
   * touched invoice chronologically, so each payment maps to the right slots.
   */
  async breakdown(t: TenantContext, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, organizationId: t.organizationId },
      include: { allocations: true, student: { select: { name: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    const rows: { feeName: string; period: string; amount: number }[] = [];

    for (const alloc of payment.allocations) {
      const inv = await this.prisma.invoice.findUnique({
        where: { id: alloc.invoiceId },
        include: { lines: true },
      });
      if (!inv) continue;

      // Flatten the invoice into ordered period slots (fee × period).
      const slots: { feeName: string; label: string; amount: number }[] = [];
      for (const l of inv.lines) {
        const periods = Array.isArray(l.periods) ? (l.periods as number[]) : [l.netAmount];
        periods.forEach((amt, i) => slots.push({ feeName: l.feeName, label: periodLabel(l.period, i, periods.length), amount: amt }));
      }

      // How much was paid on this invoice by payments BEFORE this one.
      const invAllocs = await this.prisma.paymentAllocation.findMany({
        where: { invoiceId: inv.id },
        include: { payment: { select: { id: true, paidAt: true } } },
      });
      invAllocs.sort((a, b) => {
        const d = a.payment.paidAt.getTime() - b.payment.paidAt.getTime();
        return d !== 0 ? d : a.payment.id.localeCompare(b.payment.id);
      });
      let priorPaid = 0;
      for (const a of invAllocs) {
        if (a.paymentId === paymentId) break;
        priorPaid += a.amount;
      }

      // Assign this payment's amount to the slots that follow the prior-paid offset.
      let skip = priorPaid;
      let give = alloc.amount;
      for (const s of slots) {
        if (give <= 0) break;
        if (skip >= s.amount) {
          skip -= s.amount;
          continue;
        }
        const available = s.amount - skip;
        skip = 0;
        const take = Math.min(available, give);
        give -= take;
        rows.push({ feeName: s.feeName, period: s.label, amount: take });
      }
    }

    return {
      receiptNo: payment.receiptNo,
      studentName: payment.student.name,
      amount: payment.amount,
      rows,
    };
  }

  private async nextReceiptNo(t: TenantContext): Promise<string> {
    const count = await this.prisma.payment.count({ where: { organizationId: t.organizationId } });
    return `RCPT-${String(count + 1).padStart(5, '0')}`;
  }
}

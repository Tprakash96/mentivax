import { BadRequestException, Injectable } from '@nestjs/common';
import { deriveStatus, type CreatePaymentDto } from '@mentivax/core';
import type { Payment, PaymentsSummary } from '@mentivax/api-client';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';

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
      };
    });
  }

  private async nextReceiptNo(t: TenantContext): Promise<string> {
    const count = await this.prisma.payment.count({ where: { organizationId: t.organizationId } });
    return `RCPT-${String(count + 1).padStart(5, '0')}`;
  }
}

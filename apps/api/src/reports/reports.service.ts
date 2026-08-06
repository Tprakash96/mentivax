import { Injectable } from '@nestjs/common';
import { formatMoney, periodMeta, settleLines, type FeePeriod, type SettleLine } from '@mentivax/core';
import type {
  AskAnswer,
  ConcessionRow,
  ConcessionsReport,
  FeeHeadPeriod,
  FeeHeadRow,
  FeeHeadsReport,
  ReportsOverview,
  TransportReport,
} from '@mentivax/api-client';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';
import { GeminiService } from './gemini.service';

/**
 * A "live" invoice is one the school has actually asked money for. Drafts are
 * not billable yet and cancelled invoices no longer count, so every figure on
 * the Reports page is computed over this set — which is what makes Collected,
 * Invoiced and Pending reconcile with the Payments summary.
 */
const LIVE: ('PENDING' | 'PARTIAL' | 'PAID')[] = ['PENDING', 'PARTIAL', 'PAID'];

/** Fee-head marker colours, assigned by rank so a head keeps its colour. */
const DOTS = ['#2450E0', '#12A87A', '#E8792B', '#6D28D9', '#0B7A5A', '#B3261E', '#8A5A00'];

/** Payment modes we surface, in the order the design lists them. */
const MODES = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER'] as const;
const MODE_LABEL: Record<string, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank',
  CHEQUE: 'Cheque',
};

/** A live invoice with everything settlement needs. */
type LiveInvoice = {
  id: string;
  studentId: string;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
  lines: {
    id: string;
    feeKey: string;
    feeName: string;
    period: FeePeriod;
    netAmount: number;
    periods: unknown;
  }[];
  allocations: { lineId: string | null; amount: number }[];
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
  ) {}

  // --- shared loaders -----------------------------------------------------

  /** Every live invoice for the active year, with lines and money applied. */
  private liveInvoices(t: TenantContext): Promise<LiveInvoice[]> {
    return this.prisma.invoice.findMany({
      where: {
        organizationId: t.organizationId,
        academicYearId: t.academicYearId,
        status: { in: LIVE },
      },
      select: {
        id: true,
        studentId: true,
        grossAmount: true,
        discountAmount: true,
        netAmount: true,
        paidAmount: true,
        lines: {
          select: { id: true, feeKey: true, feeName: true, period: true, netAmount: true, periods: true },
        },
        // Voided payments have their allocations reversed, but guard anyway so a
        // cancelled receipt can never show up as collected money.
        allocations: { where: { payment: { isActive: true } }, select: { lineId: true, amount: true } },
      },
    }) as unknown as Promise<LiveInvoice[]>;
  }

  /**
   * Settle one invoice's money across its fee lines. `periods` is stored as
   * JSON; a line without a stored split is treated as a single period.
   */
  private settle(inv: LiveInvoice) {
    const lines: SettleLine[] = inv.lines.map((l) => ({
      id: l.id,
      net: l.netAmount,
      periods: Array.isArray(l.periods) && l.periods.length ? (l.periods as number[]) : [l.netAmount],
    }));
    return settleLines(lines, inv.allocations);
  }

  /**
   * The money received against this year's live invoices, by receipt.
   *
   * Deliberately read through allocations rather than off `Payment.amount`: a
   * receipt can settle invoices from an earlier year, or sit partly unallocated,
   * and counting its face value would make the "How they paid" bars disagree
   * with the Collected figure right next to them. Summing allocations instead
   * means the mode split always adds up to Collected exactly.
   */
  private async receipts(t: TenantContext) {
    const allocations = await this.prisma.paymentAllocation.findMany({
      where: {
        payment: { isActive: true, organizationId: t.organizationId },
        invoice: {
          organizationId: t.organizationId,
          academicYearId: t.academicYearId,
          status: { in: LIVE },
        },
      },
      select: { amount: true, paymentId: true, payment: { select: { mode: true } } },
    });

    const byMode = new Map<string, number>();
    const seen = new Set<string>();
    let total = 0;
    for (const a of allocations) {
      byMode.set(a.payment.mode, (byMode.get(a.payment.mode) ?? 0) + a.amount);
      seen.add(a.paymentId);
      total += a.amount;
    }
    return { byMode, count: seen.size, total };
  }

  /** The school's class names, in their own order. */
  async classNames(t: TenantContext): Promise<string[]> {
    const classes = await this.prisma.schoolClass.findMany({
      where: { organizationId: t.organizationId, academicYearId: t.academicYearId },
      orderBy: { rank: 'asc' },
      select: { name: true },
    });
    return classes.map((c) => c.name);
  }

  /** Period labels for a fee, anchored to the org's academic-year start. */
  private periodLabels(t: TenantContext, period: FeePeriod, count: number): string[] {
    const start = t.academicYearStart ? new Date(t.academicYearStart) : null;
    const startYear = start ? start.getUTCFullYear() : Number.parseInt(t.academicYearLabel, 10) || 2026;
    const startMonth = start ? start.getUTCMonth() : 3;
    return periodMeta({ period, periodCount: count }, startYear, startMonth).labels;
  }

  // --- Overview -----------------------------------------------------------

  /**
   * The Overview tab: the five headline figures, how parents paid, and how many
   * students have settled. Student-level rather than invoice-level, so a student
   * billed twice still counts once under "fully paid".
   */
  async overview(t: TenantContext): Promise<ReportsOverview> {
    const [invoices, receipts] = await Promise.all([this.liveInvoices(t), this.receipts(t)]);

    let invoiced = 0;
    let collected = 0;
    let concession = 0;
    // Roll invoices up per student — the design's counts are all "N students".
    const perStudent = new Map<string, { net: number; paid: number; conc: number }>();
    for (const inv of invoices) {
      invoiced += inv.netAmount;
      collected += inv.paidAmount;
      concession += inv.discountAmount;
      const row = perStudent.get(inv.studentId) ?? { net: 0, paid: 0, conc: 0 };
      row.net += inv.netAmount;
      row.paid += inv.paidAmount;
      row.conc += inv.discountAmount;
      perStudent.set(inv.studentId, row);
    }

    const students = [...perStudent.values()];
    // Show the standard modes plus any other mode that actually carries money.
    const modeKeys = [...MODES, ...[...receipts.byMode.keys()].filter((m) => !MODES.includes(m as never))];

    return {
      academicYear: t.academicYearLabel,
      invoiced,
      collected,
      pending: Math.max(0, invoiced - collected),
      concession,
      collectionRate: invoiced > 0 ? Math.round((collected / invoiced) * 100) : 0,
      liveInvoices: invoices.length,
      pendingStudents: students.filter((s) => s.net - s.paid > 0).length,
      concessionStudents: students.filter((s) => s.conc > 0).length,
      receiptCount: receipts.count,
      averageReceipt: receipts.count ? Math.round(receipts.total / receipts.count) : 0,
      fullyPaidStudents: students.filter((s) => s.net - s.paid <= 0).length,
      partPaidStudents: students.filter((s) => s.paid > 0 && s.net - s.paid > 0).length,
      unpaidStudents: students.filter((s) => s.paid <= 0).length,
      modes: modeKeys.map((key) => ({
        key,
        label: MODE_LABEL[key] ?? key,
        amount: receipts.byMode.get(key) ?? 0,
      })),
    };
  }

  // --- Fee heads ----------------------------------------------------------

  /**
   * The Fee heads tab: for every fee the school charges, how much was billed,
   * how much came in, and — for term/monthly fees — the same split per period.
   * Per-head figures come from `settleLines`, so a receipt applied to the whole
   * invoice is attributed the same way the receipt breakdown narrates it.
   */
  async feeHeads(t: TenantContext): Promise<FeeHeadsReport> {
    const [invoices, feeTypes] = await Promise.all([
      this.liveInvoices(t),
      this.prisma.feeType.findMany({
        where: { organizationId: t.organizationId },
        orderBy: { rank: 'asc' },
        select: { key: true, name: true, period: true, rank: true },
      }),
    ]);

    /**
     * A head's display name. Fee types own their name; transport lines don't —
     * each carries the *student's* route and stop ("Transport — North Route ·
     * Adyar"), so naming the head after whichever line landed first would be
     * wrong. Fall back to the fee key, title-cased.
     */
    const feeTypeName = new Map(feeTypes.map((f) => [f.key, f.name]));
    const headName = (key: string, lineName: string) =>
      feeTypeName.get(key) ??
      (key.startsWith('transport')
        ? 'Transport'
        : lineName || key.charAt(0).toUpperCase() + key.slice(1));

    type Acc = {
      key: string;
      name: string;
      period: FeePeriod;
      billed: number;
      paid: number;
      /** studentId → billed/paid for this head. */
      students: Map<string, { billed: number; paid: number }>;
      /** period index → billed/paid, plus the same per student. */
      periods: Map<number, { billed: number; paid: number; students: Map<string, { billed: number; paid: number }> }>;
    };
    const heads = new Map<string, Acc>();
    const acc = (key: string, name: string, period: FeePeriod): Acc => {
      const found = heads.get(key);
      if (found) return found;
      const fresh: Acc = { key, name, period, billed: 0, paid: 0, students: new Map(), periods: new Map() };
      heads.set(key, fresh);
      return fresh;
    };

    for (const inv of invoices) {
      const settled = this.settle(inv);
      for (let i = 0; i < inv.lines.length; i += 1) {
        const line = inv.lines[i];
        const paidRow = settled[i];
        if (!line || !paidRow) continue;
        const head = acc(line.feeKey, headName(line.feeKey, line.feeName), line.period);
        head.billed += line.netAmount;
        head.paid += paidRow.paid;

        const stu = head.students.get(inv.studentId) ?? { billed: 0, paid: 0 };
        stu.billed += line.netAmount;
        stu.paid += paidRow.paid;
        head.students.set(inv.studentId, stu);

        const slots = Array.isArray(line.periods) && line.periods.length
          ? (line.periods as number[])
          : [line.netAmount];
        for (let p = 0; p < slots.length; p += 1) {
          const billed = slots[p] ?? 0;
          const paid = paidRow.periodsPaid[p] ?? 0;
          const bucket = head.periods.get(p) ?? { billed: 0, paid: 0, students: new Map() };
          bucket.billed += billed;
          bucket.paid += paid;
          const ps = bucket.students.get(inv.studentId) ?? { billed: 0, paid: 0 };
          ps.billed += billed;
          ps.paid += paid;
          bucket.students.set(inv.studentId, ps);
          head.periods.set(p, bucket);
        }
      }
    }

    /** Split a set of student billed/paid pairs into fully / part / not paid. */
    const tally = (rows: Iterable<{ billed: number; paid: number }>) => {
      let full = 0;
      let part = 0;
      let none = 0;
      for (const r of rows) {
        if (r.billed <= 0) continue;
        if (r.paid >= r.billed) full += 1;
        else if (r.paid > 0) part += 1;
        else none += 1;
      }
      return { full, part, none };
    };

    // Keep the school's own fee order; anything unknown (e.g. transport) trails.
    const order = new Map(feeTypes.map((f, i) => [f.key, i]));
    const rows: FeeHeadRow[] = [...heads.values()]
      .sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99))
      .map((head, i) => {
        const maxLen = Math.max(1, ...[...head.periods.keys()].map((k) => k + 1));
        const labels = this.periodLabels(t, head.period, maxLen);
        const periods: FeeHeadPeriod[] = [...head.periods.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([index, bucket]) => ({
            index,
            label: labels[index] ?? `Period ${index + 1}`,
            billed: bucket.billed,
            paid: bucket.paid,
            rate: bucket.billed > 0 ? Math.round((bucket.paid / bucket.billed) * 100) : 0,
            ...tally(bucket.students.values()),
          }));
        return {
          key: head.key,
          name: head.name,
          dot: DOTS[i % DOTS.length] ?? '#2450E0',
          period: head.period,
          billed: head.billed,
          paid: head.paid,
          due: Math.max(0, head.billed - head.paid),
          rate: head.billed > 0 ? Math.round((head.paid / head.billed) * 100) : 0,
          students: head.students.size,
          ...tally(head.students.values()),
          // Only a multi-period fee earns the per-period breakdown.
          periods: periods.length > 1 ? periods : [],
        };
      });

    return { rows };
  }

  // --- Concessions --------------------------------------------------------

  /**
   * The Concessions tab. Invoice discounts don't carry the id of the rule that
   * produced them, so a rule claims the concession of students whose saved
   * concession matches it on kind + value + fee head. Anything that matches no
   * rule (a one-off discount typed on an invoice) is reported separately rather
   * than silently dropped, so the rows always add up to the total given.
   */
  async concessions(t: TenantContext): Promise<ConcessionsReport> {
    const [invoices, rules, students] = await Promise.all([
      this.liveInvoices(t),
      this.prisma.discountRule.findMany({
        where: { organizationId: t.organizationId },
        orderBy: { rank: 'asc' },
        select: { id: true, name: true, kind: true, value: true, appliesTo: true },
      }),
      this.prisma.student.findMany({
        where: { organizationId: t.organizationId, academicYearId: t.academicYearId },
        select: { id: true, discountType: true, discountValue: true, discountFeeKey: true },
      }),
    ]);

    const given = new Map<string, number>();
    let gross = 0;
    let net = 0;
    for (const inv of invoices) {
      gross += inv.grossAmount;
      net += inv.netAmount;
      if (inv.discountAmount > 0) given.set(inv.studentId, (given.get(inv.studentId) ?? 0) + inv.discountAmount);
    }
    const total = [...given.values()].reduce((n, v) => n + v, 0);

    const settings = new Map(students.map((s) => [s.id, s]));
    const claimed = new Set<string>();
    const rows: ConcessionRow[] = rules.map((rule) => {
      let amount = 0;
      let count = 0;
      for (const [studentId, value] of given) {
        const s = settings.get(studentId);
        if (!s) continue;
        if (s.discountType !== rule.kind || s.discountValue !== rule.value) continue;
        if ((s.discountFeeKey || '') !== (rule.appliesTo || '')) continue;
        amount += value;
        count += 1;
        claimed.add(studentId);
      }
      return {
        id: rule.id,
        label: rule.name,
        kind: rule.kind,
        value: rule.value,
        appliesTo: rule.appliesTo,
        amount,
        students: count,
      };
    });

    const unclaimed = [...given.entries()].filter(([id]) => !claimed.has(id));
    if (unclaimed.length > 0) {
      rows.push({
        id: 'adhoc',
        label: 'One-off concessions',
        kind: 'NONE',
        value: 0,
        appliesTo: '',
        amount: unclaimed.reduce((n, [, v]) => n + v, 0),
        students: unclaimed.length,
      });
    }

    return { rows, total, students: given.size, grossBeforeConcession: gross, netAsked: net, liveInvoices: invoices.length };
  }

  // --- Transport ----------------------------------------------------------

  /**
   * Transport collection by pickup stop — riders billed, what they were billed,
   * and what came in against the transport head specifically. Empty when the
   * school doesn't run transport.
   */
  async transport(t: TenantContext): Promise<TransportReport> {
    const [invoices, stops] = await Promise.all([
      this.liveInvoices(t),
      this.prisma.transportStop.findMany({
        where: { organizationId: t.organizationId, route: { academicYearId: t.academicYearId } },
        orderBy: [{ route: { rank: 'asc' } }, { rank: 'asc' }],
        select: { id: true, name: true, route: { select: { name: true } } },
      }),
    ]);

    const riders = await this.prisma.student.findMany({
      where: {
        organizationId: t.organizationId,
        academicYearId: t.academicYearId,
        transportStopId: { not: null },
      },
      select: { id: true, transportStopId: true },
    });
    const stopOf = new Map(riders.map((r) => [r.id, r.transportStopId as string]));

    const acc = new Map<string, { riders: Set<string>; billed: number; collected: number }>();
    for (const inv of invoices) {
      const stopId = stopOf.get(inv.studentId);
      if (!stopId) continue;
      const settled = this.settle(inv);
      for (let i = 0; i < inv.lines.length; i += 1) {
        const line = inv.lines[i];
        const paid = settled[i];
        if (!line || !paid || !line.feeKey.startsWith('transport')) continue;
        const row = acc.get(stopId) ?? { riders: new Set<string>(), billed: 0, collected: 0 };
        row.riders.add(inv.studentId);
        row.billed += line.netAmount;
        row.collected += paid.paid;
        acc.set(stopId, row);
      }
    }

    const rows = stops
      .filter((s) => acc.has(s.id))
      .map((s) => {
        const row = acc.get(s.id)!;
        return {
          id: s.id,
          name: s.name,
          route: s.route.name,
          riders: row.riders.size,
          billed: row.billed,
          collected: row.collected,
        };
      });

    return {
      rows,
      billedRiders: rows.reduce((n, r) => n + r.riders, 0),
      assignedRiders: riders.length,
      quietStops: stops.length - rows.length,
    };
  }
}

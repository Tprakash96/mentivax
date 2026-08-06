import { Injectable } from '@nestjs/common';
import type { AskDataset, AskFilter, AskPlan } from '@mentivax/core';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';
import { ReportsService } from './reports.service';

/** A resolved answer table: what the plan asked for, actually fetched. */
export interface AskResult {
  columns: { key: string; label: string; money: boolean }[];
  rows: Record<string, string | number>[];
  /** Aggregate over the whole filtered set, regardless of row limit. */
  totals: Record<string, number>;
  /** How many records matched before the row limit. */
  matched: number;
  truncated: boolean;
}

/** Invoice statuses that represent real, billable money. */
const LIVE = ['PENDING', 'PARTIAL', 'PAID'] as const;

/** Index a filter list by field for the compilers below. */
type Filters = Map<string, AskFilter[]>;
const index = (filters: AskFilter[]): Filters => {
  const m: Filters = new Map();
  for (const f of filters) m.set(f.field, [...(m.get(f.field) ?? []), f]);
  return m;
};

const asNumber = (v: string | number | boolean): number =>
  typeof v === 'number' ? v : Number.parseInt(String(v), 10) || 0;
const asBool = (v: string | number | boolean): boolean => v === true || v === 'true' || v === 1;
const asDate = (v: string | number | boolean): Date | null => {
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Turns a *validated* Ask plan into real queries.
 *
 * Two invariants hold for every dataset here:
 *  1. `organizationId` (and `academicYearId` where the model is year-scoped) is
 *     written by this service, never taken from the plan. A plan cannot widen
 *     its own scope because scope isn't one of the things a plan can express.
 *  2. Filter values only ever reach Prisma as bound values in a typed `where` —
 *     never concatenated into SQL. Combined with catalog validation upstream,
 *     that leaves no path from model output to a query fragment.
 *
 * Money filters (`due`, `collected`) can't be pushed into SQL because they are
 * derived from per-invoice rollups, so those are applied in memory after the
 * scoped fetch. The scoped fetch is what bounds the work.
 */
@Injectable()
export class AskQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
  ) {}

  run(t: TenantContext, dataset: AskDataset, plan: AskPlan): Promise<AskResult> {
    switch (dataset.key) {
      case 'students':
        return this.students(t, dataset, plan);
      case 'invoices':
        return this.invoices(t, dataset, plan);
      case 'payments':
        return this.payments(t, dataset, plan);
      case 'feeHeads':
        return this.feeHeads(t, dataset, plan);
      default:
        // Unreachable: the catalog validated the dataset key upstream.
        return Promise.resolve({ columns: [], rows: [], totals: {}, matched: 0, truncated: false });
    }
  }

  // --- shared shaping ------------------------------------------------------

  /** Apply money/number comparisons the database couldn't do for us. */
  private applyNumericFilters<T extends Record<string, unknown>>(
    rows: T[],
    filters: AskFilter[],
    keys: string[],
  ): T[] {
    const numeric = filters.filter((f) => keys.includes(f.field));
    if (!numeric.length) return rows;
    return rows.filter((row) =>
      numeric.every((f) => {
        const actual = Number(row[f.field] ?? 0);
        const want = asNumber(f.value);
        switch (f.op) {
          case 'gt':
            return actual > want;
          case 'gte':
            return actual >= want;
          case 'lt':
            return actual < want;
          case 'lte':
            return actual <= want;
          case 'is':
            return actual === want;
          case 'not':
            return actual !== want;
          default:
            return true;
        }
      }),
    );
  }

  /** Sort, cut to the limit, and total the full set — in that order. */
  private shape(
    dataset: AskDataset,
    plan: AskPlan,
    rows: Record<string, string | number>[],
    groupColumns?: { key: string; label: string; money: boolean }[],
  ): AskResult {
    const columns = groupColumns ?? dataset.columns;
    const sortBy = plan.sort?.by ?? dataset.defaultSort;
    const dir = plan.sort?.dir ?? 'desc';
    const sorted = [...rows].sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (typeof av === 'number' && typeof bv === 'number') return dir === 'asc' ? av - bv : bv - av;
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''));
      return dir === 'asc' ? cmp : -cmp;
    });

    // Total every numeric measure over the whole matched set, not just the page.
    const totals: Record<string, number> = {};
    for (const m of dataset.measures) {
      if (m.key === 'students' || m.key === 'invoices' || m.key === 'receipts') continue;
      totals[m.key] = rows.reduce((n, r) => n + (typeof r[m.key] === 'number' ? (r[m.key] as number) : 0), 0);
    }

    return {
      columns,
      rows: sorted.slice(0, plan.limit),
      totals,
      matched: rows.length,
      truncated: rows.length > plan.limit,
    };
  }

  // --- students ------------------------------------------------------------

  private async students(t: TenantContext, dataset: AskDataset, plan: AskPlan): Promise<AskResult> {
    const f = index(plan.filters);
    const className = f.get('class')?.[0];
    const name = f.get('name')?.[0];
    const enrollment = f.get('enrollment') ?? [];

    const students = await this.prisma.student.findMany({
      where: {
        // Scope is ours, not the plan's.
        organizationId: t.organizationId,
        academicYearId: t.academicYearId,
        ...(className
          ? {
              schoolClass:
                className.op === 'is'
                  ? { name: { equals: String(className.value), mode: 'insensitive' as const } }
                  : { name: { contains: String(className.value), mode: 'insensitive' as const } },
            }
          : {}),
        ...(name ? { name: { contains: String(name.value), mode: 'insensitive' as const } } : {}),
        ...(enrollment.length
          ? {
              enrollmentStatus: enrollment.reduce<Record<string, unknown>>((acc, e) => {
                if (e.op === 'is') acc.equals = e.value;
                if (e.op === 'not') acc.not = e.value;
                return acc;
              }, {}),
            }
          : {}),
        ...(f.has('feeExempt') ? { feeExempt: asBool(f.get('feeExempt')![0]!.value) } : {}),
        ...(f.has('ridesTransport')
          ? asBool(f.get('ridesTransport')![0]!.value)
            ? { transportStopId: { not: null } }
            : { transportStopId: null }
          : {}),
        ...(f.has('hasConcession')
          ? asBool(f.get('hasConcession')![0]!.value)
            ? { discountType: { not: 'NONE' } }
            : { discountType: 'NONE' }
          : {}),
        ...(f.has('newAdmission') ? { isNewAdmission: asBool(f.get('newAdmission')![0]!.value) } : {}),
      },
      select: {
        id: true,
        name: true,
        admissionNo: true,
        schoolClass: { select: { name: true, rank: true } },
        enrollmentStatus: true,
        transportStop: { select: { name: true } },
        invoices: {
          where: { academicYearId: t.academicYearId, status: { in: [...LIVE] } },
          select: { netAmount: true, paidAmount: true },
        },
      },
      orderBy: [{ schoolClass: { rank: 'asc' } }, { name: 'asc' }],
    });

    let rows = students.map((s) => {
      const billed = s.invoices.reduce((n, i) => n + i.netAmount, 0);
      const collected = s.invoices.reduce((n, i) => n + i.paidAmount, 0);
      return {
        name: s.name,
        class: s.schoolClass.name,
        admissionNo: s.admissionNo,
        enrollment: s.enrollmentStatus,
        transportStop: s.transportStop?.name ?? '—',
        students: 1,
        billed,
        collected,
        due: Math.max(0, billed - collected),
      };
    });
    rows = this.applyNumericFilters(rows, plan.filters, ['due', 'collected', 'billed']);

    if (plan.mode === 'summary' && plan.groupBy) return this.group(dataset, plan, rows, plan.groupBy);
    if (plan.mode === 'summary') return this.group(dataset, plan, rows, null);
    return this.shape(dataset, plan, rows);
  }

  // --- invoices ------------------------------------------------------------

  private async invoices(t: TenantContext, dataset: AskDataset, plan: AskPlan): Promise<AskResult> {
    const f = index(plan.filters);
    const className = f.get('class')?.[0];
    const student = f.get('student')?.[0];
    const number = f.get('number')?.[0];
    const status = f.get('status') ?? [];
    const dueDate = f.get('dueDate') ?? [];

    const dueFilter: Record<string, Date> = {};
    for (const d of dueDate) {
      const parsed = asDate(d.value);
      if (!parsed) continue;
      if (d.op === 'before') dueFilter.lt = parsed;
      if (d.op === 'after') dueFilter.gt = parsed;
    }

    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId: t.organizationId,
        academicYearId: t.academicYearId,
        // Absent an explicit status filter, drafts and cancelled invoices stay
        // out — the same "live" rule the rest of the reporting uses.
        ...(status.length
          ? {
              status: status.reduce<Record<string, unknown>>((acc, s) => {
                if (s.op === 'is') acc.equals = s.value;
                if (s.op === 'not') acc.not = s.value;
                return acc;
              }, {}),
            }
          : { status: { in: [...LIVE] } }),
        ...(Object.keys(dueFilter).length ? { dueDate: dueFilter } : {}),
        ...(number ? { number: { contains: String(number.value), mode: 'insensitive' as const } } : {}),
        ...(student || className
          ? {
              student: {
                ...(student ? { name: { contains: String(student.value), mode: 'insensitive' as const } } : {}),
                ...(className
                  ? {
                      schoolClass:
                        className.op === 'is'
                          ? { name: { equals: String(className.value), mode: 'insensitive' as const } }
                          : { name: { contains: String(className.value), mode: 'insensitive' as const } },
                    }
                  : {}),
              },
            }
          : {}),
      },
      select: {
        number: true,
        status: true,
        issueDate: true,
        grossAmount: true,
        discountAmount: true,
        netAmount: true,
        paidAmount: true,
        student: { select: { name: true, schoolClass: { select: { name: true, rank: true } } } },
      },
      orderBy: { issueDate: 'desc' },
    });

    let rows = invoices.map((i) => ({
      number: i.number,
      student: i.student.name,
      class: i.student.schoolClass.name,
      status: i.status,
      month: i.issueDate.toISOString().slice(0, 7),
      invoices: 1,
      gross: i.grossAmount,
      concession: i.discountAmount,
      billed: i.netAmount,
      collected: i.paidAmount,
      due: Math.max(0, i.netAmount - i.paidAmount),
    }));
    rows = this.applyNumericFilters(rows, plan.filters, ['due', 'billed', 'collected', 'gross']);

    if (plan.mode === 'summary') return this.group(dataset, plan, rows, plan.groupBy ?? null);
    return this.shape(dataset, plan, rows);
  }

  // --- payments ------------------------------------------------------------

  private async payments(t: TenantContext, dataset: AskDataset, plan: AskPlan): Promise<AskResult> {
    const f = index(plan.filters);
    const student = f.get('student')?.[0];
    const mode = f.get('mode') ?? [];
    const paidAt = f.get('paidAt') ?? [];

    const when: Record<string, Date> = {};
    for (const d of paidAt) {
      const parsed = asDate(d.value);
      if (!parsed) continue;
      if (d.op === 'before') when.lt = parsed;
      if (d.op === 'after') when.gt = parsed;
    }

    const payments = await this.prisma.payment.findMany({
      where: {
        organizationId: t.organizationId,
        isActive: true,
        ...(mode.length
          ? {
              mode: mode.reduce<Record<string, unknown>>((acc, m) => {
                if (m.op === 'is') acc.equals = m.value;
                if (m.op === 'not') acc.not = m.value;
                return acc;
              }, {}),
            }
          : {}),
        ...(Object.keys(when).length ? { paidAt: when } : {}),
        ...(student
          ? { student: { name: { contains: String(student.value), mode: 'insensitive' as const } } }
          : {}),
      },
      select: {
        receiptNo: true,
        paidAt: true,
        amount: true,
        mode: true,
        student: { select: { name: true, schoolClass: { select: { name: true } } } },
      },
      orderBy: { paidAt: 'desc' },
    });

    let rows = payments.map((p) => ({
      receiptNo: p.receiptNo,
      student: p.student.name,
      class: p.student.schoolClass.name,
      paidAt: p.paidAt.toISOString().slice(0, 10),
      month: p.paidAt.toISOString().slice(0, 7),
      mode: p.mode,
      receipts: 1,
      amount: p.amount,
    }));
    rows = this.applyNumericFilters(rows, plan.filters, ['amount']);

    if (plan.mode === 'summary') return this.group(dataset, plan, rows, plan.groupBy ?? null);
    return this.shape(dataset, plan, rows);
  }

  // --- fee heads -----------------------------------------------------------

  private async feeHeads(t: TenantContext, dataset: AskDataset, plan: AskPlan): Promise<AskResult> {
    const report = await this.reports.feeHeads(t);
    const rows = report.rows.map((r) => ({
      name: r.name,
      billed: r.billed,
      collected: r.paid,
      due: r.due,
      rate: r.rate,
      students: r.students,
    }));
    return this.shape(dataset, plan, rows);
  }

  // --- grouping ------------------------------------------------------------

  /**
   * Collapse rows to one per group (or a single total row when `by` is null),
   * summing the dataset's measures and counting records.
   */
  private group(
    dataset: AskDataset,
    plan: AskPlan,
    rows: Record<string, string | number>[],
    by: string | null,
  ): AskResult {
    const countKey = dataset.measures.find((m) => !m.money)?.key ?? 'count';
    const moneyKeys = dataset.measures.filter((m) => m.money).map((m) => m.key);

    const buckets = new Map<string, Record<string, string | number>>();
    for (const row of rows) {
      const key = by ? String(row[by] ?? '—') : 'All';
      const bucket = buckets.get(key) ?? { group: key, [countKey]: 0 };
      bucket[countKey] = Number(bucket[countKey] ?? 0) + 1;
      for (const m of moneyKeys) bucket[m] = Number(bucket[m] ?? 0) + Number(row[m] ?? 0);
      buckets.set(key, bucket);
    }

    const groupLabel = by
      ? (dataset.groupBy.find((g) => g.key === by)?.label ?? by)
      : dataset.label;
    const columns = [
      { key: 'group', label: groupLabel, money: false },
      { key: countKey, label: dataset.measures.find((m) => m.key === countKey)?.label ?? 'Count', money: false },
      ...dataset.measures.filter((m) => m.money),
    ];

    const grouped = [...buckets.values()];
    const totals: Record<string, number> = {};
    for (const m of moneyKeys) totals[m] = grouped.reduce((n, g) => n + Number(g[m] ?? 0), 0);
    totals[countKey] = rows.length;

    const sortBy = plan.sort?.by && columns.some((c) => c.key === plan.sort?.by) ? plan.sort.by : moneyKeys[0] ?? 'group';
    const dir = plan.sort?.dir ?? 'desc';
    const sorted = grouped.sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (typeof av === 'number' && typeof bv === 'number') return dir === 'asc' ? av - bv : bv - av;
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''));
      return dir === 'asc' ? cmp : -cmp;
    });

    return {
      columns,
      rows: sorted.slice(0, plan.limit),
      totals,
      matched: rows.length,
      truncated: sorted.length > plan.limit,
    };
  }
}

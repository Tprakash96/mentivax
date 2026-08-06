import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { LedgerKind, LedgerStatus, Prisma } from '@mentivax/db';
import type {
  CreateAccountDto,
  CreateCategoryDto,
  CreateLedgerEntryDto,
  CreateVendorDto,
  ExpenseSettingsDto,
  UpdateAccountDto,
  UpdateCategoryDto,
  UpdateLedgerEntryDto,
  UpdateVendorDto,
} from '@mentivax/core';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';

/** Default books + categories a school starts with (lazily provisioned). */
const DEFAULT_ACCOUNTS = [
  { label: 'Contingent', note: 'Day-to-day school running', rank: 0 },
  { label: 'Internal account', note: 'Internal collections', rank: 1 },
  { label: 'Building fund', note: 'Capital works', rank: 2 },
];
const DEFAULT_CATEGORIES: { label: string; kind: LedgerKind; color: string }[] = [
  { label: 'Salaries', kind: 'EXPENSE', color: '#2450E0' },
  { label: 'Transport', kind: 'EXPENSE', color: '#E8792B' },
  { label: 'Maintenance', kind: 'EXPENSE', color: '#12A87A' },
  { label: 'Utilities', kind: 'EXPENSE', color: '#6D28D9' },
  { label: 'Stationery', kind: 'EXPENSE', color: '#B3261E' },
  { label: 'Fee collection', kind: 'INCOME', color: '#0B7A5A' },
  { label: 'Donation', kind: 'INCOME', color: '#8A5A00' },
];

interface EntryRow {
  id: string;
  kind: LedgerKind;
  accountId: string;
  categoryId: string | null;
  voucherNo: string;
  date: Date;
  title: string;
  person: string;
  amount: number;
  mode: string;
  note: string;
  status: LedgerStatus;
  signed: boolean;
  account: { label: string };
  category: { label: string } | null;
}

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  private org(t: TenantContext) {
    return { organizationId: t.organizationId };
  }

  // --- Settings ------------------------------------------------------------

  async getSettings(t: TenantContext): Promise<ExpenseSettingsDto> {
    const s = await this.prisma.expenseSetting.findUnique({
      where: { organizationId: t.organizationId },
    });
    return {
      approvalsOn: s?.approvalsOn ?? true,
      categoriesOn: s?.categoriesOn ?? true,
      approvalLimit: s?.approvalLimit ?? 2_000_000,
    };
  }

  async saveSettings(t: TenantContext, dto: ExpenseSettingsDto): Promise<ExpenseSettingsDto> {
    await this.prisma.expenseSetting.upsert({
      where: { organizationId: t.organizationId },
      create: { organizationId: t.organizationId, ...dto },
      update: dto,
    });
    // Turning approvals off posts everything currently awaiting sign-off.
    if (!dto.approvalsOn) {
      await this.prisma.ledgerEntry.updateMany({
        where: { organizationId: t.organizationId, status: 'PENDING' },
        data: { status: 'POSTED', signed: true },
      });
    }
    return this.getSettings(t);
  }

  // --- Provisioning --------------------------------------------------------

  /** Ensure the org has at least the default books + categories. */
  private async ensureSeed(t: TenantContext) {
    const count = await this.prisma.expenseAccount.count({ where: this.org(t) });
    if (count > 0) return;
    await this.prisma.$transaction([
      this.prisma.expenseAccount.createMany({
        data: DEFAULT_ACCOUNTS.map((a) => ({ ...a, organizationId: t.organizationId })),
      }),
      this.prisma.expenseCategory.createMany({
        data: DEFAULT_CATEGORIES.map((c, i) => ({
          ...c,
          rank: i,
          organizationId: t.organizationId,
        })),
      }),
    ]);
  }

  // --- Entries -------------------------------------------------------------

  private entryDto(e: EntryRow) {
    return {
      id: e.id,
      kind: e.kind,
      accountId: e.accountId,
      accountLabel: e.account.label,
      categoryId: e.categoryId,
      categoryLabel: e.category?.label ?? null,
      voucherNo: e.voucherNo,
      date: e.date.toISOString().slice(0, 10),
      title: e.title,
      person: e.person,
      amount: e.amount,
      mode: e.mode as EntryRow['mode'],
      note: e.note,
      status: e.status,
      signed: e.signed,
    };
  }

  private async nextVoucherNo(t: TenantContext, kind: LedgerKind): Promise<string> {
    const prefix = kind === 'INCOME' ? 'RV' : 'PV';
    // Year tag from the active academic-year label, e.g. "2026-27" → "2627".
    const yearTag = (t.academicYearLabel || '').replace(/\D/g, '').slice(0, 4) || '0000';
    const count = await this.prisma.ledgerEntry.count({
      where: { organizationId: t.organizationId, kind },
    });
    return `${prefix}-${yearTag}-${String(count + 101).padStart(3, '0')}`;
  }

  async listEntries(
    t: TenantContext,
    f: {
      kind?: string;
      accountId?: string;
      categoryId?: string;
      status?: string;
      from?: string;
      to?: string;
      search?: string;
    },
  ) {
    await this.ensureSeed(t);
    const where: Prisma.LedgerEntryWhereInput = {
      organizationId: t.organizationId,
      academicYearId: t.academicYearId,
      isActive: true,
    };
    if (f.kind === 'INCOME' || f.kind === 'EXPENSE') where.kind = f.kind;
    if (f.status === 'POSTED' || f.status === 'PENDING') where.status = f.status;
    if (f.accountId) where.accountId = f.accountId;
    if (f.categoryId) where.categoryId = f.categoryId;
    if (f.from || f.to) {
      where.date = {};
      if (f.from) where.date.gte = new Date(f.from);
      if (f.to) where.date.lte = new Date(`${f.to}T23:59:59`);
    }
    if (f.search) {
      where.OR = [
        { title: { contains: f.search, mode: 'insensitive' } },
        { person: { contains: f.search, mode: 'insensitive' } },
        { note: { contains: f.search, mode: 'insensitive' } },
        { voucherNo: { contains: f.search, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.ledgerEntry.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { account: { select: { label: true } }, category: { select: { label: true } } },
    });
    return rows.map((e) => this.entryDto(e as EntryRow));
  }

  async createEntry(t: TenantContext, dto: CreateLedgerEntryDto) {
    await this.ensureSeed(t);
    const account = await this.prisma.expenseAccount.findFirst({
      where: { id: dto.accountId, ...this.org(t) },
    });
    if (!account) throw new BadRequestException('Unknown account');

    const settings = await this.getSettings(t);
    const categoryId = settings.categoriesOn ? (dto.categoryId ?? null) : null;
    if (categoryId) {
      const cat = await this.prisma.expenseCategory.findFirst({
        where: { id: categoryId, ...this.org(t) },
      });
      if (!cat) throw new BadRequestException('Unknown category');
    }

    // Over-limit expenses wait for sign-off; income and small expenses post now.
    const needsApproval =
      settings.approvalsOn && dto.kind === 'EXPENSE' && dto.amount > settings.approvalLimit;
    const voucherNo = await this.nextVoucherNo(t, dto.kind);

    const created = await this.prisma.ledgerEntry.create({
      data: {
        organizationId: t.organizationId,
        academicYearId: t.academicYearId,
        accountId: dto.accountId,
        categoryId,
        kind: dto.kind,
        voucherNo,
        date: dto.date ? new Date(dto.date) : new Date(),
        title: dto.title,
        person: dto.person?.trim() || '',
        amount: dto.amount,
        mode: dto.mode ?? 'CASH',
        note: dto.note?.trim() || '',
        status: needsApproval ? 'PENDING' : 'POSTED',
      },
      include: { account: { select: { label: true } }, category: { select: { label: true } } },
    });
    return this.entryDto(created as EntryRow);
  }

  async updateEntry(t: TenantContext, id: string, dto: UpdateLedgerEntryDto) {
    const existing = await this.prisma.ledgerEntry.findFirst({ where: { id, ...this.org(t) } });
    if (!existing) throw new NotFoundException('Entry not found');
    const updated = await this.prisma.ledgerEntry.update({
      where: { id },
      data: {
        accountId: dto.accountId ?? undefined,
        categoryId: dto.categoryId === undefined ? undefined : dto.categoryId,
        title: dto.title ?? undefined,
        person: dto.person === undefined ? undefined : dto.person.trim(),
        amount: dto.amount ?? undefined,
        mode: dto.mode ?? undefined,
        date: dto.date ? new Date(dto.date) : undefined,
        note: dto.note === undefined ? undefined : dto.note.trim(),
      },
      include: { account: { select: { label: true } }, category: { select: { label: true } } },
    });
    return this.entryDto(updated as EntryRow);
  }

  async removeEntry(t: TenantContext, id: string) {
    const existing = await this.prisma.ledgerEntry.findFirst({ where: { id, ...this.org(t) } });
    if (!existing) throw new NotFoundException('Entry not found');
    // Soft delete: keep the row (preserves history + the voucher number) but
    // drop it from every list and balance by flipping isActive off.
    await this.prisma.ledgerEntry.update({ where: { id }, data: { isActive: false } });
  }

  async approveEntry(t: TenantContext, id: string) {
    const existing = await this.prisma.ledgerEntry.findFirst({ where: { id, ...this.org(t) } });
    if (!existing) throw new NotFoundException('Entry not found');
    if (existing.status !== 'PENDING') throw new BadRequestException('Entry is not awaiting approval');
    const updated = await this.prisma.ledgerEntry.update({
      where: { id },
      data: { status: 'POSTED', signed: true },
      include: { account: { select: { label: true } }, category: { select: { label: true } } },
    });
    return this.entryDto(updated as EntryRow);
  }

  async rejectEntry(t: TenantContext, id: string) {
    const existing = await this.prisma.ledgerEntry.findFirst({ where: { id, ...this.org(t) } });
    if (!existing) throw new NotFoundException('Entry not found');
    if (existing.status !== 'PENDING') throw new BadRequestException('Entry is not awaiting approval');
    await this.prisma.ledgerEntry.delete({ where: { id } });
  }

  // --- Overview / balances -------------------------------------------------

  private signed(e: { kind: LedgerKind; amount: number }) {
    return e.kind === 'INCOME' ? e.amount : -e.amount;
  }

  async overview(t: TenantContext, range: { from?: string; to?: string }) {
    await this.ensureSeed(t);
    const [accounts, settings, entries] = await Promise.all([
      this.prisma.expenseAccount.findMany({ where: this.org(t), orderBy: { rank: 'asc' } }),
      this.getSettings(t),
      this.prisma.ledgerEntry.findMany({
        where: { organizationId: t.organizationId, academicYearId: t.academicYearId, isActive: true },
        select: { accountId: true, kind: true, amount: true, status: true, date: true },
      }),
    ]);
    const from = range.from ? new Date(range.from) : null;
    const to = range.to ? new Date(`${range.to}T23:59:59`) : null;
    const inRange = (d: Date) => (!from || d >= from) && (!to || d <= to);

    const accountDtos = accounts.map((a) => {
      const mine = entries.filter((e) => e.accountId === a.id);
      const before = mine
        .filter((e) => e.status === 'POSTED' && from && e.date < from)
        .reduce((s, e) => s + this.signed(e), 0);
      const opening = a.openingBalance + before;
      const posted = mine.filter((e) => e.status === 'POSTED' && inRange(e.date));
      const movement = posted.reduce((s, e) => s + this.signed(e), 0);
      const awaiting = mine
        .filter((e) => e.status === 'PENDING' && e.kind === 'EXPENSE' && inRange(e.date))
        .reduce((s, e) => s + e.amount, 0);
      return {
        id: a.id,
        label: a.label,
        note: a.note,
        openingBalance: a.openingBalance,
        rank: a.rank,
        closing: opening + movement,
        awaiting,
      };
    });

    const posted = entries.filter((e) => e.status === 'POSTED' && inRange(e.date));
    const income = posted.filter((e) => e.kind === 'INCOME').reduce((s, e) => s + e.amount, 0);
    const expense = posted.filter((e) => e.kind === 'EXPENSE').reduce((s, e) => s + e.amount, 0);
    const awaiting = entries
      .filter((e) => e.status === 'PENDING' && inRange(e.date))
      .reduce((s, e) => s + e.amount, 0);

    return {
      accounts: accountDtos,
      settings,
      income,
      expense,
      awaiting,
      closing: accountDtos.reduce((s, a) => s + a.closing, 0),
    };
  }

  // --- Statement -----------------------------------------------------------

  async statement(t: TenantContext, f: { accountId?: string; from?: string; to?: string }) {
    const all = await this.prisma.ledgerEntry.findMany({
      where: {
        organizationId: t.organizationId,
        academicYearId: t.academicYearId,
        status: 'POSTED',
        isActive: true,
        ...(f.accountId ? { accountId: f.accountId } : {}),
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, kind: true, amount: true, date: true, voucherNo: true, title: true, person: true, accountId: true },
    });

    const accounts = await this.prisma.expenseAccount.findMany({
      where: f.accountId ? { id: f.accountId, ...this.org(t) } : this.org(t),
      select: { openingBalance: true },
    });
    const baseOpening = accounts.reduce((s, a) => s + a.openingBalance, 0);

    const from = f.from ? new Date(f.from) : null;
    const to = f.to ? new Date(`${f.to}T23:59:59`) : null;

    const before = from ? all.filter((e) => e.date < from) : [];
    const opening = baseOpening + before.reduce((s, e) => s + this.signed(e), 0);

    const rowsIn = all.filter((e) => (!from || e.date >= from) && (!to || e.date <= to));
    let bal = opening;
    const rows = rowsIn.map((e) => {
      const credit = e.kind === 'INCOME' ? e.amount : 0;
      const debit = e.kind === 'EXPENSE' ? e.amount : 0;
      bal += credit - debit;
      return {
        id: e.id,
        date: e.date.toISOString().slice(0, 10),
        voucherNo: e.voucherNo,
        title: e.title,
        person: e.person,
        credit,
        debit,
        balance: bal,
      };
    });
    return { opening, closing: bal, rows };
  }

  // --- Reports -------------------------------------------------------------

  async report(t: TenantContext) {
    const [entries, categories] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where: { organizationId: t.organizationId, academicYearId: t.academicYearId, isActive: true },
        include: { category: { select: { label: true, color: true, kind: true, budget: true } } },
      }),
      this.prisma.expenseCategory.findMany({ where: this.org(t), orderBy: { rank: 'asc' } }),
    ]);
    const posted = entries.filter((e) => e.status === 'POSTED');
    const spent = posted.filter((e) => e.kind === 'EXPENSE').reduce((s, e) => s + e.amount, 0);
    const income = posted.filter((e) => e.kind === 'INCOME').reduce((s, e) => s + e.amount, 0);
    const awaiting = entries
      .filter((e) => e.status === 'PENDING')
      .reduce((s, e) => s + e.amount, 0);

    const byCategory = categories.map((c) => {
      const amount = posted
        .filter((e) => e.categoryId === c.id)
        .reduce((s, e) => s + e.amount, 0);
      return { label: c.label, color: c.color, kind: c.kind, amount, budget: c.budget };
    });
    const overBudget = byCategory.filter((c) => c.kind === 'EXPENSE' && c.budget > 0 && c.amount > c.budget).length;

    const payeeMap = new Map<string, number>();
    for (const e of posted.filter((e) => e.kind === 'EXPENSE' && e.person)) {
      payeeMap.set(e.person, (payeeMap.get(e.person) ?? 0) + e.amount);
    }
    const byPayee = [...payeeMap.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

    const monthMap = new Map<string, { income: number; expense: number }>();
    for (const e of posted) {
      const key = e.date.toISOString().slice(0, 7); // YYYY-MM
      const m = monthMap.get(key) ?? { income: 0, expense: 0 };
      if (e.kind === 'INCOME') m.income += e.amount;
      else m.expense += e.amount;
      monthMap.set(key, m);
    }
    const byMonth = [...monthMap.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6)
      .map(([month, v]) => ({ month, ...v }));

    return { spent, income, net: income - spent, awaiting, overBudget, byCategory, byPayee, byMonth };
  }

  // --- Accounts ------------------------------------------------------------

  async listAccounts(t: TenantContext) {
    const ov = await this.overview(t, {});
    return ov.accounts;
  }

  async createAccount(t: TenantContext, dto: CreateAccountDto) {
    const max = await this.prisma.expenseAccount.aggregate({
      where: this.org(t),
      _max: { rank: true },
    });
    const created = await this.prisma.expenseAccount.create({
      data: {
        organizationId: t.organizationId,
        label: dto.label,
        note: dto.note ?? '',
        openingBalance: dto.openingBalance ?? 0,
        rank: (max._max.rank ?? -1) + 1,
      },
    });
    return {
      id: created.id,
      label: created.label,
      note: created.note,
      openingBalance: created.openingBalance,
      rank: created.rank,
      closing: created.openingBalance,
      awaiting: 0,
    };
  }

  async updateAccount(t: TenantContext, id: string, dto: UpdateAccountDto) {
    const existing = await this.prisma.expenseAccount.findFirst({ where: { id, ...this.org(t) } });
    if (!existing) throw new NotFoundException('Account not found');
    await this.prisma.expenseAccount.update({
      where: { id },
      data: {
        label: dto.label ?? undefined,
        note: dto.note === undefined ? undefined : dto.note,
        openingBalance: dto.openingBalance ?? undefined,
      },
    });
    return this.listAccounts(t).then((rows) => rows.find((r) => r.id === id)!);
  }

  async removeAccount(t: TenantContext, id: string) {
    const existing = await this.prisma.expenseAccount.findFirst({ where: { id, ...this.org(t) } });
    if (!existing) throw new NotFoundException('Account not found');
    const used = await this.prisma.ledgerEntry.count({ where: { accountId: id } });
    if (used > 0) throw new BadRequestException('This book has entries and cannot be deleted');
    await this.prisma.expenseAccount.delete({ where: { id } });
  }

  // --- Categories ----------------------------------------------------------

  async listCategories(t: TenantContext) {
    await this.ensureSeed(t);
    const [cats, entries] = await Promise.all([
      this.prisma.expenseCategory.findMany({ where: this.org(t), orderBy: { rank: 'asc' } }),
      this.prisma.ledgerEntry.findMany({
        where: { organizationId: t.organizationId, academicYearId: t.academicYearId, status: 'POSTED', isActive: true },
        select: { categoryId: true, amount: true },
      }),
    ]);
    return cats.map((c) => ({
      id: c.id,
      label: c.label,
      kind: c.kind,
      budget: c.budget,
      color: c.color,
      rank: c.rank,
      used: entries.filter((e) => e.categoryId === c.id).reduce((s, e) => s + e.amount, 0),
    }));
  }

  async createCategory(t: TenantContext, dto: CreateCategoryDto) {
    const max = await this.prisma.expenseCategory.aggregate({
      where: this.org(t),
      _max: { rank: true },
    });
    const created = await this.prisma.expenseCategory.create({
      data: {
        organizationId: t.organizationId,
        label: dto.label,
        kind: dto.kind ?? 'EXPENSE',
        budget: dto.kind === 'INCOME' ? 0 : (dto.budget ?? 0),
        color: dto.color ?? '#7C889F',
        rank: (max._max.rank ?? -1) + 1,
      },
    });
    return { ...created, used: 0 };
  }

  async updateCategory(t: TenantContext, id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.expenseCategory.findFirst({ where: { id, ...this.org(t) } });
    if (!existing) throw new NotFoundException('Category not found');
    const kind = dto.kind ?? existing.kind;
    await this.prisma.expenseCategory.update({
      where: { id },
      data: {
        label: dto.label ?? undefined,
        kind: dto.kind ?? undefined,
        budget: kind === 'INCOME' ? 0 : (dto.budget ?? undefined),
        color: dto.color ?? undefined,
      },
    });
    return this.listCategories(t).then((rows) => rows.find((r) => r.id === id)!);
  }

  async removeCategory(t: TenantContext, id: string) {
    const existing = await this.prisma.expenseCategory.findFirst({ where: { id, ...this.org(t) } });
    if (!existing) throw new NotFoundException('Category not found');
    await this.prisma.expenseCategory.delete({ where: { id } });
  }

  // --- Vendors -------------------------------------------------------------

  async listVendors(t: TenantContext) {
    const [vendors, entries] = await Promise.all([
      this.prisma.vendor.findMany({ where: this.org(t), orderBy: { name: 'asc' } }),
      this.prisma.ledgerEntry.findMany({
        where: { organizationId: t.organizationId, academicYearId: t.academicYearId, kind: 'EXPENSE', isActive: true },
        select: { person: true, amount: true, status: true },
      }),
    ]);
    return vendors.map((v) => {
      const mine = entries.filter((e) => e.person === v.name);
      const posted = mine.filter((e) => e.status === 'POSTED');
      return {
        id: v.id,
        name: v.name,
        supplies: v.supplies,
        phone: v.phone,
        bills: posted.length,
        paid: posted.reduce((s, e) => s + e.amount, 0),
        due: mine.filter((e) => e.status === 'PENDING').reduce((s, e) => s + e.amount, 0),
      };
    });
  }

  async createVendor(t: TenantContext, dto: CreateVendorDto) {
    const created = await this.prisma.vendor.create({
      data: {
        organizationId: t.organizationId,
        name: dto.name,
        supplies: dto.supplies ?? '',
        phone: dto.phone ?? '',
      },
    });
    return { id: created.id, name: created.name, supplies: created.supplies, phone: created.phone, bills: 0, paid: 0, due: 0 };
  }

  async updateVendor(t: TenantContext, id: string, dto: UpdateVendorDto) {
    const existing = await this.prisma.vendor.findFirst({ where: { id, ...this.org(t) } });
    if (!existing) throw new NotFoundException('Vendor not found');
    await this.prisma.vendor.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        supplies: dto.supplies === undefined ? undefined : dto.supplies,
        phone: dto.phone === undefined ? undefined : dto.phone,
      },
    });
    return this.listVendors(t).then((rows) => rows.find((r) => r.id === id)!);
  }

  async removeVendor(t: TenantContext, id: string) {
    const existing = await this.prisma.vendor.findFirst({ where: { id, ...this.org(t) } });
    if (!existing) throw new NotFoundException('Vendor not found');
    await this.prisma.vendor.delete({ where: { id } });
  }

  // --- Cross-module: post a salary payment as an expense -------------------

  /**
   * Book a salary payment (or exit settlement) as a POSTED expense under the
   * "Salaries" category in the first book. Called by the Staff module when its
   * postToAccounts switch is on. Returns the ledger entry id.
   */
  async postSalary(
    t: TenantContext,
    p: { title: string; person: string; amount: number; date: string; mode: 'CASH' | 'UPI' | 'BANK' | 'CHEQUE' },
  ): Promise<string> {
    await this.ensureSeed(t);
    const account = await this.prisma.expenseAccount.findFirst({
      where: this.org(t),
      orderBy: { rank: 'asc' },
    });
    if (!account) throw new BadRequestException('No account to post to');
    let category = await this.prisma.expenseCategory.findFirst({
      where: { ...this.org(t), label: 'Salaries' },
    });
    if (!category) {
      const max = await this.prisma.expenseCategory.aggregate({ where: this.org(t), _max: { rank: true } });
      category = await this.prisma.expenseCategory.create({
        data: {
          organizationId: t.organizationId,
          label: 'Salaries',
          kind: 'EXPENSE',
          color: '#2450E0',
          rank: (max._max.rank ?? -1) + 1,
        },
      });
    }
    const voucherNo = await this.nextVoucherNo(t, 'EXPENSE');
    const entry = await this.prisma.ledgerEntry.create({
      data: {
        organizationId: t.organizationId,
        academicYearId: t.academicYearId,
        accountId: account.id,
        categoryId: category.id,
        kind: 'EXPENSE',
        voucherNo,
        date: new Date(p.date),
        title: p.title,
        person: p.person,
        amount: p.amount,
        mode: p.mode,
        note: 'Posted from Staff & payroll',
        status: 'POSTED',
        signed: true,
      },
    });
    return entry.id;
  }

  /** Reverse a salary posting (e.g. an exit was un-settled). */
  async removeSalaryPosting(t: TenantContext, ledgerEntryId: string): Promise<void> {
    await this.prisma.ledgerEntry.deleteMany({ where: { id: ledgerEntryId, ...this.org(t) } });
  }
}

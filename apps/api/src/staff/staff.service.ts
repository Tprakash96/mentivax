import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Employee as EmployeeRow, PayRun } from '@mentivax/db';
import {
  DEFAULT_PAYROLL_SETTINGS,
  computeEarnings,
  computeNet,
  computePayslip,
  computeSettlement,
  rupeesInWords,
  type PayrollEmployee,
  type PayrollSettings,
} from '@mentivax/core';
import type {
  CreateEmployeeDto,
  CreateLeaveDto,
  DecideLeaveDto,
  MarkExitDto,
  PayStaffDto,
  PayrollSettingsDto,
  RecordRaiseDto,
  SetAttendanceDto,
  SettleExitDto,
  UpdateEmployeeDto,
} from '@mentivax/core';
import { PrismaService } from '../prisma/prisma.service';
import { ExpensesService } from '../expenses/expenses.service';
import type { TenantContext } from '../tenant/tenant.types';

type PayMode = 'CASH' | 'UPI' | 'BANK' | 'CHEQUE';
export interface Increment {
  date: string;
  note: string;
  delta: number;
}

/** The current calendar month, "YYYY-MM". */
const thisMonth = () => new Date().toISOString().slice(0, 7);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expenses: ExpensesService,
  ) {}

  private org(t: TenantContext) {
    return { organizationId: t.organizationId };
  }

  // --- Settings ------------------------------------------------------------

  async getSettings(t: TenantContext): Promise<PayrollSettings> {
    const s = await this.prisma.payrollSetting.findUnique({ where: { organizationId: t.organizationId } });
    if (!s) return { ...DEFAULT_PAYROLL_SETTINGS };
    return {
      daPercent: s.daPercent,
      hraPercent: s.hraPercent,
      pfPercent: s.pfPercent,
      ptMonthly: s.ptMonthly,
      conveyance: s.conveyance,
      postToAccounts: s.postToAccounts,
    };
  }

  async saveSettings(t: TenantContext, dto: PayrollSettingsDto): Promise<PayrollSettings> {
    await this.prisma.payrollSetting.upsert({
      where: { organizationId: t.organizationId },
      create: { organizationId: t.organizationId, ...dto },
      update: dto,
    });
    return this.getSettings(t);
  }

  // --- Mapping -------------------------------------------------------------

  private payrollEmp(e: EmployeeRow): PayrollEmployee {
    return {
      role: e.role,
      basic: e.basic,
      special: e.special,
      pfEnabled: e.pfEnabled,
      esiEnabled: e.esiEnabled,
      ptEnabled: e.ptEnabled,
      tds: e.tds,
      advance: e.advance,
      elBalance: e.elBalance,
    };
  }

  private employeeDto(e: EmployeeRow, s: PayrollSettings, paid?: PayRun) {
    const earnings = computeEarnings(this.payrollEmp(e), s);
    return {
      id: e.id,
      code: e.code,
      name: e.name,
      role: e.role,
      designation: e.designation,
      phone: e.phone,
      doj: iso(e.doj)!,
      basic: e.basic,
      special: e.special,
      pfEnabled: e.pfEnabled,
      esiEnabled: e.esiEnabled,
      ptEnabled: e.ptEnabled,
      tds: e.tds,
      advance: e.advance,
      clBalance: e.clBalance,
      slBalance: e.slBalance,
      elBalance: e.elBalance,
      licence: e.licence,
      licExp: iso(e.licExp),
      vehicle: e.vehicle,
      route: e.route,
      accountName: e.accountName,
      accountNo: e.accountNo,
      ifsc: e.ifsc,
      docs: e.docs,
      increments: (Array.isArray(e.increments) ? e.increments : []) as unknown as Increment[],
      status: e.status,
      exitDate: iso(e.exitDate),
      exitReason: e.exitReason,
      exitSettled: e.exitSettled,
      gross: earnings.gross,
      net: computeNet(this.payrollEmp(e), s),
      paidThisMonth: !!paid,
      paidMode: paid ? (paid.mode as PayMode) : null,
    };
  }

  // --- Employees -----------------------------------------------------------

  private codePrefix(t: TenantContext): string {
    const initials = (t.organizationName || 'AGS')
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 3)
      .toUpperCase();
    return initials || 'AGS';
  }

  private async nextCode(t: TenantContext): Promise<string> {
    const count = await this.prisma.employee.count({ where: this.org(t) });
    return `${this.codePrefix(t)}-${String(count + 1).padStart(3, '0')}`;
  }

  async summary(t: TenantContext) {
    const s = await this.getSettings(t);
    const [active, runs] = await Promise.all([
      this.prisma.employee.findMany({ where: { ...this.org(t), status: 'ACTIVE' } }),
      this.prisma.payRun.findMany({ where: { ...this.org(t), month: thisMonth() } }),
    ]);
    const paidIds = new Set(runs.map((r) => r.employeeId));
    return {
      headcount: active.length,
      monthlyBill: active.reduce((a, e) => a + computeNet(this.payrollEmp(e), s), 0),
      paidThisMonth: runs.reduce((a, r) => a + r.net, 0),
      toPayCount: active.filter((e) => !paidIds.has(e.id)).length,
      teacherCount: active.filter((e) => e.role === 'TEACHER').length,
      transportCount: active.filter((e) => e.role === 'TRANSPORT').length,
    };
  }

  async list(t: TenantContext, f: { role?: string; search?: string; status?: string }) {
    const s = await this.getSettings(t);
    const where: Prisma.EmployeeWhereInput = { ...this.org(t) };
    where.status = f.status === 'EXITED' ? 'EXITED' : 'ACTIVE';
    if (f.role) where.role = f.role as EmployeeRow['role'];
    if (f.search) {
      where.OR = [
        { name: { contains: f.search, mode: 'insensitive' } },
        { code: { contains: f.search, mode: 'insensitive' } },
        { phone: { contains: f.search, mode: 'insensitive' } },
        { designation: { contains: f.search, mode: 'insensitive' } },
      ];
    }
    const [rows, runs] = await Promise.all([
      this.prisma.employee.findMany({ where, orderBy: { name: 'asc' } }),
      this.prisma.payRun.findMany({ where: { ...this.org(t), month: thisMonth() } }),
    ]);
    const paid = new Map(runs.map((r) => [r.employeeId, r]));
    return rows.map((e) => this.employeeDto(e, s, paid.get(e.id)));
  }

  async get(t: TenantContext, id: string) {
    const e = await this.prisma.employee.findFirst({ where: { id, ...this.org(t) } });
    if (!e) throw new NotFoundException('Employee not found');
    const s = await this.getSettings(t);
    const paid = await this.prisma.payRun.findFirst({ where: { employeeId: id, month: thisMonth() } });
    return this.employeeDto(e, s, paid ?? undefined);
  }

  async hire(t: TenantContext, dto: CreateEmployeeDto) {
    const s = await this.getSettings(t);
    const code = await this.nextCode(t);
    const e = await this.prisma.employee.create({
      data: {
        organizationId: t.organizationId,
        code,
        name: dto.name,
        role: dto.role ?? 'TEACHER',
        designation: dto.designation ?? '',
        phone: dto.phone ?? '',
        doj: dto.doj ? new Date(dto.doj) : new Date(),
        basic: dto.basic ?? 0,
        special: dto.special ?? 0,
        pfEnabled: dto.pfEnabled ?? dto.role !== 'VISITING',
        esiEnabled: dto.esiEnabled ?? (dto.basic ?? 0) < 1_600_000,
        ptEnabled: dto.ptEnabled ?? false,
        licence: dto.licence ?? null,
        licExp: dto.licExp ? new Date(dto.licExp) : null,
        vehicle: dto.vehicle ?? null,
        route: dto.route ?? null,
      },
    });
    return this.employeeDto(e, s);
  }

  async update(t: TenantContext, id: string, dto: UpdateEmployeeDto) {
    const existing = await this.prisma.employee.findFirst({ where: { id, ...this.org(t) } });
    if (!existing) throw new NotFoundException('Employee not found');
    const e = await this.prisma.employee.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        role: dto.role ?? undefined,
        designation: dto.designation ?? undefined,
        phone: dto.phone ?? undefined,
        doj: dto.doj ? new Date(dto.doj) : undefined,
        basic: dto.basic ?? undefined,
        special: dto.special ?? undefined,
        pfEnabled: dto.pfEnabled ?? undefined,
        esiEnabled: dto.esiEnabled ?? undefined,
        ptEnabled: dto.ptEnabled ?? undefined,
        tds: dto.tds ?? undefined,
        advance: dto.advance ?? undefined,
        licence: dto.licence ?? undefined,
        licExp: dto.licExp ? new Date(dto.licExp) : undefined,
        vehicle: dto.vehicle ?? undefined,
        route: dto.route ?? undefined,
        accountName: dto.accountName ?? undefined,
        accountNo: dto.accountNo ?? undefined,
        ifsc: dto.ifsc ?? undefined,
        docs: dto.docs ?? undefined,
      },
    });
    const s = await this.getSettings(t);
    return this.employeeDto(e, s);
  }

  async recordRaise(t: TenantContext, id: string, dto: RecordRaiseDto) {
    const e = await this.prisma.employee.findFirst({ where: { id, ...this.org(t) } });
    if (!e) throw new NotFoundException('Employee not found');
    const history = (Array.isArray(e.increments) ? e.increments : []) as unknown as Increment[];
    const row: Increment = {
      date: new Date().toISOString().slice(0, 10),
      note: dto.note?.trim() || 'Salary revision',
      delta: dto.delta,
    };
    const updated = await this.prisma.employee.update({
      where: { id },
      data: {
        basic: Math.max(0, e.basic + dto.delta),
        increments: [...history, row] as unknown as Prisma.InputJsonValue,
      },
    });
    const s = await this.getSettings(t);
    return this.employeeDto(updated, s);
  }

  async markExit(t: TenantContext, id: string, dto: MarkExitDto) {
    const e = await this.prisma.employee.findFirst({ where: { id, ...this.org(t) } });
    if (!e) throw new NotFoundException('Employee not found');
    const updated = await this.prisma.employee.update({
      where: { id },
      data: {
        status: 'EXITED',
        exitDate: dto.date ? new Date(dto.date) : new Date(),
        exitReason: dto.reason?.trim() || 'Resigned',
        exitSettled: false,
      },
    });
    const s = await this.getSettings(t);
    return this.employeeDto(updated, s);
  }

  // --- Attendance ----------------------------------------------------------

  private monthShape(month: string) {
    const [y, m] = month.split('-').map(Number);
    const dayCount = new Date(y!, m!, 0).getDate();
    const sundays: number[] = [];
    for (let d = 1; d <= dayCount; d++) {
      if (new Date(y!, m! - 1, d).getDay() === 0) sundays.push(d);
    }
    return { dayCount, sundays };
  }

  private defaultDays(month: string): string {
    const { dayCount, sundays } = this.monthShape(month);
    let out = '';
    const sun = new Set(sundays);
    for (let d = 1; d <= dayCount; d++) out += sun.has(d) ? 'H' : 'P';
    return out;
  }

  async attendance(t: TenantContext, month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('Bad month');
    const { dayCount, sundays } = this.monthShape(month);
    const [emps, records] = await Promise.all([
      this.prisma.employee.findMany({ where: { ...this.org(t), status: 'ACTIVE' }, orderBy: { name: 'asc' } }),
      this.prisma.attendanceRecord.findMany({ where: { ...this.org(t), month } }),
    ]);
    const byEmp = new Map(records.map((r) => [r.employeeId, r.days]));
    const rows = emps.map((e) => {
      const days = byEmp.get(e.id) ?? this.defaultDays(month);
      const count = (ch: string) => days.split('').filter((c) => c === ch).length;
      return {
        employeeId: e.id,
        employeeName: e.name,
        code: e.code,
        role: e.role,
        days,
        present: count('P'),
        absent: count('A'),
        leave: count('L'),
      };
    });
    return { month, dayCount, sundays, rows };
  }

  async setAttendance(t: TenantContext, dto: SetAttendanceDto) {
    const emp = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, ...this.org(t) } });
    if (!emp) throw new NotFoundException('Employee not found');
    await this.prisma.attendanceRecord.upsert({
      where: { employeeId_month: { employeeId: dto.employeeId, month: dto.month } },
      create: { organizationId: t.organizationId, employeeId: dto.employeeId, month: dto.month, days: dto.days },
      update: { days: dto.days },
    });
    return this.attendance(t, dto.month);
  }

  private async lopDaysFor(t: TenantContext, employeeId: string, month: string): Promise<number> {
    const rec = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_month: { employeeId, month } },
    });
    if (!rec) return 0;
    return rec.days.split('').filter((c) => c === 'A').length;
  }

  // --- Leave ---------------------------------------------------------------

  async listLeave(t: TenantContext) {
    const rows = await this.prisma.leaveRequest.findMany({
      where: this.org(t),
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: { employee: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employee.name,
      type: r.type,
      days: r.days,
      fromDate: iso(r.fromDate)!,
      reason: r.reason,
      status: r.status,
    }));
  }

  async createLeave(t: TenantContext, dto: CreateLeaveDto) {
    const emp = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, ...this.org(t) } });
    if (!emp) throw new NotFoundException('Employee not found');
    const r = await this.prisma.leaveRequest.create({
      data: {
        organizationId: t.organizationId,
        employeeId: dto.employeeId,
        type: dto.type ?? 'CASUAL',
        days: dto.days ?? 1,
        fromDate: dto.fromDate ? new Date(dto.fromDate) : new Date(),
        reason: dto.reason?.trim() || '',
      },
      include: { employee: { select: { name: true } } },
    });
    return {
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employee.name,
      type: r.type,
      days: r.days,
      fromDate: iso(r.fromDate)!,
      reason: r.reason,
      status: r.status,
    };
  }

  async decideLeave(t: TenantContext, id: string, dto: DecideLeaveDto) {
    const existing = await this.prisma.leaveRequest.findFirst({ where: { id, ...this.org(t) } });
    if (!existing) throw new NotFoundException('Leave request not found');
    const r = await this.prisma.leaveRequest.update({
      where: { id },
      data: { status: dto.status },
      include: { employee: { select: { name: true } } },
    });
    return {
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employee.name,
      type: r.type,
      days: r.days,
      fromDate: iso(r.fromDate)!,
      reason: r.reason,
      status: r.status,
    };
  }

  // --- Payroll -------------------------------------------------------------

  async payroll(t: TenantContext, month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('Bad month');
    const s = await this.getSettings(t);
    const [emps, runs] = await Promise.all([
      this.prisma.employee.findMany({ where: { ...this.org(t), status: 'ACTIVE' }, orderBy: { name: 'asc' } }),
      this.prisma.payRun.findMany({ where: { ...this.org(t), month } }),
    ]);
    const runByEmp = new Map(runs.map((r) => [r.employeeId, r]));
    const attendance = await this.prisma.attendanceRecord.findMany({ where: { ...this.org(t), month } });
    const lopByEmp = new Map(
      attendance.map((a) => [a.employeeId, a.days.split('').filter((c) => c === 'A').length]),
    );

    let stillToPay = 0;
    const rows = emps.map((e) => {
      const run = runByEmp.get(e.id);
      const lopDays = run ? run.lopDays : (lopByEmp.get(e.id) ?? 0);
      const slip = computePayslip(this.payrollEmp(e), lopDays, s);
      const net = run ? run.net : slip.net;
      if (!run) stillToPay += net;
      return {
        employeeId: e.id,
        name: e.name,
        code: e.code,
        role: e.role,
        gross: slip.gross,
        lopDays,
        lop: run ? run.lop : slip.lop,
        deductions: run ? run.deductionsTotal : slip.total,
        net,
        paid: !!run,
        mode: run ? (run.mode as PayMode) : null,
        payslipNo: run?.payslipNo ?? null,
      };
    });
    return {
      month,
      postToAccounts: s.postToAccounts,
      rows,
      stillToPay,
      paid: runs.reduce((a, r) => a + r.net, 0),
    };
  }

  private payslipDto(r: PayRun, emp: { name: string; code: string; designation: string }) {
    return {
      id: r.id,
      payslipNo: r.payslipNo,
      employeeId: r.employeeId,
      employeeName: emp.name,
      code: emp.code,
      designation: emp.designation,
      month: r.month,
      paidAt: iso(r.paidAt)!,
      mode: r.mode as PayMode,
      lopDays: r.lopDays,
      payableDays: Math.max(0, 30 - r.lopDays),
      basic: r.basic,
      da: r.da,
      hra: r.hra,
      conveyance: r.conveyance,
      special: r.special,
      gross: r.gross,
      lop: r.lop,
      pf: r.pf,
      esi: r.esi,
      pt: r.pt,
      tds: r.tds,
      advanceRecovered: r.advanceRecovered,
      deductionsTotal: r.deductionsTotal,
      net: r.net,
      amountInWords: rupeesInWords(r.net),
    };
  }

  private async nextPayslipNo(t: TenantContext): Promise<string> {
    const yearTag = (t.academicYearLabel || '').replace(/\D/g, '').slice(0, 4) || '0000';
    const count = await this.prisma.payRun.count({ where: this.org(t) });
    return `PS-${yearTag}-${String(count + 101).padStart(3, '0')}`;
  }

  async pay(t: TenantContext, dto: PayStaffDto) {
    const emp = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, ...this.org(t) } });
    if (!emp) throw new NotFoundException('Employee not found');
    if (emp.status !== 'ACTIVE') throw new BadRequestException('Employee is not active');
    const existing = await this.prisma.payRun.findUnique({
      where: { employeeId_month: { employeeId: dto.employeeId, month: dto.month } },
    });
    if (existing) throw new BadRequestException('Already paid for this month');

    const s = await this.getSettings(t);
    const slip = computePayslip(this.payrollEmp(emp), dto.lopDays, s);
    const payslipNo = await this.nextPayslipNo(t);
    const paidAt = new Date();

    let ledgerEntryId: string | null = null;
    if (s.postToAccounts) {
      ledgerEntryId = await this.expenses.postSalary(t, {
        title: `Salary · ${emp.name} · ${dto.month}`,
        person: emp.name,
        amount: slip.net,
        date: paidAt.toISOString().slice(0, 10),
        mode: dto.mode,
      });
    }

    const run = await this.prisma.payRun.create({
      data: {
        organizationId: t.organizationId,
        academicYearId: t.academicYearId,
        employeeId: emp.id,
        payslipNo,
        month: dto.month,
        lopDays: dto.lopDays,
        mode: dto.mode,
        paidAt,
        basic: slip.basic,
        da: slip.da,
        hra: slip.hra,
        conveyance: slip.conveyance,
        special: slip.special,
        gross: slip.gross,
        lop: slip.lop,
        pf: slip.pf,
        esi: slip.esi,
        pt: slip.pt,
        tds: slip.tds,
        advanceRecovered: slip.advance,
        deductionsTotal: slip.total,
        net: slip.net,
        ledgerEntryId,
      },
    });

    // Recover the advance that was deducted this run.
    if (slip.advance > 0) {
      await this.prisma.employee.update({
        where: { id: emp.id },
        data: { advance: Math.max(0, emp.advance - slip.advance) },
      });
    }
    return this.payslipDto(run, emp);
  }

  async payslips(t: TenantContext) {
    const runs = await this.prisma.payRun.findMany({
      where: this.org(t),
      orderBy: { paidAt: 'desc' },
      include: { employee: { select: { name: true, code: true, designation: true } } },
    });
    return runs.map((r) => this.payslipDto(r, r.employee));
  }

  // --- Exits & settlement --------------------------------------------------

  async exits(t: TenantContext) {
    const s = await this.getSettings(t);
    const rows = await this.prisma.employee.findMany({
      where: { ...this.org(t), status: 'EXITED' },
      orderBy: { exitDate: 'desc' },
    });
    return rows.map((e) => {
      const settle = computeSettlement(this.payrollEmp(e), s);
      return {
        employeeId: e.id,
        name: e.name,
        code: e.code,
        role: e.role,
        lastDay: iso(e.exitDate),
        reason: e.exitReason,
        lastNet: settle.lastNet,
        encashment: settle.encashment,
        advance: settle.advance,
        amount: e.exitSettled ? 0 : settle.amount,
        settled: e.exitSettled,
      };
    });
  }

  async settle(t: TenantContext, employeeId: string, dto: SettleExitDto) {
    const e = await this.prisma.employee.findFirst({ where: { id: employeeId, ...this.org(t) } });
    if (!e) throw new NotFoundException('Employee not found');
    if (e.status !== 'EXITED') throw new BadRequestException('Employee has not exited');
    if (e.exitSettled) throw new BadRequestException('Already settled');
    const s = await this.getSettings(t);
    const settle = computeSettlement(this.payrollEmp(e), s);

    if (s.postToAccounts && settle.amount > 0) {
      await this.expenses.postSalary(t, {
        title: `Full & final · ${e.name}`,
        person: e.name,
        amount: settle.amount,
        date: new Date().toISOString().slice(0, 10),
        mode: dto.mode,
      });
    }
    const updated = await this.prisma.employee.update({
      where: { id: employeeId },
      data: { exitSettled: true, advance: 0, elBalance: 0 },
    });
    return {
      employeeId: updated.id,
      name: updated.name,
      code: updated.code,
      role: updated.role,
      lastDay: iso(updated.exitDate),
      reason: updated.exitReason,
      lastNet: settle.lastNet,
      encashment: settle.encashment,
      advance: settle.advance,
      amount: 0,
      settled: true,
    };
  }
}

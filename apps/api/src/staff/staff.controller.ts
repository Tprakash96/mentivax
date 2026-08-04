import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  createEmployeeSchema,
  createLeaveSchema,
  decideLeaveSchema,
  markExitSchema,
  payStaffSchema,
  payrollSettingsSchema,
  recordRaiseSchema,
  setAttendanceSchema,
  settleExitSchema,
  updateEmployeeSchema,
  type CreateEmployeeDto,
  type CreateLeaveDto,
  type DecideLeaveDto,
  type MarkExitDto,
  type PayStaffDto,
  type PayrollSettingsDto,
  type RecordRaiseDto,
  type SetAttendanceDto,
  type SettleExitDto,
  type UpdateEmployeeDto,
} from '@mentivax/core';
import { ZodBody } from '../common/zod-body.pipe';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { RequirePermissions } from '../auth/auth.decorators';
import { ModuleGuard } from '../modules/module.guard';
import { RequiresModule } from '../modules/requires-module.decorator';
import { StaffService } from './staff.service';

@RequiresModule('staff')
@UseGuards(ModuleGuard)
@Controller('staff')
export class StaffController {
  constructor(private readonly service: StaffService) {}

  // --- Register -----------------------------------------------------------

  @Get('summary')
  @RequirePermissions('staff:read')
  summary(@Tenant() t: TenantContext) {
    return this.service.summary(t);
  }

  @Get('employees')
  @RequirePermissions('staff:read')
  list(
    @Tenant() t: TenantContext,
    @Query('role') role?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.service.list(t, { role, search, status });
  }

  @Get('employees/:id')
  @RequirePermissions('staff:read')
  get(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.get(t, id);
  }

  @Post('employees')
  @RequirePermissions('staff:write')
  hire(@Tenant() t: TenantContext, @Body(new ZodBody(createEmployeeSchema)) dto: CreateEmployeeDto) {
    return this.service.hire(t, dto);
  }

  @Patch('employees/:id')
  @RequirePermissions('staff:write')
  update(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(updateEmployeeSchema)) dto: UpdateEmployeeDto,
  ) {
    return this.service.update(t, id, dto);
  }

  @Post('employees/:id/raise')
  @RequirePermissions('staff:write')
  raise(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(recordRaiseSchema)) dto: RecordRaiseDto,
  ) {
    return this.service.recordRaise(t, id, dto);
  }

  @Post('employees/:id/exit')
  @RequirePermissions('staff:write')
  exit(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(markExitSchema)) dto: MarkExitDto,
  ) {
    return this.service.markExit(t, id, dto);
  }

  // --- Attendance ---------------------------------------------------------

  @Get('attendance')
  @RequirePermissions('staff:read')
  attendance(@Tenant() t: TenantContext, @Query('month') month: string) {
    return this.service.attendance(t, month);
  }

  @Put('attendance')
  @RequirePermissions('staff:attendance')
  setAttendance(@Tenant() t: TenantContext, @Body(new ZodBody(setAttendanceSchema)) dto: SetAttendanceDto) {
    return this.service.setAttendance(t, dto);
  }

  // --- Leave --------------------------------------------------------------

  @Get('leave')
  @RequirePermissions('staff:read')
  leave(@Tenant() t: TenantContext) {
    return this.service.listLeave(t);
  }

  @Post('leave')
  @RequirePermissions('staff:write')
  createLeave(@Tenant() t: TenantContext, @Body(new ZodBody(createLeaveSchema)) dto: CreateLeaveDto) {
    return this.service.createLeave(t, dto);
  }

  @Patch('leave/:id')
  @RequirePermissions('staff:write')
  decideLeave(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(decideLeaveSchema)) dto: DecideLeaveDto,
  ) {
    return this.service.decideLeave(t, id, dto);
  }

  // --- Payroll ------------------------------------------------------------

  @Get('payroll')
  @RequirePermissions('payroll:read')
  payroll(@Tenant() t: TenantContext, @Query('month') month: string) {
    return this.service.payroll(t, month);
  }

  @Post('payroll/pay')
  @RequirePermissions('payroll:run')
  pay(@Tenant() t: TenantContext, @Body(new ZodBody(payStaffSchema)) dto: PayStaffDto) {
    return this.service.pay(t, dto);
  }

  @Get('payslips')
  @RequirePermissions('payroll:read')
  payslips(@Tenant() t: TenantContext) {
    return this.service.payslips(t);
  }

  // --- Exits --------------------------------------------------------------

  @Get('exits')
  @RequirePermissions('staff:read')
  exits(@Tenant() t: TenantContext) {
    return this.service.exits(t);
  }

  @Post('exits/:id/settle')
  @RequirePermissions('payroll:run')
  settle(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(settleExitSchema)) dto: SettleExitDto,
  ) {
    return this.service.settle(t, id, dto);
  }

  // --- Settings -----------------------------------------------------------

  @Get('settings')
  @RequirePermissions('payroll:read')
  settings(@Tenant() t: TenantContext) {
    return this.service.getSettings(t);
  }

  @Put('settings')
  @RequirePermissions('payroll:run')
  saveSettings(@Tenant() t: TenantContext, @Body(new ZodBody(payrollSettingsSchema)) dto: PayrollSettingsDto) {
    return this.service.saveSettings(t, dto);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  createDiscountRuleSchema,
  createHolidaySchema,
  createSubjectSchema,
  updateDiscountRuleSchema,
  updateSchoolProfileSchema,
  updateSubjectSchema,
  type CreateDiscountRuleDto,
  type CreateHolidayDto,
  type CreateSubjectDto,
  type UpdateDiscountRuleDto,
  type UpdateSchoolProfileDto,
  type UpdateSubjectDto,
} from '@mentivax/core';
import { ZodBody } from '../common/zod-body.pipe';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { RequirePermissions } from '../auth/auth.decorators';
import { SetupService } from './setup.service';

/**
 * School Setup — the guided configuration surface. Reads/writes the school
 * profile, subjects, and holiday calendar, and reports completion of the
 * essential steps. Classes, fees, years, and the accounts/payroll switches are
 * driven from their own endpoints by the wizard UI.
 */
@Controller('setup')
export class SetupController {
  constructor(private readonly service: SetupService) {}

  @Get('overview')
  @RequirePermissions('settings:read')
  overview(@Tenant() t: TenantContext) {
    return this.service.overview(t);
  }

  @Get('profile')
  @RequirePermissions('settings:read')
  getProfile(@Tenant() t: TenantContext) {
    return this.service.getProfile(t);
  }

  @Patch('profile')
  @RequirePermissions('settings:write')
  updateProfile(@Tenant() t: TenantContext, @Body(new ZodBody(updateSchoolProfileSchema)) dto: UpdateSchoolProfileDto) {
    return this.service.updateProfile(t, dto);
  }

  @Get('subjects')
  @RequirePermissions('settings:read')
  subjects(@Tenant() t: TenantContext) {
    return this.service.listSubjects(t);
  }

  @Post('subjects')
  @RequirePermissions('settings:write')
  createSubject(@Tenant() t: TenantContext, @Body(new ZodBody(createSubjectSchema)) dto: CreateSubjectDto) {
    return this.service.createSubject(t, dto);
  }

  @Patch('subjects/:id')
  @RequirePermissions('settings:write')
  updateSubject(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(updateSubjectSchema)) dto: UpdateSubjectDto,
  ) {
    return this.service.updateSubject(t, id, dto);
  }

  @Delete('subjects/:id')
  @RequirePermissions('settings:write')
  removeSubject(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.removeSubject(t, id);
  }

  @Get('holidays')
  @RequirePermissions('settings:read')
  holidays(@Tenant() t: TenantContext) {
    return this.service.listHolidays(t);
  }

  @Post('holidays')
  @RequirePermissions('settings:write')
  createHoliday(@Tenant() t: TenantContext, @Body(new ZodBody(createHolidaySchema)) dto: CreateHolidayDto) {
    return this.service.createHoliday(t, dto);
  }

  @Delete('holidays/:id')
  @RequirePermissions('settings:write')
  removeHoliday(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.removeHoliday(t, id);
  }

  @Get('discounts')
  @RequirePermissions('settings:read')
  discounts(@Tenant() t: TenantContext) {
    return this.service.listDiscounts(t);
  }

  @Post('discounts')
  @RequirePermissions('settings:write')
  createDiscount(@Tenant() t: TenantContext, @Body(new ZodBody(createDiscountRuleSchema)) dto: CreateDiscountRuleDto) {
    return this.service.createDiscount(t, dto);
  }

  @Patch('discounts/:id')
  @RequirePermissions('settings:write')
  updateDiscount(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(updateDiscountRuleSchema)) dto: UpdateDiscountRuleDto,
  ) {
    return this.service.updateDiscount(t, id, dto);
  }

  @Delete('discounts/:id')
  @RequirePermissions('settings:write')
  removeDiscount(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.removeDiscount(t, id);
  }
}

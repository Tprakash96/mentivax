import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { askPlanSchema, askReportSchema, type AskPlan, type AskReportDto } from '@mentivax/core';
import { ZodBody } from '../common/zod-body.pipe';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { RequirePermissions } from '../auth/auth.decorators';
import { ModuleGuard } from '../modules/module.guard';
import { RequiresModule } from '../modules/requires-module.decorator';
import { ReportsService } from './reports.service';
import { AskService } from './ask.service';

/**
 * Fees & collections reporting. Read-only: every route needs `reports:read` and
 * the `reports` module, and each figure is scoped to the caller's org + active
 * academic year by the service.
 */
@RequiresModule('reports')
@UseGuards(ModuleGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly service: ReportsService,
    private readonly askService: AskService,
  ) {}

  @Get('overview')
  @RequirePermissions('reports:read')
  overview(@Tenant() t: TenantContext) {
    return this.service.overview(t);
  }

  @Get('fee-heads')
  @RequirePermissions('reports:read')
  feeHeads(@Tenant() t: TenantContext) {
    return this.service.feeHeads(t);
  }

  @Get('concessions')
  @RequirePermissions('reports:read')
  concessions(@Tenant() t: TenantContext) {
    return this.service.concessions(t);
  }

  @Get('transport')
  @RequirePermissions('reports:read')
  transport(@Tenant() t: TenantContext) {
    return this.service.transport(t);
  }

  @Post('ask')
  @RequirePermissions('reports:read')
  ask(@Tenant() t: TenantContext, @Body(new ZodBody(askReportSchema)) dto: AskReportDto) {
    return this.askService.ask(t, dto.question);
  }

  /**
   * Run an explicit query plan — the same primitive Ask uses once the model has
   * chosen a plan, minus the model. Needs no Gemini key, so a school without one
   * can still run a known query, and it makes any Ask answer reproducible from
   * the `trace` it came back with.
   */
  @Post('ask/plan')
  @RequirePermissions('reports:read')
  runPlan(@Tenant() t: TenantContext, @Body(new ZodBody(askPlanSchema)) plan: AskPlan) {
    return this.askService.runPlan(t, plan);
  }
}

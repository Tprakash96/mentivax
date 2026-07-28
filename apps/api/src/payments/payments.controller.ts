import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createPaymentSchema,
  updatePaymentSchema,
  type CreatePaymentDto,
  type UpdatePaymentDto,
} from '@mentivax/core';
import { ZodBody } from '../common/zod-body.pipe';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { ModuleGuard } from '../modules/module.guard';
import { RequiresModule } from '../modules/requires-module.decorator';
import { PaymentsService } from './payments.service';

@RequiresModule('fees')
@UseGuards(ModuleGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get()
  list(@Tenant() t: TenantContext, @Query('search') search?: string) {
    return this.service.list(t, { search });
  }

  @Get('summary')
  summary(@Tenant() t: TenantContext) {
    return this.service.summary(t);
  }

  @Get(':id/breakdown')
  breakdown(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.breakdown(t, id);
  }

  @Post()
  create(@Tenant() t: TenantContext, @Body(new ZodBody(createPaymentSchema)) dto: CreatePaymentDto) {
    return this.service.create(t, dto);
  }

  @Patch(':id')
  update(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(updatePaymentSchema)) dto: UpdatePaymentDto,
  ) {
    return this.service.update(t, id, dto);
  }

  /** Void a payment: mark inactive and reverse its effect on invoices. */
  @Post(':id/deactivate')
  deactivate(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.deactivate(t, id);
  }
}

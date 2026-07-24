import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { createPaymentSchema, type CreatePaymentDto } from '@mentivax/core';
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

  @Post()
  create(@Tenant() t: TenantContext, @Body(new ZodBody(createPaymentSchema)) dto: CreatePaymentDto) {
    return this.service.create(t, dto);
  }
}

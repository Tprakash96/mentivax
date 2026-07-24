import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  createBatchSchema,
  previewBatchSchema,
  type CreateBatchDto,
  type PreviewBatchDto,
} from '@mentivax/core';
import { ZodBody } from '../common/zod-body.pipe';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { ModuleGuard } from '../modules/module.guard';
import { RequiresModule } from '../modules/requires-module.decorator';
import { InvoicesService } from './invoices.service';

@RequiresModule('fees')
@UseGuards(ModuleGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Get()
  list(
    @Tenant() t: TenantContext,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.service.list(t, { status, search });
  }

  @Post('batch/preview')
  previewBatch(
    @Tenant() t: TenantContext,
    @Body(new ZodBody(previewBatchSchema)) dto: PreviewBatchDto,
  ) {
    return this.service.previewBatch(t, dto);
  }

  @Post('batch')
  createBatch(
    @Tenant() t: TenantContext,
    @Body(new ZodBody(createBatchSchema)) dto: CreateBatchDto,
  ) {
    return this.service.createBatch(t, dto);
  }

  @Get(':id')
  get(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.get(t, id);
  }
}

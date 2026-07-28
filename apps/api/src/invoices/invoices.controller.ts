import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createBatchSchema,
  createInvoiceSchema,
  generateInvoicesSchema,
  previewBatchSchema,
  updateInvoiceSchema,
  type CreateBatchDto,
  type CreateInvoiceDto,
  type GenerateInvoicesDto,
  type PreviewBatchDto,
  type UpdateInvoiceDto,
} from '@mentivax/core';
import { ZodBody } from '../common/zod-body.pipe';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { ModuleGuard } from '../modules/module.guard';
import { RequiresModule } from '../modules/requires-module.decorator';
import { InvoicesService } from './invoices.service';
import { InvoiceGenerationService } from './invoice-generation.service';

@RequiresModule('fees')
@UseGuards(ModuleGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly service: InvoicesService,
    private readonly generation: InvoiceGenerationService,
  ) {}

  @Get()
  list(
    @Tenant() t: TenantContext,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.service.list(t, { status, search });
  }

  /** Review rows for the Generate screen: each student's base fee + adjustments. */
  @Get('generate/preview')
  generatePreview(@Tenant() t: TenantContext) {
    return this.generation.previewForYear(t);
  }

  /** Period-wise split for one student's invoice under a fee scope (Add-invoice preview). */
  @Get('single/preview')
  previewSingle(
    @Tenant() t: TenantContext,
    @Query('studentId') studentId: string,
    @Query('feeScope') feeScope?: string,
  ) {
    const scope = feeScope === 'ACADEMIC' || feeScope === 'TRANSPORT' ? feeScope : 'ALL';
    return this.generation.previewSingle(t, studentId, scope);
  }

  /** Create a single invoice for one student. */
  @Post('single')
  createOne(
    @Tenant() t: TenantContext,
    @Body(new ZodBody(createInvoiceSchema)) dto: CreateInvoiceDto,
  ) {
    return this.generation.createOne(t, dto);
  }

  /** Auto-generate invoices for the roster (academic + transport per student). */
  @Post('generate')
  generate(
    @Tenant() t: TenantContext,
    @Body(new ZodBody(generateInvoicesSchema)) dto: GenerateInvoicesDto,
  ) {
    return this.generation.generateForYear(t, dto);
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

  @Patch(':id')
  update(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(updateInvoiceSchema)) dto: UpdateInvoiceDto,
  ) {
    return this.service.update(t, id, dto);
  }

  @Get(':id')
  get(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.get(t, id);
  }
}

import { BadRequestException, Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { updateFeeStructureSchema, type UpdateFeeStructureDto } from '@mentivax/core';
import { ZodBody } from '../common/zod-body.pipe';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { ModuleGuard } from '../modules/module.guard';
import { RequiresModule } from '../modules/requires-module.decorator';
import { FeeStructureService } from './fee-structure.service';

@RequiresModule('fees')
@UseGuards(ModuleGuard)
@Controller('fee-structure')
export class FeeStructureController {
  constructor(private readonly service: FeeStructureService) {}

  @Get()
  get(@Tenant() t: TenantContext, @Query('classId') classId?: string) {
    if (!classId) throw new BadRequestException('classId is required');
    return this.service.getRows(t, classId);
  }

  @Put()
  update(
    @Tenant() t: TenantContext,
    @Body(new ZodBody(updateFeeStructureSchema)) dto: UpdateFeeStructureDto,
  ) {
    return this.service.update(t, dto.classId, dto.entries);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import {
  createRouteSchema,
  createStopSchema,
  saveStopFaresSchema,
  updateRouteSchema,
  updateStopSchema,
  type CreateRouteDto,
  type CreateStopDto,
  type SaveStopFaresDto,
  type UpdateRouteDto,
  type UpdateStopDto,
} from '@mentivax/core';
import { ZodBody } from '../common/zod-body.pipe';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { ModuleGuard } from '../modules/module.guard';
import { RequiresModule } from '../modules/requires-module.decorator';
import { TransportService } from './transport.service';

@RequiresModule('transport')
@UseGuards(ModuleGuard)
@Controller('transport')
export class TransportController {
  constructor(private readonly service: TransportService) {}

  @Get('routes')
  listRoutes(@Tenant() t: TenantContext) {
    return this.service.listRoutes(t);
  }

  @Post('routes')
  createRoute(@Tenant() t: TenantContext, @Body(new ZodBody(createRouteSchema)) dto: CreateRouteDto) {
    return this.service.createRoute(t, dto);
  }

  @Patch('routes/:id')
  updateRoute(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(updateRouteSchema)) dto: UpdateRouteDto,
  ) {
    return this.service.updateRoute(t, id, dto);
  }

  @Delete('routes/:id')
  deleteRoute(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.deleteRoute(t, id);
  }

  @Post('stops')
  createStop(@Tenant() t: TenantContext, @Body(new ZodBody(createStopSchema)) dto: CreateStopDto) {
    return this.service.createStop(t, dto);
  }

  @Put('stops/fares')
  saveFares(@Tenant() t: TenantContext, @Body(new ZodBody(saveStopFaresSchema)) dto: SaveStopFaresDto) {
    return this.service.saveFares(t, dto);
  }

  @Patch('stops/:id')
  updateStop(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(updateStopSchema)) dto: UpdateStopDto,
  ) {
    return this.service.updateStop(t, id, dto);
  }

  @Delete('stops/:id')
  deleteStop(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.deleteStop(t, id);
  }
}

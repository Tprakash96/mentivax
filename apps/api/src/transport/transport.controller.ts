import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import {
  createRouteSchema,
  createStopSchema,
  saveStopFaresSchema,
  transportSettingsSchema,
  updateRouteSchema,
  updateStopSchema,
  type CreateRouteDto,
  type CreateStopDto,
  type SaveStopFaresDto,
  type TransportSettingsDto,
  type UpdateRouteDto,
  type UpdateStopDto,
} from '@mentivax/core';
import { ZodBody } from '../common/zod-body.pipe';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { RequirePermissions } from '../auth/auth.decorators';
import { ModuleGuard } from '../modules/module.guard';
import { RequiresModule } from '../modules/requires-module.decorator';
import { TransportService } from './transport.service';

@RequiresModule('transport')
@UseGuards(ModuleGuard)
@Controller('transport')
export class TransportController {
  constructor(private readonly service: TransportService) {}

  @Get('routes')
  @RequirePermissions('transport:read')
  listRoutes(@Tenant() t: TenantContext) {
    return this.service.listRoutes(t);
  }

  @Get('settings')
  @RequirePermissions('transport:read')
  getSettings(@Tenant() t: TenantContext) {
    return this.service.getSettings(t);
  }

  @Put('settings')
  @RequirePermissions('transport:write')
  saveSettings(
    @Tenant() t: TenantContext,
    @Body(new ZodBody(transportSettingsSchema)) dto: TransportSettingsDto,
  ) {
    return this.service.saveSettings(t, dto);
  }

  @Post('routes')
  @RequirePermissions('transport:write')
  createRoute(@Tenant() t: TenantContext, @Body(new ZodBody(createRouteSchema)) dto: CreateRouteDto) {
    return this.service.createRoute(t, dto);
  }

  @Patch('routes/:id')
  @RequirePermissions('transport:write')
  updateRoute(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(updateRouteSchema)) dto: UpdateRouteDto,
  ) {
    return this.service.updateRoute(t, id, dto);
  }

  @Delete('routes/:id')
  @RequirePermissions('transport:write')
  deleteRoute(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.deleteRoute(t, id);
  }

  @Post('stops')
  @RequirePermissions('transport:write')
  createStop(@Tenant() t: TenantContext, @Body(new ZodBody(createStopSchema)) dto: CreateStopDto) {
    return this.service.createStop(t, dto);
  }

  @Put('stops/fares')
  @RequirePermissions('transport:write')
  saveFares(@Tenant() t: TenantContext, @Body(new ZodBody(saveStopFaresSchema)) dto: SaveStopFaresDto) {
    return this.service.saveFares(t, dto);
  }

  @Patch('stops/:id')
  @RequirePermissions('transport:write')
  updateStop(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(updateStopSchema)) dto: UpdateStopDto,
  ) {
    return this.service.updateStop(t, id, dto);
  }

  @Delete('stops/:id')
  @RequirePermissions('transport:write')
  deleteStop(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.deleteStop(t, id);
  }
}

import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { enableModuleSchema, type EnableModuleDto } from '@mentivax/core';
import { ZodBody } from '../common/zod-body.pipe';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { ModulesService } from './modules.service';

/**
 * Module marketplace + entitlement management for the current organization.
 *
 * NOTE: enable/disable are platform/owner-admin actions. Auth is stubbed in
 * this scaffold, so they are currently open — gate them with a role check
 * (OWNER / platform-admin) when real auth lands.
 */
@Controller('modules')
export class ModulesController {
  constructor(private readonly service: ModulesService) {}

  @Get()
  catalog(@Tenant() t: TenantContext) {
    return this.service.catalog(t);
  }

  @Get('enabled')
  enabled(@Tenant() t: TenantContext) {
    return { modules: this.service.enabled(t) };
  }

  @Post(':key/enable')
  enable(
    @Tenant() t: TenantContext,
    @Param('key') key: string,
    @Body(new ZodBody(enableModuleSchema)) dto: EnableModuleDto,
  ) {
    return this.service.enable(t, key, dto);
  }

  @Post(':key/disable')
  disable(@Tenant() t: TenantContext, @Param('key') key: string) {
    return this.service.disable(t, key);
  }
}

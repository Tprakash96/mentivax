import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { enableModuleSchema, type EnableModuleDto } from '@mentivax/core';
import { ZodBody } from '../common/zod-body.pipe';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { RequirePermissions } from '../auth/auth.decorators';
import { ModulesService } from './modules.service';

/**
 * Module marketplace + entitlement management for the current organization.
 *
 * Enabling and disabling affects what the school is billed for, so both are
 * gated on `modules:manage` — held only by the Owner role by default.
 */
@Controller('modules')
export class ModulesController {
  constructor(private readonly service: ModulesService) {}

  @Get()
  catalog(@Tenant() t: TenantContext) {
    return this.service.catalog(t.organizationId);
  }

  /** Unguarded: every client reads this on boot to build its navigation. */
  @Get('enabled')
  enabled(@Tenant() t: TenantContext) {
    return { modules: this.service.enabled(t) };
  }

  @Post(':key/enable')
  @RequirePermissions('modules:manage')
  enable(
    @Tenant() t: TenantContext,
    @Param('key') key: string,
    @Body(new ZodBody(enableModuleSchema)) dto: EnableModuleDto,
  ) {
    return this.service.enable(t.organizationId, key, dto);
  }

  @Post(':key/disable')
  @RequirePermissions('modules:manage')
  disable(@Tenant() t: TenantContext, @Param('key') key: string) {
    return this.service.disable(t.organizationId, key);
  }
}

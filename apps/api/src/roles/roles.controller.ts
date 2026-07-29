import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  createRoleSchema,
  updateRoleSchema,
  type CreateRoleDto,
  type UpdateRoleDto,
} from '@mentivax/core';
import { ZodBody } from '../common/zod-body.pipe';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { RequirePermissions } from '../auth/auth.decorators';
import { RolesService } from './roles.service';

/** Roles and their permission grants, scoped to the active school. */
@Controller('roles')
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get()
  @RequirePermissions('roles:read')
  list(@Tenant() t: TenantContext) {
    return this.service.list(t);
  }

  /** The permission checklist the roles editor renders. */
  @Get('permissions')
  @RequirePermissions('roles:read')
  catalog(@Tenant() t: TenantContext) {
    return this.service.catalog(t);
  }

  @Post()
  @RequirePermissions('roles:write')
  create(@Tenant() t: TenantContext, @Body(new ZodBody(createRoleSchema)) dto: CreateRoleDto) {
    return this.service.create(t, dto);
  }

  @Patch(':id')
  @RequirePermissions('roles:write')
  update(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(updateRoleSchema)) dto: UpdateRoleDto,
  ) {
    return this.service.update(t, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('roles:write')
  remove(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.remove(t, id);
  }
}

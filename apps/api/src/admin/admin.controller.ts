import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  createOrganizationSchema,
  enableModuleSchema,
  updateOrganizationSchema,
  type CreateOrganizationDto,
  type EnableModuleDto,
  type UpdateOrganizationDto,
} from '@mentivax/core';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, PlatformAdminOnly } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { ModulesService } from '../modules/modules.service';
import { AdminService } from './admin.service';

/**
 * The SaaS-operator console. Cross-tenant by design, so these routes sit
 * outside TenantMiddleware and take an explicit organization id.
 *
 * `@PlatformAdminOnly()` on the class means every route here is unreachable
 * without `User.isPlatformAdmin` — no school member can call them regardless of
 * the roles their org has defined.
 */
@Controller('admin')
@PlatformAdminOnly()
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly modules: ModulesService,
  ) {}

  // --- Organizations ---------------------------------------------------------

  @Get('organizations')
  listOrganizations() {
    return this.admin.listOrganizations();
  }

  @Get('organizations/:id')
  getOrganization(@Param('id') id: string) {
    return this.admin.getOrganization(id);
  }

  @Post('organizations')
  createOrganization(@Body(new ZodBody(createOrganizationSchema)) dto: CreateOrganizationDto) {
    return this.admin.createOrganization(dto);
  }

  @Patch('organizations/:id')
  updateOrganization(
    @Param('id') id: string,
    @Body(new ZodBody(updateOrganizationSchema)) dto: UpdateOrganizationDto,
  ) {
    return this.admin.updateOrganization(id, dto);
  }

  // --- Per-tenant module entitlements ---------------------------------------

  @Get('organizations/:id/modules')
  orgModules(@Param('id') id: string) {
    return this.modules.catalog(id);
  }

  @Post('organizations/:id/modules/:key/enable')
  enableModule(
    @Param('id') id: string,
    @Param('key') key: string,
    @Body(new ZodBody(enableModuleSchema)) dto: EnableModuleDto,
  ) {
    return this.modules.enable(id, key, dto);
  }

  @Post('organizations/:id/modules/:key/disable')
  disableModule(@Param('id') id: string, @Param('key') key: string) {
    return this.modules.disable(id, key);
  }

  // --- Users -----------------------------------------------------------------

  @Get('users')
  listUsers() {
    return this.admin.listUsers();
  }

  @Patch('users/:id/active')
  setUserActive(
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
    @CurrentUser() actor: AuthUser,
  ) {
    return this.admin.setUserActive(id, body?.isActive !== false, actor.id);
  }
}

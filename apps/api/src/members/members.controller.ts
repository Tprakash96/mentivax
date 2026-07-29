import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  createMemberSchema,
  resetMemberPasswordSchema,
  updateMemberSchema,
  type CreateMemberDto,
  type ResetMemberPasswordDto,
  type UpdateMemberDto,
} from '@mentivax/core';
import { ZodBody } from '../common/zod-body.pipe';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { RequirePermissions } from '../auth/auth.decorators';
import { MembersService } from './members.service';

/** Staff accounts for the active school. */
@Controller('members')
export class MembersController {
  constructor(private readonly service: MembersService) {}

  @Get()
  @RequirePermissions('members:read')
  list(@Tenant() t: TenantContext) {
    return this.service.list(t);
  }

  @Post()
  @RequirePermissions('members:write')
  create(@Tenant() t: TenantContext, @Body(new ZodBody(createMemberSchema)) dto: CreateMemberDto) {
    return this.service.create(t, dto);
  }

  @Patch(':id')
  @RequirePermissions('members:write')
  update(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(updateMemberSchema)) dto: UpdateMemberDto,
  ) {
    return this.service.update(t, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('members:write')
  remove(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.remove(t, id);
  }

  @Post(':id/reset-password')
  @RequirePermissions('members:write')
  resetPassword(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(resetMemberPasswordSchema)) dto: ResetMemberPasswordDto,
  ) {
    return this.service.resetPassword(t, id, dto.newPassword);
  }
}

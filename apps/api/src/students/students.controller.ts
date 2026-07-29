import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createStudentSchema,
  updateStudentTransportSchema,
  type CreateStudentDto,
  type UpdateStudentTransportDto,
} from '@mentivax/core';
import { ZodBody } from '../common/zod-body.pipe';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { RequirePermissions } from '../auth/auth.decorators';
import { StudentsService } from './students.service';

@Controller('students')
export class StudentsController {
  constructor(private readonly service: StudentsService) {}

  @Get()
  @RequirePermissions('students:read')
  list(
    @Tenant() t: TenantContext,
    @Query('classId') classId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.service.list(t, { classId, status, search });
  }

  @Get(':id')
  @RequirePermissions('students:read')
  get(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.get(t, id);
  }

  @Post()
  @RequirePermissions('students:write')
  create(@Tenant() t: TenantContext, @Body(new ZodBody(createStudentSchema)) dto: CreateStudentDto) {
    return this.service.create(t, dto);
  }

  /** Assign or clear a student's transport stop + shift. */
  @Patch(':id/transport')
  @RequirePermissions('students:write')
  assignTransport(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(updateStudentTransportSchema)) dto: UpdateStudentTransportDto,
  ) {
    return this.service.assignTransport(t, id, dto);
  }
}

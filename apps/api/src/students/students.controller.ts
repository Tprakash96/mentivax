import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { createStudentSchema, type CreateStudentDto } from '@mentivax/core';
import { ZodBody } from '../common/zod-body.pipe';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { StudentsService } from './students.service';

@Controller('students')
export class StudentsController {
  constructor(private readonly service: StudentsService) {}

  @Get()
  list(
    @Tenant() t: TenantContext,
    @Query('classId') classId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.service.list(t, { classId, status, search });
  }

  @Get(':id')
  get(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.get(t, id);
  }

  @Post()
  create(@Tenant() t: TenantContext, @Body(new ZodBody(createStudentSchema)) dto: CreateStudentDto) {
    return this.service.create(t, dto);
  }
}

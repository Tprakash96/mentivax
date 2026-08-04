import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  createDocumentTypeSchema,
  updateDocumentTypeSchema,
  type CreateDocumentTypeDto,
  type UpdateDocumentTypeDto,
} from '@mentivax/core';
import { ZodBody } from '../common/zod-body.pipe';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { RequirePermissions } from '../auth/auth.decorators';
import { DocumentTypesService } from './document-types.service';

@Controller('document-types')
export class DocumentTypesController {
  constructor(private readonly service: DocumentTypesService) {}

  @Get()
  @RequirePermissions('students:read')
  list(@Tenant() t: TenantContext) {
    return this.service.list(t);
  }

  @Post()
  @RequirePermissions('students:write')
  create(@Tenant() t: TenantContext, @Body(new ZodBody(createDocumentTypeSchema)) dto: CreateDocumentTypeDto) {
    return this.service.create(t, dto);
  }

  @Patch(':id')
  @RequirePermissions('students:write')
  update(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(updateDocumentTypeSchema)) dto: UpdateDocumentTypeDto,
  ) {
    return this.service.update(t, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('students:write')
  remove(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.remove(t, id);
  }
}

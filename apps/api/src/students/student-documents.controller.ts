import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import {
  confirmDocumentSchema,
  presignDocumentSchema,
  type ConfirmDocumentDto,
  type PresignDocumentDto,
} from '@mentivax/core';
import { ZodBody } from '../common/zod-body.pipe';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContext } from '../tenant/tenant.types';
import { RequirePermissions } from '../auth/auth.decorators';
import { StudentDocumentsService } from './student-documents.service';

@Controller('students/:id/documents')
export class StudentDocumentsController {
  constructor(private readonly service: StudentDocumentsService) {}

  @Get()
  @RequirePermissions('students:read')
  list(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.service.list(t, id);
  }

  @Post('presign')
  @RequirePermissions('students:write')
  presign(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(presignDocumentSchema)) dto: PresignDocumentDto,
  ) {
    return this.service.presign(t, id, dto);
  }

  @Post()
  @RequirePermissions('students:write')
  confirm(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodBody(confirmDocumentSchema)) dto: ConfirmDocumentDto,
  ) {
    return this.service.confirm(t, id, dto);
  }

  @Get(':docId/url')
  @RequirePermissions('students:read')
  downloadUrl(@Tenant() t: TenantContext, @Param('id') id: string, @Param('docId') docId: string) {
    return this.service.downloadUrl(t, id, docId);
  }

  @Delete(':docId')
  @RequirePermissions('students:write')
  remove(@Tenant() t: TenantContext, @Param('id') id: string, @Param('docId') docId: string) {
    return this.service.remove(t, id, docId);
  }
}

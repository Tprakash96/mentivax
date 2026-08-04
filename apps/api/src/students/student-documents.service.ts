import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ConfirmDocumentDto, PresignDocumentDto } from '@mentivax/core';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import type { TenantContext } from '../tenant/tenant.types';

/** Safe file name (keep extension); collapse anything odd to '-'. */
const safeName = (s: string) =>
  s.normalize('NFKD').replace(/[^\w.\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'file';
/** Safe folder segment (no dots/slashes). */
const folder = (s: string) => (s || '').replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '') || 'na';

interface DocRecord {
  id: string;
  docType: string;
  fileName: string;
  sizeBytes: number;
  contentType: string;
  uploadedAt: Date;
}

@Injectable()
export class StudentDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  configured(): boolean {
    return this.s3.isConfigured();
  }

  private async student(t: TenantContext, id: string) {
    const s = await this.prisma.student.findFirst({ where: { id, organizationId: t.organizationId } });
    if (!s) throw new NotFoundException('Student not found');
    return s;
  }

  /** Folder prefix: `{admissionYear}/{admissionNo}/`. */
  private prefix(t: TenantContext, admissionNo: string, studentId: string): string {
    return `${folder(t.academicYearLabel || 'year')}/${folder(admissionNo || studentId)}/`;
  }

  private toDto(d: DocRecord) {
    return {
      id: d.id,
      docType: d.docType,
      fileName: d.fileName,
      sizeBytes: d.sizeBytes,
      contentType: d.contentType,
      uploadedAt: d.uploadedAt.toISOString(),
    };
  }

  async presign(t: TenantContext, studentId: string, dto: PresignDocumentDto) {
    const s = await this.student(t, studentId);
    const s3Key = `${this.prefix(t, s.admissionNo, s.id)}${Date.now()}-${safeName(dto.fileName)}`;
    const uploadUrl = await this.s3.presignUpload(s3Key, dto.contentType || 'application/octet-stream');
    return { uploadUrl, s3Key };
  }

  async confirm(t: TenantContext, studentId: string, dto: ConfirmDocumentDto) {
    const s = await this.student(t, studentId);
    // The key must live inside this student's folder (defence against tampering).
    if (!dto.s3Key.startsWith(this.prefix(t, s.admissionNo, s.id))) {
      throw new BadRequestException('Storage key does not belong to this student');
    }
    const doc = await this.prisma.studentDocument.create({
      data: {
        organizationId: t.organizationId,
        studentId,
        docType: dto.docType,
        fileName: dto.fileName,
        s3Key: dto.s3Key,
        sizeBytes: dto.sizeBytes ?? 0,
        contentType: dto.contentType ?? '',
      },
    });
    return this.toDto(doc);
  }

  async list(t: TenantContext, studentId: string) {
    await this.student(t, studentId);
    const rows = await this.prisma.studentDocument.findMany({
      where: { studentId, organizationId: t.organizationId },
      orderBy: { uploadedAt: 'desc' },
    });
    return { configured: this.configured(), files: rows.map((r) => this.toDto(r)) };
  }

  async downloadUrl(t: TenantContext, studentId: string, docId: string) {
    const doc = await this.prisma.studentDocument.findFirst({
      where: { id: docId, studentId, organizationId: t.organizationId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return { url: await this.s3.presignDownload(doc.s3Key, doc.fileName) };
  }

  async remove(t: TenantContext, studentId: string, docId: string) {
    const doc = await this.prisma.studentDocument.findFirst({
      where: { id: docId, studentId, organizationId: t.organizationId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    try {
      await this.s3.delete(doc.s3Key);
    } catch {
      /* best effort — still remove the record */
    }
    await this.prisma.studentDocument.delete({ where: { id: docId } });
  }
}

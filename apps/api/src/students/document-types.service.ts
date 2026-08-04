import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateDocumentTypeDto, UpdateDocumentTypeDto } from '@mentivax/core';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';

/** The checklist a school starts with (it can add/remove/require any of these). */
const DEFAULTS: { name: string; required: boolean }[] = [
  { name: 'Birth certificate', required: true },
  { name: 'Aadhaar', required: true },
  { name: 'Transfer certificate', required: false },
  { name: 'Community certificate', required: true },
  { name: 'Previous marksheet', required: false },
  { name: 'Student photo', required: true },
  { name: 'Address proof', required: false },
  { name: 'Medical record', required: false },
];

@Injectable()
export class DocumentTypesService {
  constructor(private readonly prisma: PrismaService) {}

  private org(t: TenantContext) {
    return { organizationId: t.organizationId };
  }

  private async ensureSeed(t: TenantContext) {
    const count = await this.prisma.documentType.count({ where: this.org(t) });
    if (count > 0) return;
    await this.prisma.documentType.createMany({
      data: DEFAULTS.map((d, i) => ({ ...d, rank: i, organizationId: t.organizationId })),
    });
  }

  async list(t: TenantContext) {
    await this.ensureSeed(t);
    const rows = await this.prisma.documentType.findMany({ where: this.org(t), orderBy: { rank: 'asc' } });
    return rows.map((r) => ({ id: r.id, name: r.name, required: r.required, rank: r.rank }));
  }

  async create(t: TenantContext, dto: CreateDocumentTypeDto) {
    const max = await this.prisma.documentType.aggregate({ where: this.org(t), _max: { rank: true } });
    const r = await this.prisma.documentType.create({
      data: { organizationId: t.organizationId, name: dto.name.trim(), required: dto.required ?? false, rank: (max._max.rank ?? -1) + 1 },
    });
    return { id: r.id, name: r.name, required: r.required, rank: r.rank };
  }

  async update(t: TenantContext, id: string, dto: UpdateDocumentTypeDto) {
    const existing = await this.prisma.documentType.findFirst({ where: { id, ...this.org(t) } });
    if (!existing) throw new NotFoundException('Document type not found');
    const r = await this.prisma.documentType.update({
      where: { id },
      data: { name: dto.name?.trim() ?? undefined, required: dto.required ?? undefined },
    });
    return { id: r.id, name: r.name, required: r.required, rank: r.rank };
  }

  async remove(t: TenantContext, id: string) {
    const existing = await this.prisma.documentType.findFirst({ where: { id, ...this.org(t) } });
    if (!existing) throw new NotFoundException('Document type not found');
    await this.prisma.documentType.delete({ where: { id } });
  }
}

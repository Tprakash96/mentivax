import { Controller, Get, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Org membership + academic years. In this scaffold (auth stubbed) we return
 * all organizations; with real auth this becomes "orgs the user belongs to".
 */
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listMine() {
    const orgs = await this.prisma.organization.findMany({ orderBy: { createdAt: 'asc' } });
    return orgs.map((o) => ({
      id: o.id,
      slug: o.slug,
      name: o.name,
      shortCode: o.shortCode,
      currency: o.currency,
    }));
  }

  @Get(':id/academic-years')
  async years(@Param('id') id: string) {
    const years = await this.prisma.academicYear.findMany({
      where: { organizationId: id },
      orderBy: { startDate: 'desc' },
    });
    return years.map((y) => ({ id: y.id, label: y.label, isActive: y.isActive }));
  }
}

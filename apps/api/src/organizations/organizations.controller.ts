import { Controller, ForbiddenException, Get, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';

/**
 * The org switcher. Not tenant-scoped — this is what the client calls *before*
 * it knows which organization to work in.
 */
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The schools this user may enter. Platform admins see every tenant so they
   * can drop into any school to support it; everyone else sees only the orgs
   * they hold an active membership in.
   */
  @Get()
  async listMine(@CurrentUser() user: AuthUser) {
    const orgs = await this.prisma.organization.findMany({
      where: user.isPlatformAdmin
        ? { isActive: true }
        : { isActive: true, memberships: { some: { userId: user.id, isActive: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return orgs.map((o) => ({
      id: o.id,
      slug: o.slug,
      name: o.name,
      shortCode: o.shortCode,
      currency: o.currency,
    }));
  }

  @Get(':id/academic-years')
  async years(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    if (!user.isPlatformAdmin) {
      const member = await this.prisma.membership.findFirst({
        where: { userId: user.id, organizationId: id, isActive: true },
        select: { id: true },
      });
      if (!member) throw new ForbiddenException('You do not have access to this organization.');
    }

    const years = await this.prisma.academicYear.findMany({
      where: { organizationId: id },
      orderBy: { startDate: 'desc' },
    });
    return years.map((y) => ({ id: y.id, label: y.label, isActive: y.isActive }));
  }
}

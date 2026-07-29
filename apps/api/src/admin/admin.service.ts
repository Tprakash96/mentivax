import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  MODULE_MAP,
  OWNER_ROLE_KEY,
  isValidModuleKey,
  type CreateOrganizationDto,
  type UpdateOrganizationDto,
} from '@mentivax/core';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { RbacService } from '../rbac/rbac.service';

export interface AdminOrgSummary {
  id: string;
  slug: string;
  name: string;
  shortCode: string;
  currency: string;
  isActive: boolean;
  createdAt: string;
  memberCount: number;
  studentCount: number;
  /** Enabled non-core module keys, for the tenant list. */
  modules: string[];
  activeYear: string | null;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly rbac: RbacService,
  ) {}

  // --- Organizations ---------------------------------------------------------

  async listOrganizations(): Promise<AdminOrgSummary[]> {
    const now = new Date();
    const orgs = await this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        modules: true,
        academicYears: { where: { isActive: true }, take: 1 },
        _count: { select: { memberships: true, students: true } },
      },
    });

    return orgs.map((o) => ({
      id: o.id,
      slug: o.slug,
      name: o.name,
      shortCode: o.shortCode,
      currency: o.currency,
      isActive: o.isActive,
      createdAt: o.createdAt.toISOString(),
      memberCount: o._count.memberships,
      studentCount: o._count.students,
      modules: o.modules
        .filter(
          (m) =>
            (m.status === 'ACTIVE' || m.status === 'TRIAL') &&
            (m.expiresAt === null || m.expiresAt > now),
        )
        .map((m) => m.moduleKey),
      activeYear: o.academicYears[0]?.label ?? null,
    }));
  }

  async getOrganization(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        modules: true,
        academicYears: { orderBy: { startDate: 'desc' } },
        memberships: {
          include: { user: true, role: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!org) throw new NotFoundException(`Organization ${id} not found`);

    return {
      id: org.id,
      slug: org.slug,
      name: org.name,
      shortCode: org.shortCode,
      currency: org.currency,
      timezone: org.timezone,
      isActive: org.isActive,
      createdAt: org.createdAt.toISOString(),
      academicYears: org.academicYears.map((y) => ({
        id: y.id,
        label: y.label,
        isActive: y.isActive,
      })),
      members: org.memberships.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        roleId: m.roleId,
        roleName: m.role.name,
        roleKey: m.role.key,
        isActive: m.isActive && m.user.isActive,
        lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * Provisions a new school: the organization, its copy of the system roles,
   * the first academic year, the owner account, and the purchased modules.
   *
   * All of it runs in one transaction — a half-provisioned org (no roles, or no
   * academic year) cannot be signed into, so partial success is worse than
   * failure.
   */
  async createOrganization(dto: CreateOrganizationDto) {
    const existingSlug = await this.prisma.organization.findUnique({ where: { slug: dto.slug } });
    if (existingSlug) throw new ConflictException(`The slug "${dto.slug}" is already taken`);

    for (const key of dto.modules) {
      if (!isValidModuleKey(key)) throw new BadRequestException(`Unknown module "${key}"`);
    }

    // Modules whose dependencies were not also requested would leave the org in
    // an invalid state, so resolve the closure up front.
    const requested = new Set(dto.modules);
    for (const key of dto.modules) {
      for (const dep of MODULE_MAP[key]?.dependsOn ?? []) requested.add(dep);
    }

    const existingUser = await this.prisma.user.findFirst({
      where: { email: { equals: dto.owner.email, mode: 'insensitive' } },
    });
    const passwordHash = await this.passwords.hash(dto.owner.password);

    const start = new Date(dto.academicYear.startDate);
    const end = new Date(dto.academicYear.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Academic year dates are invalid');
    }
    if (end <= start) throw new BadRequestException('Academic year must end after it starts');

    const orgId = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          slug: dto.slug,
          name: dto.name,
          shortCode: dto.shortCode.toUpperCase(),
          currency: dto.currency,
          timezone: dto.timezone,
        },
      });

      const roleIds = await this.rbac.provisionSystemRoles(tx, org.id);
      const ownerRoleId = roleIds[OWNER_ROLE_KEY];
      if (!ownerRoleId) throw new Error('Owner role missing from the system role catalog');

      // Attach an existing account rather than failing on the unique email —
      // one person can run more than one school.
      const user =
        existingUser ??
        (await tx.user.create({
          data: { email: dto.owner.email, name: dto.owner.name, passwordHash },
        }));

      await tx.membership.create({
        data: { userId: user.id, organizationId: org.id, roleId: ownerRoleId },
      });

      await tx.academicYear.create({
        data: {
          organizationId: org.id,
          label: dto.academicYear.label,
          startDate: start,
          endDate: end,
          isActive: true,
        },
      });

      if (requested.size) {
        await tx.organizationModule.createMany({
          data: [...requested].map((moduleKey) => ({
            organizationId: org.id,
            moduleKey,
            status: 'ACTIVE' as const,
          })),
          skipDuplicates: true,
        });
      }

      return org.id;
    });

    return this.getOrganization(orgId);
  }

  async updateOrganization(id: string, dto: UpdateOrganizationDto) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException(`Organization ${id} not found`);

    await this.prisma.organization.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.shortCode !== undefined ? { shortCode: dto.shortCode.toUpperCase() } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    return this.getOrganization(id);
  }

  // --- Users -----------------------------------------------------------------

  /** Every account on the platform, with the schools each can enter. */
  async listUsers() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        memberships: {
          include: { organization: { select: { name: true, shortCode: true } }, role: true },
        },
      },
    });

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      isPlatformAdmin: u.isPlatformAdmin,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      organizations: u.memberships.map((m) => ({
        organizationId: m.organizationId,
        name: m.organization.name,
        shortCode: m.organization.shortCode,
        roleName: m.role.name,
      })),
    }));
  }

  /** Suspends or restores an account across every school it belongs to. */
  async setUserActive(userId: string, isActive: boolean, actingUserId: string) {
    if (userId === actingUserId && !isActive) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    await this.prisma.user.update({ where: { id: userId }, data: { isActive } });
    // A suspended user must lose their live sessions, not just future logins.
    if (!isActive) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { ok: true as const };
  }
}

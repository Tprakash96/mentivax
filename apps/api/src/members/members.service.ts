import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OWNER_ROLE_KEY, type CreateMemberDto, type UpdateMemberDto } from '@mentivax/core';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import type { TenantContext } from '../tenant/tenant.types';

export interface MemberView {
  id: string;
  userId: string;
  name: string;
  email: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  /** True when this row is the caller — the UI disables self-destructive acts. */
  isSelf: boolean;
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async list(t: TenantContext): Promise<MemberView[]> {
    const rows = await this.prisma.membership.findMany({
      where: { organizationId: t.organizationId },
      include: { user: true, role: true },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      roleId: m.roleId,
      roleKey: m.role.key,
      roleName: m.role.name,
      isActive: m.isActive && m.user.isActive,
      lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
      isSelf: m.userId === t.userId,
    }));
  }

  /**
   * Adds a staff account to this school.
   *
   * If the email already belongs to a Mentivax account, that account is
   * attached instead of being duplicated — a person can work at several
   * schools under one login.
   */
  async create(t: TenantContext, dto: CreateMemberDto): Promise<MemberView[]> {
    const role = await this.requireOrgRole(t.organizationId, dto.roleId);

    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: dto.email, mode: 'insensitive' } },
    });

    if (existing) {
      const alreadyMember = await this.prisma.membership.findUnique({
        where: { userId_organizationId: { userId: existing.id, organizationId: t.organizationId } },
      });
      if (alreadyMember) {
        throw new ConflictException(`${dto.email} is already a member of this school`);
      }
      await this.prisma.membership.create({
        data: { userId: existing.id, organizationId: t.organizationId, roleId: role.id },
      });
      return this.list(t);
    }

    if (!dto.password) {
      throw new BadRequestException({
        message: 'A password is required to create a new account',
        issues: [{ path: 'password', message: 'Set an initial password for this user' }],
      });
    }

    await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash: await this.passwords.hash(dto.password),
        memberships: { create: { organizationId: t.organizationId, roleId: role.id } },
      },
    });

    return this.list(t);
  }

  async update(t: TenantContext, membershipId: string, dto: UpdateMemberDto): Promise<MemberView[]> {
    const membership = await this.requireMembership(t.organizationId, membershipId);

    if (dto.roleId && dto.roleId !== membership.roleId) {
      await this.requireOrgRole(t.organizationId, dto.roleId);
      await this.assertNotLastOwner(t, membership.id, 'change the role of');
    }
    if (dto.isActive === false) {
      await this.assertNotLastOwner(t, membership.id, 'deactivate');
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.roleId || dto.isActive !== undefined) {
        await tx.membership.update({
          where: { id: membership.id },
          data: {
            ...(dto.roleId ? { roleId: dto.roleId } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
        });
      }
      if (dto.name) {
        await tx.user.update({ where: { id: membership.userId }, data: { name: dto.name } });
      }
    });

    return this.list(t);
  }

  /** Removes someone from this school. Their account and history survive. */
  async remove(t: TenantContext, membershipId: string): Promise<MemberView[]> {
    const membership = await this.requireMembership(t.organizationId, membershipId);
    if (membership.userId === t.userId) {
      throw new BadRequestException('You cannot remove yourself from this school');
    }
    await this.assertNotLastOwner(t, membership.id, 'remove');

    await this.prisma.membership.delete({ where: { id: membership.id } });
    return this.list(t);
  }

  /** Owner-initiated password reset for a member who is locked out. */
  async resetPassword(t: TenantContext, membershipId: string, newPassword: string) {
    const membership = await this.requireMembership(t.organizationId, membershipId);

    await this.prisma.user.update({
      where: { id: membership.userId },
      data: { passwordHash: await this.passwords.hash(newPassword) },
    });
    // Force every existing session for that user to re-authenticate.
    await this.prisma.refreshToken.updateMany({
      where: { userId: membership.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { ok: true as const };
  }

  // --- Guards ----------------------------------------------------------------

  private async requireMembership(organizationId: string, membershipId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, organizationId },
      include: { role: true },
    });
    if (!membership) throw new NotFoundException('That team member is not part of this school');
    return membership;
  }

  private async requireOrgRole(organizationId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, organizationId } });
    if (!role) throw new NotFoundException('That role does not exist in this school');
    return role;
  }

  /**
   * An organization with no active owner is unadministrable — nobody could
   * restore module entitlements or re-grant roles. Block the last one leaving.
   */
  private async assertNotLastOwner(t: TenantContext, membershipId: string, action: string) {
    const target = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: { role: true },
    });
    if (target?.role.key !== OWNER_ROLE_KEY || !target.isActive) return;

    const otherOwners = await this.prisma.membership.count({
      where: {
        organizationId: t.organizationId,
        isActive: true,
        id: { not: membershipId },
        role: { key: OWNER_ROLE_KEY },
      },
    });
    if (otherOwners === 0) {
      throw new ForbiddenException(
        `You cannot ${action} the last owner — promote another member to Owner first.`,
      );
    }
  }
}

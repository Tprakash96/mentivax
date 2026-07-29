import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  permissionsForModules,
  type CreateRoleDto,
  type UpdateRoleDto,
} from '@mentivax/core';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';

export interface RoleView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  /** How many people currently hold this role — blocks deletion when > 0. */
  memberCount: number;
}

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(t: TenantContext): Promise<RoleView[]> {
    const roles = await this.prisma.role.findMany({
      where: { organizationId: t.organizationId },
      include: { permissions: true, _count: { select: { memberships: true } } },
      // System roles first (owner → viewer as provisioned), then custom by name.
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });

    return roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.permissions.map((p) => p.permission),
      memberCount: r._count.memberships,
    }));
  }

  /**
   * The permission catalog for the roles editor, limited to modules this school
   * has plugged in — there is no point offering "Record payments" to a school
   * without the Fees module.
   */
  catalog(t: TenantContext) {
    const available = permissionsForModules(t.enabledModules);
    return {
      groups: PERMISSION_GROUPS.filter((g) => available.some((p) => p.group === g)).map((group) => ({
        group,
        permissions: available
          .filter((p) => p.group === group)
          .map((p) => ({ key: p.key, name: p.name, description: p.description, module: p.module })),
      })),
      /** Keys hidden because their module is not enabled, for an explanatory note. */
      unavailable: PERMISSIONS.filter((p) => !available.includes(p)).map((p) => p.key),
    };
  }

  async create(t: TenantContext, dto: CreateRoleDto): Promise<RoleView[]> {
    const key = slugify(dto.name);
    if (!key) throw new BadRequestException('Role name must contain letters or numbers');

    const clash = await this.prisma.role.findUnique({
      where: { organizationId_key: { organizationId: t.organizationId, key } },
    });
    if (clash) throw new ConflictException(`A role named "${dto.name}" already exists`);

    await this.prisma.role.create({
      data: {
        organizationId: t.organizationId,
        key,
        name: dto.name,
        description: dto.description ?? null,
        isSystem: false,
        permissions: {
          create: dedupe(dto.permissions).map((permission) => ({ permission })),
        },
      },
    });

    return this.list(t);
  }

  async update(t: TenantContext, roleId: string, dto: UpdateRoleDto): Promise<RoleView[]> {
    const role = await this.requireRole(t.organizationId, roleId);
    if (role.isSystem) {
      throw new BadRequestException(
        `"${role.name}" is a built-in role and cannot be edited. Duplicate it as a custom role instead.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.name !== undefined || dto.description !== undefined) {
        await tx.role.update({
          where: { id: role.id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.description !== undefined ? { description: dto.description } : {}),
          },
        });
      }
      if (dto.permissions) {
        // Replace wholesale — the editor always submits the complete set.
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        const next = dedupe(dto.permissions);
        if (next.length) {
          await tx.rolePermission.createMany({
            data: next.map((permission) => ({ roleId: role.id, permission })),
            skipDuplicates: true,
          });
        }
      }
    });

    return this.list(t);
  }

  async remove(t: TenantContext, roleId: string): Promise<RoleView[]> {
    const role = await this.requireRole(t.organizationId, roleId);
    if (role.isSystem) throw new BadRequestException('Built-in roles cannot be deleted');

    const holders = await this.prisma.membership.count({ where: { roleId: role.id } });
    if (holders > 0) {
      throw new ConflictException(
        `${holders} ${holders === 1 ? 'person holds' : 'people hold'} this role. Move them to another role first.`,
      );
    }

    await this.prisma.role.delete({ where: { id: role.id } });
    return this.list(t);
  }

  private async requireRole(organizationId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, organizationId } });
    if (!role) throw new NotFoundException('That role does not exist in this school');
    return role;
  }
}

const dedupe = (keys: string[]): string[] => [...new Set(keys)];

/** Custom role keys are derived from the name and are stable thereafter. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

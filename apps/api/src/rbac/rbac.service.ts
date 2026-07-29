import { Injectable } from '@nestjs/common';
import type { Prisma } from '@mentivax/db';
import { SYSTEM_ROLES, systemRolePermissions } from '@mentivax/core';
import { PrismaService } from '../prisma/prisma.service';

/** Either the root client or a transaction client — provisioning runs in both. */
type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates this org's copy of every system role from the @mentivax/core
   * catalog. Called once when an organization is provisioned.
   *
   * Returns a map of role key -> role id so the caller can assign the owner.
   */
  async provisionSystemRoles(db: Db, organizationId: string): Promise<Record<string, string>> {
    const byKey: Record<string, string> = {};
    for (const def of SYSTEM_ROLES) {
      const role = await db.role.create({
        data: {
          organizationId,
          key: def.key,
          name: def.name,
          description: def.description,
          isSystem: true,
          permissions: {
            create: systemRolePermissions(def.key).map((permission) => ({ permission })),
          },
        },
      });
      byKey[def.key] = role.id;
    }
    return byKey;
  }

  /**
   * Re-applies the code-defined permission set to every org's system roles.
   *
   * System roles are data, but their contents are owned by code — when a new
   * permission is added to the catalog, existing orgs' Owner/Admin roles must
   * pick it up. Runs on API boot; cheap because it only writes deltas.
   */
  async syncSystemRoles(): Promise<{ rolesChecked: number; permissionsAdded: number; permissionsRemoved: number }> {
    const roles = await this.prisma.role.findMany({
      where: { isSystem: true },
      include: { permissions: true },
    });

    let added = 0;
    let removed = 0;

    for (const role of roles) {
      const expected = new Set(systemRolePermissions(role.key));
      // A system role key that no longer exists in code is left untouched:
      // deleting its grants would silently strip access. Retire it explicitly.
      if (expected.size === 0) continue;

      const current = new Set(role.permissions.map((p) => p.permission));

      const toAdd = [...expected].filter((p) => !current.has(p));
      if (toAdd.length) {
        await this.prisma.rolePermission.createMany({
          data: toAdd.map((permission) => ({ roleId: role.id, permission })),
          skipDuplicates: true,
        });
        added += toAdd.length;
      }

      const toRemove = [...current].filter((p) => !expected.has(p));
      if (toRemove.length) {
        await this.prisma.rolePermission.deleteMany({
          where: { roleId: role.id, permission: { in: toRemove } },
        });
        removed += toRemove.length;
      }
    }

    return { rolesChecked: roles.length, permissionsAdded: added, permissionsRemoved: removed };
  }
}

import { Module, OnModuleInit } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { RbacService } from './rbac.service';

/**
 * RBAC provisioning. Exported so organization creation (platform admin) and
 * the seed path can both build an org's system roles the same way.
 */
@Module({
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule implements OnModuleInit {
  private readonly logger = new Logger(RbacModule.name);

  constructor(private readonly rbac: RbacService) {}

  /** Keep every org's system roles in step with the code-defined catalog. */
  async onModuleInit() {
    try {
      const r = await this.rbac.syncSystemRoles();
      if (r.permissionsAdded || r.permissionsRemoved) {
        this.logger.log(
          `System roles synced: ${r.rolesChecked} roles, +${r.permissionsAdded} / -${r.permissionsRemoved} permissions`,
        );
      }
    } catch (err) {
      // Never block boot on this — a fresh database has no roles yet.
      this.logger.warn(`System role sync skipped: ${(err as Error).message}`);
    }
  }
}

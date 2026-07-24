import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MODULE_MAP } from '@mentivax/core';
import { REQUIRES_MODULE } from './requires-module.decorator';
import type { TenantRequest } from '../tenant/tenant.types';

/**
 * Enforces plug-in / plug-out entitlements. Reads the required module key from
 * `@RequiresModule(...)` metadata and checks it against the tenant's enabled
 * modules (resolved by TenantMiddleware). Rejects with 403 + a structured body
 * the clients use to show an upsell.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string | undefined>(REQUIRES_MODULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const req = context.switchToHttp().getRequest<TenantRequest>();
    const enabled = req.tenant?.enabledModules ?? [];
    if (enabled.includes(required)) return true;

    throw new ForbiddenException({
      error: 'module_not_enabled',
      module: required,
      moduleName: MODULE_MAP[required]?.name ?? required,
      message: `The "${MODULE_MAP[required]?.name ?? required}" module is not enabled for this organization.`,
    });
  }
}

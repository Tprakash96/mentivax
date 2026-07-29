import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_MAP } from '@mentivax/core';
import { REQUIRES_PERMISSIONS } from './auth.decorators';
import type { AuthenticatedRequest } from './auth.types';
import type { TenantRequest } from '../tenant/tenant.types';

/**
 * Global RBAC gate. Reads `@RequirePermissions(...)` metadata and checks it
 * against the permissions TenantMiddleware resolved for this member in the
 * active organization.
 *
 * Platform admins bypass the check — they administer every tenant and hold no
 * Membership rows of their own.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(REQUIRES_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest & TenantRequest>();
    if (req.user?.isPlatformAdmin) return true;

    const granted = new Set(req.tenant?.permissions ?? []);
    const missing = required.filter((p) => !granted.has(p));
    if (missing.length === 0) return true;

    throw new ForbiddenException({
      error: 'permission_denied',
      required,
      missing,
      message: `You do not have permission to ${describe(missing)}.`,
    });
  }
}

/** Turns permission keys into something a school administrator can act on. */
function describe(keys: string[]): string {
  const names = keys.map((k) => PERMISSION_MAP[k]?.name.toLowerCase() ?? k);
  if (names.length === 1) return names[0] as string;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, AuthUser } from './auth.types';

export const IS_PUBLIC = 'mentivax:isPublic';
export const REQUIRES_PERMISSIONS = 'mentivax:requiresPermissions';
export const IS_PLATFORM_ADMIN_ONLY = 'mentivax:platformAdminOnly';

/** Skips the global auth guard. Use for login, refresh, and health. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Requires the caller's role to grant *all* the listed permission keys within
 * the active organization. Keys come from the PERMISSIONS catalog in
 * @mentivax/core. Platform admins bypass this check.
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRES_PERMISSIONS, permissions);

/** Restricts a route to SaaS-operator accounts (User.isPlatformAdmin). */
export const PlatformAdminOnly = () => SetMetadata(IS_PLATFORM_ADMIN_ONLY, true);

/** Injects the authenticated user resolved by AuthMiddleware. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) {
      // Unreachable behind JwtAuthGuard; guards against a route forgetting it.
      throw new Error('CurrentUser used on a route without authentication');
    }
    return req.user;
  },
);

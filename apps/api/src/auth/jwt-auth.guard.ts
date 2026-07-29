import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PLATFORM_ADMIN_ONLY, IS_PUBLIC } from './auth.decorators';
import type { AuthenticatedRequest } from './auth.types';

/**
 * Global authentication gate. Rejects any request that AuthMiddleware could not
 * resolve to a user, unless the route is marked `@Public()`. Also enforces
 * `@PlatformAdminOnly()`, since that check needs no tenant context.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) throw new UnauthorizedException('Authentication required');

    const platformOnly = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PLATFORM_ADMIN_ONLY,
      [context.getHandler(), context.getClass()],
    );
    if (platformOnly && !req.user.isPlatformAdmin) {
      throw new ForbiddenException({
        error: 'platform_admin_required',
        message: 'This action is restricted to Mentivax platform administrators.',
      });
    }

    return true;
  }
}

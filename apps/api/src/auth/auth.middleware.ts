import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

/**
 * Resolves the bearer token into `req.user`, before TenantMiddleware runs.
 *
 * Deliberately never throws: an absent or bad token simply leaves `req.user`
 * undefined so `@Public()` routes still work. JwtAuthGuard is what rejects
 * unauthenticated access to protected routes.
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly auth: AuthService) {}

  async use(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
    const header = req.header('authorization');
    if (header?.startsWith('Bearer ')) {
      const user = await this.auth.verifyAccessToken(header.slice(7).trim());
      if (user) req.user = user;
    }
    next();
  }
}

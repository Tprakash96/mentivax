import type { Request } from 'express';

/** Claims we put in the access token. Keep small — it travels on every request. */
export interface AccessTokenPayload {
  /** User id. */
  sub: string;
  email: string;
  /** Platform-admin flag, so the guard can short-circuit without a DB hit. */
  pa: boolean;
}

/** The authenticated principal, attached by AuthMiddleware. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

import { createParamDecorator, ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import type { TenantContext, TenantRequest } from './tenant.types';

/** Injects the resolved TenantContext into a controller handler. */
export const Tenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const req = ctx.switchToHttp().getRequest<TenantRequest>();
    if (!req.tenant) {
      throw new InternalServerErrorException('Tenant context missing — is TenantMiddleware applied?');
    }
    return req.tenant;
  },
);

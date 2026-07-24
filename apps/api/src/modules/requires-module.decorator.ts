import { SetMetadata } from '@nestjs/common';

export const REQUIRES_MODULE = 'requiresModule';

/**
 * Marks a controller or handler as belonging to a pluggable module. The
 * ModuleGuard rejects the request (403) unless the tenant has that module
 * plugged in. Usage: `@RequiresModule('fees')` on a controller class.
 */
export const RequiresModule = (moduleKey: string) => SetMetadata(REQUIRES_MODULE, moduleKey);

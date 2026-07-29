import { Module } from '@nestjs/common';
import { ModulesController } from './modules.controller';
import { ModulesService } from './modules.service';

@Module({
  controllers: [ModulesController],
  providers: [ModulesService],
  // The platform admin console toggles modules for any tenant through the same
  // dependency-validating service.
  exports: [ModulesService],
})
export class ModulesModule {}

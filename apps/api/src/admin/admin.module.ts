import { Module } from '@nestjs/common';
import { ModulesModule } from '../modules/modules.module';
import { RbacModule } from '../rbac/rbac.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [ModulesModule, RbacModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}

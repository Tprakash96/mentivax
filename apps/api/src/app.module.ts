import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { HealthController } from './health.controller';
import { OrganizationsModule } from './organizations/organizations.module';
import { CatalogModule } from './catalog/catalog.module';
import { FeeStructureModule } from './fee-structure/fee-structure.module';
import { StudentsModule } from './students/students.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { ModulesModule } from './modules/modules.module';

@Module({
  imports: [
    PrismaModule,
    OrganizationsModule,
    ModulesModule,
    CatalogModule,
    FeeStructureModule,
    StudentsModule,
    InvoicesModule,
    PaymentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Tenant resolution runs for every tenant-scoped route. Health and the
    // org-listing endpoint (used to pick an org) are excluded.
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'api/health', method: RequestMethod.ALL },
        { path: 'api/organizations', method: RequestMethod.GET },
        { path: 'api/organizations/(.*)', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}

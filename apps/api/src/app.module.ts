import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { AuthMiddleware } from './auth/auth.middleware';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PermissionsGuard } from './auth/permissions.guard';
import { RbacModule } from './rbac/rbac.module';
import { AdminModule } from './admin/admin.module';
import { MembersModule } from './members/members.module';
import { RolesModule } from './roles/roles.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { CatalogModule } from './catalog/catalog.module';
import { FeeStructureModule } from './fee-structure/fee-structure.module';
import { StudentsModule } from './students/students.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { ModulesModule } from './modules/modules.module';
import { TransportModule } from './transport/transport.module';
import { FinancialYearsModule } from './financial-years/financial-years.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    RbacModule,
    AdminModule,
    MembersModule,
    RolesModule,
    OrganizationsModule,
    ModulesModule,
    CatalogModule,
    FeeStructureModule,
    StudentsModule,
    InvoicesModule,
    PaymentsModule,
    TransportModule,
    FinancialYearsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: authentication first, then RBAC. Both are global so a new
    // controller is protected by default and must opt out via @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Auth runs everywhere (it never rejects — it only resolves req.user), so
    // that @Public routes and guards alike see a consistent principal.
    consumer.apply(AuthMiddleware).forRoutes('*');

    // Tenant resolution runs for tenant-scoped routes only. Health, auth, the
    // org switcher, and the cross-tenant admin console are excluded: they
    // either need no organization or take one explicitly.
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'api/health', method: RequestMethod.ALL },
        { path: 'api/auth/(.*)', method: RequestMethod.ALL },
        { path: 'api/admin/(.*)', method: RequestMethod.ALL },
        { path: 'api/organizations', method: RequestMethod.GET },
        { path: 'api/organizations/(.*)', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}

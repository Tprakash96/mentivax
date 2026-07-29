# CLAUDE.md — Mentivax

Guidance for working in this repo. Read alongside `README.md`.

## What this is

Mentivax is a **multi-tenant School ERP** built as a shared engine. Many schools
(organizations) run on the same codebase and database. The first module is
**Fees** (fee structures → class-billing invoices → payments). More modules
(attendance, communication, reports) will be added on the same foundation.

## Monorepo (pnpm + Turborepo)

```
apps/
  api        NestJS REST API (tenant scoping + fees modules)
  web        React + Vite — the reference UI
  desktop    Electron shell that loads the web build
  mobile     Expo / React Native app
packages/
  core       Framework-agnostic engine: money, fee math, zod DTOs  (@mentivax/core)
  db         Prisma schema + client + seed (PostgreSQL)             (@mentivax/db)
  api-client Typed fetch SDK, shared by all clients                 (@mentivax/api-client)
  ui         Design tokens + theme.css (the green theme)            (@mentivax/ui)
  config     Base tsconfig / eslint / prettier                      (@mentivax/config)
```

Dependency direction: `core` and `db` have no internal deps. `api-client`
depends on `core`. `api` depends on `core` + `db` + `api-client` (for response
types). Frontends depend on `api-client`, `core`, `ui`. Keep it acyclic.

## Non-negotiable conventions

1. **Money is integer paise.** Every monetary value in the DB, API, and
   `api-client` is an integer in minor units (₹1 = 100). Only convert to rupees
   at the UI edge via `formatMoney` / `paiseToRupees` from `@mentivax/core`.
   Never do money math with floats.

2. **All fee/invoice math lives in `@mentivax/core`.** The API and every client
   compute totals through the same functions (`buildStudentLines`,
   `computeDiscount`, `invoiceTotals`, `deriveStatus`, `splitEven`). Do not
   re-implement fee logic in a controller or a component.

3. **Multi-tenancy is by `organizationId`.** Single shared DB; every
   tenant-owned row carries `organizationId`. The API resolves the active org +
   academic year in `TenantMiddleware` (`apps/api/src/tenant`) and hands it to
   handlers via the `@Tenant()` decorator. **Every** query in a service must be
   scoped to `t.organizationId` (and usually `t.academicYearId`). When you add a
   model, add `organizationId` and scope it.

4. **Auth is JWT bearer + rotating refresh tokens.** `AuthMiddleware` resolves
   `Authorization: Bearer …` into `req.user`; it never rejects. The global
   `JwtAuthGuard` does the rejecting, so **every route is protected by default**
   — opt out with `@Public()` (login, refresh, health). Access tokens are short
   (`JWT_ACCESS_TTL`, default 15m); refresh tokens are opaque, stored only as a
   SHA-256 hash, and rotated on every use. Reusing a revoked refresh token is
   treated as a leak and revokes every session for that user. `api-client`
   refreshes transparently on a 401 and de-duplicates concurrent refreshes.

5. **RBAC: permissions are code, roles are data.** The catalog lives in
   `packages/core/src/permissions.ts` (`PERMISSIONS`, keyed `resource:action`)
   — keys are permanent contracts, never rename one. Each permission declares
   the `module` that owns it. Roles are `Role` + `RolePermission` rows **per
   organization**: every org is provisioned with its own copy of `SYSTEM_ROLES`
   (`isSystem`, not editable, resynced from code on API boot by `RbacService`),
   and may add custom roles alongside.
   - **Enforce on the API** with `@RequirePermissions('students:write')`. The
     global `PermissionsGuard` checks it against `t.permissions`. A block
     returns 403 `{error:'permission_denied', missing}`.
   - **Enforce on the web** with `can(key)` from `useApi()` — filter nav and
     wrap routes in `<Gate permission="…">`.
   - **A permission only counts if its module is enabled.** Both the server and
     the client intersect grants with the org's modules, so plugging out Fees
     instantly revokes `payments:write` without touching a single role row.
   - When you add a feature: add its `PERMISSIONS` entries, gate the controllers,
     and add the nav item with both `module` and `permission` set.

6. **Two tiers of administration.** `User.isPlatformAdmin` marks a SaaS operator:
   they administer every tenant via `/api/admin/*` (`@PlatformAdminOnly()`),
   hold no `Membership` rows, bypass `PermissionsGuard`, and see every org in
   the switcher. School staff reach their own org only — `TenantMiddleware`
   403s any `x-organization-id` they have no active membership in. Provisioning
   an org (`AdminService.createOrganization`) creates the org, its system roles,
   its first academic year, and an owner account in **one transaction**; a
   half-provisioned org cannot be signed into.

7. **Tenant-unscoped routes are listed in `TenantMiddleware`.**
   `MiddlewareConsumer.exclude()` proved unreliable against `forRoutes('*')`
   with a global prefix, so the skip list is the explicit `UNSCOPED_PREFIXES`
   constant in `apps/api/src/tenant/tenant.middleware.ts`. Add to it when you
   introduce a route that must work without an organization.

8. **Validation via zod DTOs.** Request bodies validate against schemas in
   `packages/core/src/schemas.ts` using the `ZodBody` pipe. Add new request
   shapes there so the client and server share one definition.

9. **Modules are plug-in / plug-out.** Every feature area is a *module* schools
   buy individually (this platform generalizes a single-school billing app).
   - **Catalog** (what modules exist) is code, in `packages/core/src/modules.ts`
     (`MODULES`): key, deps, `core` flag, indicative price. Keys are permanent
     contracts — never rename one.
   - **Entitlements** (what an org enabled) are data: `OrganizationModule` rows.
     `TenantMiddleware` loads them into `t.enabledModules` (+ always-on core).
   - **Enforce on the API** with `@RequiresModule('fees')` + `@UseGuards(ModuleGuard)`
     on the controller. A blocked call returns 403 `{error:'module_not_enabled', module}`.
   - **Enforce on the web** with `hasModule(key)` from `useApi()` — filter nav and
     wrap routes in `<ModuleGate module="…">`. The Modules page (`/modules`) is the
     marketplace where owners plug modules in/out.
   - Core modules (`students`) are always on and cannot be disabled. Enabling a
     module validates its `dependsOn`; disabling validates dependents.
   - When you add a feature: add a `MODULES` entry, gate its controllers, tie a
     nav item to it, and (if it's not core) it becomes sellable automatically.

## Common commands

```bash
pnpm install
pnpm docker:up            # Postgres on :5432
cp .env.example .env
pnpm db:generate          # prisma client
pnpm db:migrate           # create tables
pnpm db:seed              # demo school: Agaram Global School
                          #   platform admin : admin@mentivax.com  / mentivax123
                          #   school owner   : admin@agaram.school / mentivax123
                          #   accountant     : accounts@agaram.school / mentivax123
pnpm dev                  # api (:4000) + web (:5173) via turbo
pnpm typecheck            # whole repo
pnpm --filter @mentivax/core test
```

Per-app: `pnpm --filter @mentivax/api dev`, `... @mentivax/web dev`, etc.

## API surface (all under `/api`, tenant-scoped unless noted)

- `GET /health` — liveness (`@Public`, not scoped)
- `POST /auth/login`, `POST /auth/refresh` — `@Public`; login returns tokens +
  the schools you may enter and your permissions in each
- `GET /auth/me`, `POST /auth/logout`, `POST /auth/change-password`
- `GET /organizations`, `GET /organizations/:id/academic-years` — org switcher
  (not tenant-scoped; membership-filtered, platform admins see all)
- Platform console (`@PlatformAdminOnly`, cross-tenant, not scoped):
  `GET|POST /admin/organizations`, `GET|PATCH /admin/organizations/:id`,
  `GET /admin/organizations/:id/modules`,
  `POST /admin/organizations/:id/modules/:key/enable|disable`,
  `GET /admin/users`, `PATCH /admin/users/:id/active`
- `GET|POST /members`, `PATCH|DELETE /members/:id`, `POST /members/:id/reset-password`
- `GET|POST /roles`, `PATCH|DELETE /roles/:id`, `GET /roles/permissions`
- `GET /modules`, `GET /modules/enabled`, `POST /modules/:key/enable`, `POST /modules/:key/disable` — marketplace + entitlements
- `GET /classes`, `GET /fee-types`
- (fees routes below require the `fees` module — 403 otherwise)
- `GET /fee-structure?classId=`, `PUT /fee-structure`
- `GET /students`, `GET /students/:id`, `POST /students`
- `GET /invoices`, `GET /invoices/:id`, `POST /invoices/batch/preview`, `POST /invoices/batch`
- `GET /payments`, `GET /payments/summary`, `POST /payments`

The class-billing wizard: `batch/preview` returns server-computed rows/totals;
the web review grid adds per-student discounts; `batch` persists an invoice per
student.

## Gotchas

- Run `pnpm db:generate` after editing `schema.prisma`, or the Prisma client
  types go stale.
- `noUncheckedIndexedAccess` is on — array/record access is `T | undefined`.
- Desktop loads `apps/web/dist` in production, so build web before packaging.
- Mobile (Expo) on a physical device needs the API's LAN IP, not `localhost`.

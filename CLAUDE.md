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
- (reports routes below require the `reports` module + `reports:read`)
- `GET /reports/overview|fee-heads|concessions|transport` — the Reports page tabs
- `POST /reports/ask` — a plain-language question; `POST /reports/ask/plan` runs an
  explicit plan with no model involved

The class-billing wizard: `batch/preview` returns server-computed rows/totals;
the web review grid adds per-student discounts; `batch` persists an invoice per
student.

## Ask (natural-language questions)

The Ask bar on the home page answers questions about the school's own data. It is
open-ended: a question can be about anything in the schema, not a fixed list of
reports. Three tiers, tried in order.

### Tier 1 — the model writes SQL, the database keeps it honest

Gemini is given the real schema (`ask-schema.ts`, generated from Prisma's DMMF so
it cannot drift) and writes **one SELECT**. That SQL is not trusted. It runs as
`mentivax_ask`, created by the `ask_row_level_security` migration:

- The role holds `SELECT` and nothing else, on the tenant tables only.
- Every one of those tables has a row-level policy filtering on `app.org_id`, so a
  query with **no `organizationId` predicate at all** returns only the caller's
  rows, and one naming another school returns nothing.
- `User` and `RefreshToken` are denied outright — credentials are never readable.
- Scope is set with `SET LOCAL`, never `set_config`. This matters: `set_config` is
  callable from inside a SELECT and could re-point `app.org_id` mid-scan (it did,
  when tested), so `ask_block_scope_switching` revokes it from PUBLIC.
- A **new table is unreadable until explicitly granted** — the safe default. Add a
  policy + `GRANT SELECT` when a new module should be askable.

The app's own role owns the tables and is superuser, so RLS does not apply to it:
normal queries are unaffected, and policies are deliberately **not** `FORCE`d.
`AskSqlService` adds containment only — read-only transaction, statement timeout,
row cap, single-statement check. **If that guard were deleted the database would
still hold the line**; that is the property worth preserving. See
`ask-sql.service.test.ts`, which asserts it against two real schools.

A valid query can still answer a subtly different question, so every AI-written
statement is written to the server log alongside the question that produced it.
It is **not** returned to the browser: it names tables and internal ids, and a
school administrator cannot act on it. Callers get `source: 'ai-sql' | 'reader'`
instead, which says which route answered without disclosing anything.

Practicalities learned the hard way:

- **Model chain, not one model.** Gemini's free tier is metered *per model* in
  tens of requests a day, so `GeminiService` walks `DEFAULT_MODELS` and moves on
  when one is rate-limited, remembering it for 15 minutes. Verified against a real
  key: the 2.0-flash family reports a free-tier limit of **zero**, 2.5-flash is
  retired for new keys, and `gemini-3.6-flash` allows ~20.
- **Non-thinking models only.** Writing a SELECT from a schema needs no
  deliberation: the lite models answer in ~1.1–1.4s where `gemini-3.5-flash`
  took 10s and `gemini-3-flash-preview` 15s.
- **Never ask the model to convert units.** Money is formatted to rupees *before*
  it reaches the phrasing call, because asked to divide paise itself it reported
  ₹12,000 as "₹12,00,000".
- **A count is never money.** `looksLikeCount` vetoes both the model's own
  `moneyColumns` declaration and the name heuristic — a `COUNT(*)` aliased
  "Fee-exempt students" was rendered "₹0".
- **One self-repair attempt.** When Postgres rejects the SQL, the error is fed
  back to the model once. The usual cause is a guessed column, which is why
  `ask-schema.ts` spells out the join paths (an invoice reaches its class only
  through Student).

### Tier 2 — the catalog, when there is no model

Older, narrower path kept because it needs no AI. Details below.

1. **Plan** — Gemini reads the catalog in `packages/core/src/ask.ts` (`ASK_DATASETS`)
   and returns a *plan*: dataset, filters, groupBy, sort. Field keys are a
   contract — never rename one, add instead.
2. **Validate & run** — `validateAskPlan` drops anything the catalog didn't
   offer (unknown field, disallowed operator, enum value outside the set), then
   `AskQueryService` compiles it to Prisma with `organizationId` +
   `academicYearId` written by the server. **Scope is not expressible in a plan**,
   which is why a crafted question can only ask a *different allowed question*.
3. **Phrase** — Gemini turns the rows the server fetched into prose.

Consequences worth knowing:

- With no Gemini key (or no quota), `readQuestion` (`packages/core/src/ask-nl.ts`)
  reads the question itself and runs the **same validated query**. It works
  *compositionally* — every word is normalised to a concept (forgiving spelling
  via capped edit distance, then unambiguous prefixes), and the plan is assembled
  from whichever concepts turned up. So word order doesn't matter and
  "pendng dues in 8std" lands on the same plan as "8 STD pending fees". Extend it
  by adding synonyms to `VOCAB`, not by adding sentence patterns.
  - A word in `STOPWORDS` is never *inferred* from, only matched exactly —
    otherwise "how" becomes "how much" and "fee" becomes "fee head".
  - Naming a record type wins over inferring one: "students yet to pay" is a
    question about students, not receipts, even though it contains "pay".
  - Below ~0.34 confidence the question is declined rather than answered, and the
    reading is always shown back to the user (`reading`, `corrections`) so a
    misread question is visible instead of silently trusted.
- Answers carry **page links**: each dataset declares a `route`, and any filter
  with a `param` becomes a query string (`/students?class=8+STD&due=owing`).
  When you add a param, teach the target page to read it *and* show a
  `.linkfilter` chip — a silently filtered list is worse than no filter.
- `POST /reports/ask/plan` runs an explicit plan with no model, which is how to
  test the engine and how to reproduce any answer from its `trace`.
- **Infrastructure detail never reaches the browser.** A missing API key, an
  exhausted quota, a model name — all of that goes to `Logger.warn`
  (`OPERATOR_DIAGNOSIS` in `ask.service.ts`); the user gets a neutral note. A
  school accountant cannot act on "the key has no quota", and shipping it leaks
  how the server is configured. Same on the client: log the exception, render a
  plain message.
- **An answer states its own scope.** `describe()` renders the filters in words
  ("No receipts in July 2026", not "nothing matches") — an empty result that
  doesn't name what it searched reads as a broken feature. When a question isn't
  understood, `understood: false` says so and offers examples instead of passing
  off unrelated totals as the answer.

## Gotchas

- Run `pnpm db:generate` after editing `schema.prisma`, or the Prisma client
  types go stale.
- `noUncheckedIndexedAccess` is on — array/record access is `T | undefined`.
- Desktop loads `apps/web/dist` in production, so build web before packaging.
- Mobile (Expo) on a physical device needs the API's LAN IP, not `localhost`.
- **After adding an export to `api-client` or `core`, restart the web dev server
  with `--force`** (or delete `apps/web/node_modules/.vite`). Vite pre-bundles the
  workspace packages (`optimizeDeps.include`) and does *not* reliably invalidate
  that cache for symlinked deps, so a long-running dev server keeps serving the
  old bundle — the new method shows up as `undefined` at runtime while
  `pnpm typecheck` passes.
- `apps/web/vite.config.ts` loads env from the **repo root**, so the single root
  `.env` drives the API and the clients. `WEB_PORT` pins the dev-server port
  (with `strictPort`) for machines where something else owns 5173.

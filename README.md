# Mentivax

Multi-tenant **School ERP** — a shared engine serving many schools (organizations).
_Less paperwork, more teaching._

The first module is **Fees**: fee structures, class-billing invoices, and payment
collection. It generalizes a single-school billing app into a multi-tenant
platform.

**Modular / plug-in / plug-out:** every feature area is a module a school can buy
individually (Fees, Communication, Reports, Expenses, Attendance, Transport…).
Only `students` is always-on core. The catalog is code (`@mentivax/core` →
`MODULES`); each org's enabled set is data (`OrganizationModule`). The API gates
routes with `@RequiresModule`, and the web app filters nav/routes by entitlement
with a marketplace at `/modules` to turn features on and off. See `CLAUDE.md`.

## Monorepo layout

```
apps/
  api        NestJS backend (REST) — tenant scoping, fees modules
  web        React + Vite web app (primary UI)
  desktop    Electron shell that loads the web build
  mobile     Expo / React Native app
packages/
  core       Framework-agnostic domain engine (fee math, DTOs, zod schemas)
  db         Prisma schema + client + seed (PostgreSQL)
  api-client Typed fetch SDK shared by web / desktop / mobile
  ui         Shared design tokens (the Mentivax green theme)
  config     Base tsconfig / eslint / prettier
```

## Architecture at a glance

- **Multi-tenancy:** single database, every tenant-owned row carries an
  `organizationId`. The API derives the active org from the auth context and
  scopes every query to it. See `apps/api/src/tenant`.
- **Shared engine:** all fee calculations (new/old/common pricing, period
  splitting, discounts, invoice totals) live in `packages/core` so the API and
  every client agree on the numbers.
- **Clients:** web (React) is the reference UI; desktop reuses the web build via
  Electron; mobile (Expo) shares the typed `api-client`.

## Getting started

```bash
# 1. install
pnpm install

# 2. start Postgres
pnpm docker:up

# 3. env
cp .env.example .env

# 4. database
pnpm db:generate
pnpm db:migrate     # creates tables
pnpm db:seed        # loads a demo school (Agaram Global School)

# 5. run everything
pnpm dev            # api + web (and more) via turbo
```

- API: http://localhost:4000
- Web: http://localhost:5173

## Common commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run all apps in dev (turbo) |
| `pnpm build` | Build all packages/apps |
| `pnpm typecheck` | Typecheck the whole repo |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm db:seed` | Reseed demo data |

See `CLAUDE.md` for deeper architecture notes.

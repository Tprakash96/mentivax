/**
 * Ask's SQL execution, against the real development database.
 *
 * These are the tests that matter most in the whole feature: they assert that a
 * *hostile or careless* query — the kind an LLM can produce — cannot read another
 * school. The guarantee is meant to come from Postgres (the `mentivax_ask` role
 * plus row-level policies), not from the guard in `AskSqlService`, so several of
 * these deliberately hand it SQL with no tenant predicate at all.
 *
 * Needs a database: `pnpm docker:up && pnpm db:migrate`, and ASK_DATABASE_URL set
 * (see .env.example). Skips itself, loudly, when that isn't configured.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { AskSqlService } from './ask-sql.service';
import type { TenantContext } from '../tenant/tenant.types';

// The API loads .env through dotenv-cli at runtime; tests read it directly.
function loadRootEnv() {
  try {
    const text = readFileSync(resolve(__dirname, '../../../../.env'), 'utf8');
    for (const line of text.split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const [, key, rawValue] = m;
      if (!key || process.env[key]) continue;
      process.env[key] = (rawValue ?? '').trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // No .env — the guard tests still run.
  }
}

// Loaded at module scope: `it.runIf` is evaluated while tests are collected,
// which happens before any beforeAll hook could set this up.
loadRootEnv();
const HAS_DB = Boolean(process.env.ASK_DATABASE_URL);

const tenant = (organizationId: string): TenantContext =>
  ({ organizationId, academicYearId: 'unused' }) as unknown as TenantContext;

let service: AskSqlService;
let orgs: { id: string; name: string }[] = [];

beforeAll(async () => {
  service = new AskSqlService();
  if (!service.isConfigured()) return;
  // Discover the schools present, as the app's own (unrestricted) role would.
  const { PrismaClient } = await import('@mentivax/db');
  const prisma = new PrismaClient();
  orgs = await prisma.organization.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  await prisma.$disconnect();
});

describe('the guard (fails fast before the database is asked)', () => {
  it('refuses anything that is not a read', async () => {
    for (const sql of [
      'DELETE FROM "Student"',
      'UPDATE "Invoice" SET "paidAmount" = 0',
      'INSERT INTO "Student" (id) VALUES (1)',
      'DROP TABLE "Payment"',
      'ALTER TABLE "Student" DISABLE ROW LEVEL SECURITY',
      'GRANT ALL ON "Student" TO PUBLIC',
    ]) {
      const r = await service.run(tenant('x'.repeat(25)), sql);
      expect(r.ok, sql).toBe(false);
      if (!r.ok) expect(['not-a-select', 'forbidden-keyword']).toContain(r.reason);
    }
  });

  it('refuses a second statement smuggled in', async () => {
    const r = await service.run(tenant('x'.repeat(25)), 'SELECT 1; DROP TABLE "Payment"');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('multiple-statements');
  });

  it('refuses an attempt to re-point the tenant scope', async () => {
    // The database now denies set_config outright, but this must never get that
    // far: it is the one function that could change which school is visible.
    const r = await service.run(
      tenant('x'.repeat(25)),
      `SELECT count(*) FROM "Student" WHERE (SELECT set_config('app.org_id','other',true)) IS NOT NULL`,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('forbidden-keyword');
  });

  it('does not mistake a column name for a keyword', async () => {
    // "created_at" contains "create"; word boundaries must save it.
    const r = await service.run(tenant('x'.repeat(25)), 'SELECT 1 AS "created_at_ok"');
    // Either it ran, or it failed for a database reason — never as a keyword.
    if (!r.ok) expect(r.reason).not.toBe('forbidden-keyword');
  });

  it('allows a CTE', async () => {
    const r = await service.run(tenant('x'.repeat(25)), 'WITH x AS (SELECT 1 AS n) SELECT n FROM x');
    if (!r.ok) expect(r.reason).not.toBe('not-a-select');
  });
});

describe('tenant isolation (enforced by Postgres, not by the guard)', () => {
  it.runIf(HAS_DB)('gives each school only its own students', async () => {
    if (orgs.length < 2) {
      throw new Error('This test needs two schools in the dev database to be meaningful.');
    }
    const counts = new Map<string, number>();
    for (const org of orgs) {
      // Deliberately no organizationId predicate — the policy must supply it.
      const r = await service.run(tenant(org.id), 'SELECT count(*)::int AS "n" FROM "Student"');
      expect(r.ok, org.name).toBe(true);
      if (r.ok) counts.set(org.name, Number(r.rows[0]?.n ?? -1));
    }
    // At least one school has students and at least one sees a different number:
    // proof the same SQL returns different rows per caller.
    const values = [...counts.values()];
    expect(values.every((v) => v >= 0)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(1);
  });

  it.runIf(HAS_DB)('returns nothing when asked for another school by id', async () => {
    if (orgs.length < 2) return;
    const [a, b] = orgs;
    const r = await service.run(
      tenant(a!.id),
      `SELECT count(*)::int AS "n" FROM "Student" WHERE "organizationId" = '${b!.id}'`,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(Number(r.rows[0]?.n)).toBe(0);
  });

  it.runIf(HAS_DB)('cannot read credentials at all', async () => {
    const r = await service.run(tenant(orgs[0]!.id), 'SELECT count(*) FROM "User"');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('failed');
  });

  it.runIf(HAS_DB)('cannot read refresh tokens at all', async () => {
    const r = await service.run(tenant(orgs[0]!.id), 'SELECT count(*) FROM "RefreshToken"');
    expect(r.ok).toBe(false);
  });

  it.runIf(HAS_DB)('sees only its own organization row', async () => {
    const r = await service.run(tenant(orgs[0]!.id), 'SELECT count(*)::int AS "n" FROM "Organization"');
    expect(r.ok).toBe(true);
    if (r.ok) expect(Number(r.rows[0]?.n)).toBe(1);
  });

  it.runIf(HAS_DB)('scopes child tables through their parent', async () => {
    // InvoiceLine has no organizationId of its own.
    for (const org of orgs) {
      const r = await service.run(tenant(org.id), 'SELECT count(*)::int AS "n" FROM "InvoiceLine"');
      expect(r.ok, org.name).toBe(true);
    }
    const empty = await service.run(tenant(orgs.find((o) => o.name.includes('Rival'))?.id ?? orgs[1]!.id), 'SELECT count(*)::int AS "n" FROM "InvoiceLine"');
    if (empty.ok) expect(Number(empty.rows[0]?.n)).toBe(0);
  });

  it('refuses an organization id that is not the expected shape', async () => {
    const r = await service.run(tenant("'; DROP TABLE x --"), 'SELECT 1 AS n');
    expect(r.ok).toBe(false);
  });
});

describe('containment', () => {
  it.runIf(HAS_DB)('caps the rows a single question can pull', async () => {
    const r = await service.run(tenant(orgs[0]!.id), 'SELECT g AS "n" FROM generate_series(1, 5000) g');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows.length).toBe(200);
      expect(r.truncated).toBe(true);
    }
  });

  it.runIf(HAS_DB)('converts counts into JSON-safe numbers', async () => {
    const r = await service.run(tenant(orgs[0]!.id), 'SELECT count(*) AS "n" FROM "Student"');
    expect(r.ok).toBe(true);
    // count(*) is bigint; it must not arrive as a BigInt that JSON cannot encode.
    if (r.ok) expect(typeof r.rows[0]?.n).toBe('number');
  });
});

describe('the questions that motivated this', () => {
  it.runIf(HAS_DB)('answers "who has not submitted the birth certificate"', async () => {
    const agaram = orgs.find((o) => o.name.includes('Agaram'));
    if (!agaram) return;
    const r = await service.run(
      tenant(agaram.id),
      `SELECT s."name" AS "Student", c."name" AS "Class"
       FROM "Student" s JOIN "SchoolClass" c ON c."id" = s."classId"
       WHERE NOT ('Birth certificate' = ANY(s."documents"))
       ORDER BY c."rank", s."name"`,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.columns).toEqual(['Student', 'Class']);
  });

  it.runIf(HAS_DB)('answers "which stops collect more than 50k"', async () => {
    const agaram = orgs.find((o) => o.name.includes('Agaram'));
    if (!agaram) return;
    const r = await service.run(
      tenant(agaram.id),
      `SELECT st."name" AS "Stop", sum(p."amount")::int AS "Collected"
       FROM "TransportStop" st
       JOIN "Student" s ON s."transportStopId" = st."id"
       JOIN "Payment" p ON p."studentId" = s."id" AND p."isActive"
       GROUP BY st."name" HAVING sum(p."amount") > 5000000
       ORDER BY 2 DESC`,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.columns).toEqual(['Stop', 'Collected']);
  });
});

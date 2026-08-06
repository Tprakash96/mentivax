/**
 * Tier 1 of Ask — "the model writes SQL" — end to end, with the model stubbed.
 *
 * The live Gemini key currently has no generateContent quota, so the real
 * generation step cannot be exercised here. Everything *after* it can be, and
 * that is what these tests pin down: given SQL, the service runs it under the
 * caller's scope, shapes the result, formats money, and hands back the statement
 * for audit. When a working key is dropped in, only the stub changes.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AskService } from './ask.service';
import { AskSqlService } from './ask-sql.service';
import { AskQueryService } from './ask-query.service';
import { GeminiService } from './gemini.service';
import { ReportsService } from './reports.service';
import type { TenantContext } from '../tenant/tenant.types';

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
    /* guard tests still run */
  }
}
loadRootEnv();
const HAS_DB = Boolean(process.env.ASK_DATABASE_URL);

let tenant: TenantContext;
let sqlService: AskSqlService;

beforeAll(async () => {
  if (!HAS_DB) return;
  const { PrismaClient } = await import('@mentivax/db');
  const prisma = new PrismaClient();
  const org = await prisma.organization.findFirst({
    where: { name: { contains: 'Agaram' } },
    include: { academicYears: { where: { isActive: true } } },
  });
  await prisma.$disconnect();
  tenant = {
    organizationId: org!.id,
    organizationName: org!.name,
    academicYearId: org!.academicYears[0]!.id,
    academicYearLabel: org!.academicYears[0]!.label,
    academicYearStart: org!.academicYears[0]!.startDate.toISOString(),
    currency: 'INR',
  } as unknown as TenantContext;
  sqlService = new AskSqlService();
});

/** An AskService whose only stubbed part is the model. */
function serviceWith(sql: string, title = 'Riders per van') {
  const gemini = {
    // Tier 1: the step that needs a working key.
    sql: vi.fn().mockResolvedValue({ ok: true, sql, title }),
    // Phrasing unavailable, so the deterministic sentence is used — which is
    // also the harder case to get right.
    answer: vi.fn().mockResolvedValue({ ok: false, reason: 'quota' }),
    plan: vi.fn().mockResolvedValue({ ok: false, reason: 'quota' }),
    isConfigured: () => true,
  } as unknown as GeminiService;

  // Tier 2/3 need these when tier 1 declines, so they are stubbed rather than
  // null — the fall-through tests below depend on that path working.
  const reports = {
    classNames: vi.fn().mockResolvedValue(['Nursery', '8 STD', '10 STD']),
    overview: vi.fn().mockResolvedValue({
      invoiced: 0, collected: 0, pending: 0, concession: 0, collectionRate: 0,
      liveInvoices: 0, pendingStudents: 0, concessionStudents: 0,
    }),
  } as unknown as ReportsService;

  return new AskService(gemini, new AskQueryService(null as never, reports), reports, sqlService);
}

describe.runIf(HAS_DB)('Ask tier 1: answering from AI-written SQL', () => {
  it('answers the question that motivated this — riders per van', async () => {
    // "how many students choose van 1": the route/vehicle a student rides is
    // reachable only by joining Student -> TransportStop -> TransportRoute, which
    // no fixed catalog exposed. Arbitrary SQL does.
    const service = serviceWith(`
      SELECT r."name" AS "Van", r."vehicleNumber" AS "Vehicle", count(s."id")::int AS "Students"
      FROM "TransportRoute" r
      JOIN "TransportStop" st ON st."routeId" = r."id"
      JOIN "Student" s ON s."transportStopId" = st."id"
      GROUP BY r."name", r."vehicleNumber"
      ORDER BY 3 DESC`);

    const answer = await service.ask(tenant, 'how many students choose van 1');
    expect(answer.table).toBeTruthy();
    expect(answer.table!.columns.map((c) => c.key)).toEqual(['Van', 'Vehicle', 'Students']);
    expect(answer.table!.rows.length).toBeGreaterThan(0);
    expect(answer.source).toBe('ai-sql');
  });

  it('answers "who has not submitted the birth certificate"', async () => {
    const service = serviceWith(
      `SELECT s."name" AS "Student", c."name" AS "Class"
       FROM "Student" s JOIN "SchoolClass" c ON c."id" = s."classId"
       WHERE NOT ('Birth certificate' = ANY(s."documents"))
       ORDER BY c."rank", s."name"`,
      'Students missing the birth certificate',
    );
    const answer = await service.ask(tenant, 'who has not submitted the birth certificate');
    expect(answer.table!.columns.map((c) => c.key)).toEqual(['Student', 'Class']);
    expect(answer.reading).toBe('Students missing the birth certificate');
  });

  it('marks money columns from their alias so rupees render as rupees', async () => {
    const service = serviceWith(
      `SELECT st."name" AS "Stop", sum(p."amount")::int AS "Collected"
       FROM "TransportStop" st
       JOIN "Student" s ON s."transportStopId" = st."id"
       JOIN "Payment" p ON p."studentId" = s."id" AND p."isActive"
       GROUP BY st."name" ORDER BY 2 DESC`,
    );
    const answer = await service.ask(tenant, 'which stops collect the most');
    const cols = answer.table!.columns;
    expect(cols.find((c) => c.key === 'Collected')?.money).toBe(true);
    expect(cols.find((c) => c.key === 'Stop')?.money).toBe(false);
  });

  it('never returns the query to the caller', async () => {
    // The statement names tables and internal ids and nobody using the app can
    // act on it, so it stays in the server log. `source` is what callers get.
    const service = serviceWith('SELECT count(*)::int AS "Students" FROM "Student"');
    const answer = await service.ask(tenant, 'how many students');
    expect(answer.source).toBe('ai-sql');
    expect(JSON.stringify(answer)).not.toContain('SELECT');
  });

  it('says nothing matched rather than inventing a figure', async () => {
    const service = serviceWith(
      `SELECT s."name" AS "Student" FROM "Student" s WHERE s."name" = 'Nobody At All'`,
    );
    const answer = await service.ask(tenant, 'is there a student called Nobody At All');
    expect(answer.table!.rows).toEqual([]);
    expect(answer.answer.toLowerCase()).toContain('nothing matched');
  });

  it('falls through when the model writes SQL the database rejects', async () => {
    // A hallucinated column is the common failure. Tier 1 must not throw, and
    // must not pretend: it returns null so a later tier can try.
    const service = serviceWith('SELECT "noSuchColumn" FROM "Student"');
    // Gibberish so the assertion stays about tier 1's fall-through, not about
    // what tier 2 makes of the wording.
    const answer = await service.ask(tenant, 'zzz qqq');
    // A later tier handled it, so the answer is not attributed to AI SQL.
    expect(answer.source).not.toBe('ai-sql');
  });

  it('refuses a destructive statement even when the model proposes one', async () => {
    const service = serviceWith('DELETE FROM "Student"');
    const answer = await service.ask(tenant, 'delete everything');
    expect(answer.source).not.toBe('ai-sql');
  });
});

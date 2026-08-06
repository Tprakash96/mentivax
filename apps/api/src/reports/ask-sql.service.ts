import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@mentivax/db';
import type { TenantContext } from '../tenant/tenant.types';

/** A rejected query, and why. Reasons are for the log, not for the browser. */
export type SqlRefusal =
  | 'not-configured'
  | 'not-a-select'
  | 'multiple-statements'
  | 'forbidden-keyword'
  | 'failed';

export type SqlRun =
  | {
      ok: true;
      /** Column keys in the order the database returned them. */
      columns: string[];
      rows: Record<string, unknown>[];
      /** The statement as executed, for audit. */
      sql: string;
      truncated: boolean;
    }
  | { ok: false; reason: SqlRefusal; detail?: string };

/** Hard ceiling on rows handed back to a question. */
const ROW_CAP = 200;
/** A question should never be able to pin the database. */
const TIMEOUT_MS = 5_000;

/**
 * Anything that isn't reading. The database already refuses all of these — the
 * Ask role holds SELECT and nothing else — so this list is the second lock, not
 * the first. It exists to fail fast with a clear log line, and to stop a
 * confused model from burning a round trip on a statement that cannot work.
 */
const FORBIDDEN = [
  'insert', 'update', 'delete', 'truncate', 'drop', 'alter', 'create', 'grant',
  'revoke', 'comment', 'reindex', 'vacuum', 'analyze', 'cluster', 'copy',
  'call', 'do', 'execute', 'prepare', 'listen', 'notify', 'lock',
  'set', 'reset', 'begin', 'commit', 'rollback', 'savepoint', 'discard',
  'pg_read_file', 'pg_read_binary_file', 'pg_ls_dir', 'pg_sleep', 'dblink',
  'pg_authid', 'pg_shadow', 'current_setting', 'set_config', 'pg_terminate',
];

/**
 * Runs AI-written SQL against the database, safely.
 *
 * The safety here is **not** this class — it is the `mentivax_ask` Postgres role
 * created by the `ask_row_level_security` migration. That role holds SELECT on
 * the tenant tables and nothing else, every one of those tables has a row-level
 * policy filtering on `app.org_id`, and `User`/`RefreshToken` are denied
 * outright. A statement with no `WHERE organizationId` therefore returns only the
 * caller's rows, and one that explicitly names another organization returns
 * nothing. Verified against a second school before this was built.
 *
 * What this class adds is containment: a read-only transaction, a statement
 * timeout, a hard row cap, and a syntactic check so obvious nonsense never
 * reaches the server. If the guard below were removed entirely, the database
 * would still hold the line — that is the property worth having.
 */
@Injectable()
export class AskSqlService {
  private readonly log = new Logger(AskSqlService.name);
  private readonly client: PrismaClient | null;

  constructor() {
    const url = process.env.ASK_DATABASE_URL;
    if (!url) {
      this.client = null;
      return;
    }
    // A separate pool as the restricted role. Deliberately not the app's client:
    // that one is owner and superuser, and would bypass every policy.
    this.client = new PrismaClient({ datasources: { db: { url } }, log: ['error'] });
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  /** Reject anything that isn't a single read. */
  private check(sql: string): { ok: true; sql: string } | { ok: false; reason: SqlRefusal } {
    const trimmed = sql.trim().replace(/;+\s*$/, '');
    if (!trimmed) return { ok: false, reason: 'not-a-select' };

    // One statement only. A `;` anywhere but the very end means a second one.
    if (trimmed.includes(';')) return { ok: false, reason: 'multiple-statements' };

    const head = trimmed.toLowerCase();
    if (!head.startsWith('select') && !head.startsWith('with')) {
      return { ok: false, reason: 'not-a-select' };
    }

    // Word-boundary match so a column called `created_at` isn't read as CREATE.
    const stripped = head.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
    for (const word of FORBIDDEN) {
      if (new RegExp(`(^|[^a-z0-9_])${word}([^a-z0-9_]|$)`).test(stripped)) {
        return { ok: false, reason: 'forbidden-keyword' };
      }
    }
    return { ok: true, sql: trimmed };
  }

  /**
   * Execute `sql` as the caller's organization.
   *
   * The scope is set with `SET LOCAL`, not `set_config()`, and that choice is
   * load-bearing: `set_config` is callable from inside a SELECT, so a query could
   * re-point `app.org_id` at another school mid-scan and read its rows. (It did,
   * when tested.) The `ask_block_scope_switching` migration revokes `set_config`
   * from PUBLIC; `SET LOCAL` is a command rather than a function, so it still
   * works here and cannot be reached from the model's SQL.
   *
   * `LOCAL` also means the scope dies with the transaction, so a pooled
   * connection can never carry one school's scope into another's query.
   */
  async run(t: TenantContext, sql: string): Promise<SqlRun> {
    if (!this.client) return { ok: false, reason: 'not-configured' };

    // `SET LOCAL` takes no parameters, so the value is interpolated — hence a
    // strict shape check first. Organization ids are cuids from our own database,
    // never user input, but this must never become an injection point.
    if (!/^[a-z0-9]{20,32}$/.test(t.organizationId)) {
      this.log.error(`Refusing to set an unexpected organization id: ${t.organizationId}`);
      return { ok: false, reason: 'failed' };
    }

    const checked = this.check(sql);
    if (!checked.ok) {
      this.log.warn(`Refused AI SQL (${checked.reason}): ${sql.slice(0, 200)}`);
      return { ok: false, reason: checked.reason };
    }

    const capped = `SELECT * FROM (${checked.sql}) AS ask_result LIMIT ${ROW_CAP + 1}`;

    try {
      const rows = await this.client.$transaction(
        async (tx) => {
          // Read-only first, so nothing later in the transaction can write even
          // if the role somehow could.
          await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
          await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${TIMEOUT_MS}`);
          await tx.$executeRawUnsafe(`SET LOCAL app.org_id = '${t.organizationId}'`);
          return tx.$queryRawUnsafe<Record<string, unknown>[]>(capped);
        },
        { timeout: TIMEOUT_MS + 2_000 },
      );

      const truncated = rows.length > ROW_CAP;
      const kept = truncated ? rows.slice(0, ROW_CAP) : rows;
      return {
        ok: true,
        columns: Object.keys(kept[0] ?? {}),
        rows: kept.map((r) => this.normalise(r)),
        sql: checked.sql,
        truncated,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      // Expected often enough to be routine: the model wrote SQL that doesn't
      // compile against the real schema. Log it and let the caller retry or fall
      // back — never surface a database error to the browser.
      this.log.warn(`AI SQL failed: ${detail.slice(0, 300)} || ${checked.sql.slice(0, 200)}`);
      return { ok: false, reason: 'failed', detail };
    }
  }

  /**
   * Make a row safe to serialise. Postgres `bigint` (from `count(*)`) and
   * `Decimal` don't survive JSON, and dates are better sent as ISO strings than
   * as whatever the driver hands back.
   */
  private normalise(row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === 'bigint') out[k] = Number(v);
      else if (v instanceof Date) out[k] = v.toISOString().slice(0, 10);
      else if (v && typeof v === 'object' && 'toNumber' in v && typeof v.toNumber === 'function') {
        out[k] = (v as { toNumber: () => number }).toNumber();
      } else out[k] = v;
    }
    return out;
  }
}

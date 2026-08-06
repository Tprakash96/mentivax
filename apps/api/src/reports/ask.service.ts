import { Injectable, Logger } from '@nestjs/common';
import {
  ASK_ACTIONS,
  askPlanSchema,
  formatMoney,
  describeFilters,
  describeReading,
  readQuestion,
  validateAskPlan,
  type AskDataset,
  type AskPlan,
} from '@mentivax/core';
import type { AskAnswer, AskLink } from '@mentivax/api-client';
import type { TenantContext } from '../tenant/tenant.types';
import { GeminiService, type GeminiFailure } from './gemini.service';
import { AskQueryService, type AskResult } from './ask-query.service';
import { AskSqlService } from './ask-sql.service';
import { askSchemaForPrompt } from './ask-schema';
import { ReportsService } from './reports.service';

/**
 * Operator-facing diagnosis of an AI failure. **Logged, never returned.**
 *
 * An accountant asking about July fees cannot act on "the API key has no quota"
 * — it names a system they don't administer, and shipping it to the browser
 * leaks how the server is configured. The user gets `USER_NOTE` instead; whoever
 * runs the API gets this in the logs.
 */
const OPERATOR_DIAGNOSIS: Record<GeminiFailure, string> = {
  unconfigured: 'GEMINI_AI_KEY is not set, so Ask is running on local intent matching only.',
  quota: 'The Gemini key has no quota left — check billing on the Google AI Studio account.',
  model: 'The configured Gemini model is unavailable to this key — set GEMINI_MODEL to one that is.',
  error: 'The Gemini call failed (network, timeout, or malformed reply).',
};

/** What the person who asked actually sees. No system detail. */
const USER_NOTE = 'Answered directly from your records.';

/**
 * Whether a result column should be rendered as rupees.
 *
 * With arbitrary SQL there is no schema to consult, so this reads the alias the
 * model was instructed to write. Guessing wrong shows a raw paise integer — ugly
 * but not misleading — which is the right way for this to fail.
 */
function looksLikeMoney(label: string): boolean {
  return /amount|paid|due|billed|collected|gross|net|fee|fare|balance|concession|discount|salary|total/i.test(
    label,
  );
}

/**
 * A column that counts things, whatever else its name says.
 *
 * This is a veto, applied over both the model's declaration and the name
 * heuristic, because a column cannot be both a tally and an amount. It exists
 * because "Fee-exempt students" — a `COUNT(*)` returning 1 — was declared money
 * and rendered as "₹0". A count shown as rupees is not a cosmetic slip; it is a
 * wrong answer to "how many".
 */
function looksLikeCount(label: string): boolean {
  return /\bcount\b|students|pupils|children|riders|invoices|receipts|payments|rows|qty|quantity|number of|how many/i.test(
    label,
  );
}

@Injectable()
export class AskService {
  private readonly log = new Logger(AskService.name);

  constructor(
    private readonly gemini: GeminiService,
    private readonly query: AskQueryService,
    private readonly reports: ReportsService,
    private readonly sql: AskSqlService,
  ) {}

  /**
   * Answer a plain-language question about this school's data.
   *
   * Three tiers, tried in order, because they trade coverage against certainty:
   *
   *  1. **AI SQL** — Gemini writes one SELECT against the real schema, so *any*
   *     question the data can answer is answerable. Safety does not come from
   *     trusting that SQL: it runs as a read-only Postgres role whose row-level
   *     policies confine it to this school (see `AskSqlService`). A query that
   *     forgets a tenant predicate still returns only the caller's rows.
   *  2. **Local reading** — when the model is unreachable, `readQuestion`
   *     composes a plan from the concepts it recognises. Narrower, needs no AI,
   *     and phrases its own answer so the prose can only describe what actually
   *     ran. Carries exact business semantics and deep links.
   *  3. **Decline** — a question neither tier can read is reported as unread
   *     rather than answered with something else.
   */
  async ask(t: TenantContext, question: string): Promise<AskAnswer> {
    // Tier 1: let the model write SQL. Widest coverage, and the database is what
    // keeps it honest.
    const viaSql = await this.askViaSql(t, question);
    if (viaSql) return viaSql;

    // Tier 2: read the question ourselves. No model involved *at all* — not even
    // for phrasing.
    //
    // That is deliberate. This tier answers from a narrow catalog, and when it
    // had the model phrase those results it would describe filters the query
    // never applied ("stops collecting more than ₹50,000", from a query that
    // filtered nothing). The deterministic sentence can only describe what was
    // actually run, which is the property that matters once a figure is on
    // screen. It also means one fewer model call on the slow path.
    const local = readQuestion(question, await this.classNames(t), t.academicYearStart);

    // Barely-understood questions are worse answered than declined: a
    // confident-looking answer to a misread question is the failure mode to
    // avoid, so hand back the examples instead.
    //
    // `missedQualifier` is the subtle one. "which students have no medical
    // record" reads `students` and nothing else — so the plan would be *every
    // student*, presented as the answer.
    const missedQualifier =
      local != null && local.unread.length > 0 && local.plan.filters.length === 0 && !local.plan.groupBy;
    // A number in a question is a constraint, near enough always. "which stops
    // get more than 50k" grouped by stop and quietly dropped the 50k, which
    // answers a different question with the same confident tone.
    const droppedFigure =
      local != null &&
      local.unread.some((w) => /\d/.test(w) || /^(thousand|lakh|lakhs|crore|crores|k)$/.test(w)) &&
      // Not "is there a comparison" — `due > 0` is one, and it is not the figure
      // the question named. There must be a filter carrying a real amount.
      !local.plan.filters.some((f) => typeof f.value === 'number' && f.value !== 0);

    if (!local || local.confidence < 0.34 || missedQualifier || droppedFigure) {
      if (local && (missedQualifier || droppedFigure)) {
        this.log.warn(
          `Ask declined — ${droppedFigure ? 'unused figure' : 'unread qualifier'} in "${question}": ${local.unread.join(', ')}`,
        );
      }
      return this.unrecognised(t, question);
    }

    const parsed = askPlanSchema.safeParse(local.plan);
    if (!parsed.success) {
      this.log.warn(`Unusable Ask plan: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
      return this.unrecognised(t, question);
    }
    const checked = validateAskPlan(parsed.data);
    if (!checked.ok || !checked.dataset) return this.unrecognised(t, question);
    if (checked.problems.length) {
      this.log.warn(`Ask plan narrowed: ${checked.problems.map((p) => p.message).join('; ')}`);
    }

    const dataset = checked.dataset;
    const plan = checked.plan;
    const result = await this.query.run(t, dataset, plan);

    return {
      question,
      answer: this.describe(dataset, result, plan),
      stats: this.statsFrom(dataset, result),
      table: result,
      links: this.links(dataset, plan, result),
      trace: {
        dataset: dataset.key,
        mode: plan.mode,
        groupBy: plan.groupBy,
        filters: plan.filters,
        ignored: checked.problems.map((p) => p.message),
      },
      ai: false,
      note: USER_NOTE,
      reading: describeReading(dataset, plan),
      corrections: local.corrections,
      source: 'reader',
    };
  }

  /**
   * Tier 1: answer by having the model write SQL.
   *
   * Returns null when this route isn't available or didn't work — the caller then
   * falls through to the catalog. Never throws, and never lets a database error
   * reach the browser.
   */
  private async askViaSql(t: TenantContext, question: string): Promise<AskAnswer | null> {
    if (!this.sql.isConfigured()) return null;

    const schema = askSchemaForPrompt();
    const context = {
      academicYearId: t.academicYearId,
      academicYearLabel: t.academicYearLabel,
      today: new Date().toISOString().slice(0, 10),
    };

    let written = await this.gemini.sql(question, schema, context);
    if (!written.ok) {
      if (written.reason === 'unanswerable') {
        this.log.warn(`Ask: model says unanswerable — ${written.title ?? ''}`);
        return null;
      }
      this.log.warn(`Ask SQL generation unavailable: ${OPERATOR_DIAGNOSIS[written.reason]}`);
      return null;
    }

    let run = await this.sql.run(t, written.sql);

    // The common failure is a column that doesn't exist ("Invoice.classId" — the
    // class is reached through Student). Handing the model its own SQL and the
    // database's error fixes that in one go, which is far cheaper than dropping to
    // a weaker tier and answering a narrower question.
    if (!run.ok && run.reason === 'failed' && run.detail) {
      this.log.warn('Ask: retrying with the database error fed back to the model');
      const repaired = await this.gemini.sql(question, schema, context, {
        sql: written.sql,
        error: run.detail,
      });
      if (repaired.ok) {
        written = repaired;
        run = await this.sql.run(t, repaired.sql);
      }
    }
    if (!run.ok) return null;

    // The model names its money columns, because inferring them from the alias
    // got it badly wrong: "Fee-exempt students" holding the count 1 rendered as
    // "₹0". The name heuristic remains only for a model that returns none.
    const declared = new Set(written.moneyColumns ?? []);
    const columns = run.columns.map((key) => ({
      key,
      label: key,
      money: !looksLikeCount(key) && (declared.size > 0 ? declared.has(key) : looksLikeMoney(key)),
    }));
    const table = {
      columns,
      rows: run.rows as Record<string, string | number>[],
      totals: {},
      matched: run.rows.length,
      truncated: run.truncated,
    };

    // Phrasing costs a second model call, and the free tier for a flash model is
    // measured in tens of requests per day. A single figure ("Students: 14") reads
    // perfectly well without prose, so spend the call only where it earns its
    // keep — a table someone has to interpret.
    const worthPhrasing = run.rows.length > 1 || run.columns.length > 2;
    const phrased = worthPhrasing
      ? await this.gemini.answer(question, {
          note: 'These rows came from this school only (row-level security). Amounts are ALREADY formatted in rupees — quote them exactly as given and never convert them. Answer from these rows alone.',
          title: written.title,
          // Money is formatted *before* the model sees it. Asked to divide paise
          // by 100 itself, it reported ₹12,000 as "₹12,00,000" — a hundredfold
          // error in a figure a school would act on. Formatting here removes the
          // whole class of unit mistake.
          rows: run.rows.slice(0, 40).map((row) =>
            Object.fromEntries(
              columns.map((c) => [
                c.key,
                c.money && typeof row[c.key] === 'number' ? formatMoney(row[c.key] as number) : row[c.key],
              ]),
            ),
          ),
          rowCount: run.rows.length,
          truncated: run.truncated,
        })
      : ({ ok: false, reason: 'error' } as const);

    const answer = phrased.ok ? phrased.answer : this.describeSqlResult(run, columns, written.title);

    // Kept out of the response on purpose (see AskAnswer.source): the query names
    // tables and ids, and nobody using the app can act on it. Logged so support
    // can still explain any figure after the fact.
    this.log.log(`Ask answered "${question}" via SQL: ${run.sql.replace(/\s+/g, ' ')}`);

    return {
      question,
      answer,
      stats: phrased.ok ? phrased.stats : [],
      table,
      links: [{ label: 'Open Reports', to: '/reports' }],
      ai: phrased.ok,
      reading: written.title || undefined,
      source: 'ai-sql',
      note: phrased.ok ? undefined : USER_NOTE,
    };
  }

  /**
   * A sentence for an SQL result, without asking the model.
   *
   * Used when the answer is self-evident (a single figure) or when phrasing was
   * unavailable. Reads the values out rather than describing the shape, because
   * "Students: 14" is the answer and "1 row" is not.
   */
  private describeSqlResult(
    run: Extract<Awaited<ReturnType<AskSqlService['run']>>, { ok: true }>,
    // Takes the resolved columns, not the raw names: whether something is money
    // was decided once, by the model that wrote the expression. Re-deriving it
    // here from the label is how a count of 1 became "₹0".
    columns: { key: string; money: boolean }[],
    title: string,
  ): string {
    if (run.rows.length === 0) return 'Nothing matched that.';
    const first = run.rows[0]!;
    if (run.rows.length === 1) {
      const parts = columns.map((c) => {
        const v = first[c.key];
        return `${c.key}: ${c.money && typeof v === 'number' ? formatMoney(v) : String(v ?? '—')}`;
      });
      return parts.join(' · ');
    }
    const noun = run.rows.length === 1 ? 'row' : 'rows';
    return `${run.rows.length}${run.truncated ? '+' : ''} ${noun}${title ? ` — ${title}` : ''}.`;
  }

  /**
   * Run a plan the caller already has, with no model involved. Same validation
   * and same forced tenant scope as the AI path — the only difference is who
   * proposed the plan, which is exactly why validation lives in the catalog and
   * not in the prompt.
   */
  async runPlan(t: TenantContext, proposed: AskPlan): Promise<AskAnswer> {
    const checked = validateAskPlan(proposed);
    if (!checked.ok || !checked.dataset) {
      return {
        question: `${proposed.dataset} plan`,
        answer: checked.problems.map((p) => p.message).join(' '),
        stats: [],
        links: [],
        ai: false,
      };
    }
    const { dataset, plan } = { dataset: checked.dataset, plan: checked.plan };
    const result = await this.query.run(t, dataset, plan);
    return {
      question: `${dataset.label}${plan.groupBy ? ` by ${plan.groupBy}` : ''}`,
      answer: this.describe(dataset, result, plan),
      stats: this.statsFrom(dataset, result),
      table: result,
      links: this.links(dataset, plan, result),
      trace: {
        dataset: dataset.key,
        mode: plan.mode,
        groupBy: plan.groupBy,
        filters: plan.filters,
        ignored: checked.problems.map((p) => p.message),
      },
      ai: false,
    };
  }

  /** The school's own class names, so a question can name a standard. */
  private async classNames(t: TenantContext): Promise<string[]> {
    return (await this.reports.classNames(t)) ?? [];
  }

  // --- links ---------------------------------------------------------------

  /**
   * Where the answer can send you. The dataset's own page comes first, with any
   * filter that has a `param` carried across as a query string, so "8 STD
   * students who owe" lands on a Students list already narrowed to them.
   */
  private links(dataset: AskDataset, plan: AskPlan, result: AskResult): AskLink[] {
    const params = new URLSearchParams();
    for (const f of plan.filters) {
      const field = dataset.filters.find((x) => x.key === f.field);
      if (!field?.param) continue;
      // `due gt 0` isn't a value a list page can filter on — name the intent.
      if (field.key === 'due') {
        params.set(field.param, f.op === 'is' && Number(f.value) === 0 ? 'settled' : 'owing');
        continue;
      }
      params.set(field.param, String(f.value));
    }
    const qs = params.toString();

    const links: AskLink[] = [
      {
        label: result.matched > 0 ? `${dataset.routeLabel} (${result.matched})` : dataset.routeLabel,
        to: qs ? `${dataset.route}?${qs}` : dataset.route,
      },
    ];

    for (const key of plan.actions) {
      const action = ASK_ACTIONS.find((a) => a.key === key);
      // Skip an action that would just repeat the dataset link.
      if (!action || action.route === dataset.route) continue;
      links.push({ label: action.label, to: action.route });
    }
    return links;
  }

  // --- deterministic phrasing ---------------------------------------------

  /** A plain sentence about what came back, when the model can't write one. */
  private describe(dataset: AskDataset, result: AskResult, plan?: AskPlan): string {
    // "1 student", not "1 students" — drop the plural off the last word only, so
    // "Fee heads" becomes "fee head".
    const noun =
      result.matched === 1
        ? dataset.label.toLowerCase().replace(/s$/, '')
        : dataset.label.toLowerCase();
    const scope = plan ? describeFilters(dataset, plan) : '';
    const where = scope ? ` ${scope}` : '';

    if (result.matched === 0) {
      return `No ${noun}${where}.`;
    }
    // Money only: the head already states the count, so repeating "Receipts 9"
    // adds nothing.
    const parts = dataset.measures
      .filter((m) => m.money && (result.totals[m.key] ?? 0) > 0)
      .map((m) => `${m.label} ${formatMoney(result.totals[m.key] ?? 0)}`);
    const head = `${result.matched} ${noun}${where}`;
    return parts.length ? `${head} — ${parts.join(', ')}.` : `${head}.`;
  }

  private statsFrom(dataset: AskDataset, result: AskResult) {
    const stats = dataset.measures
      .filter((m) => m.money && (result.totals[m.key] ?? 0) > 0)
      .slice(0, 3)
      .map((m) => ({
        label: m.label,
        value: formatMoney(result.totals[m.key] ?? 0),
        sub: dataset.label.toLowerCase(),
      }));
    return [
      { label: 'Matched', value: String(result.matched), sub: dataset.label.toLowerCase() },
      ...stats,
    ];
  }

  /**
   * The question couldn't be turned into a query.
   *
   * Says so, plainly, and offers questions that do work. Deliberately *not*
   * dressed up as an answer: showing year-to-date totals to someone who asked
   * about July reads as a reply and quietly misleads them. The overall figures
   * are still offered, but labelled as context rather than the answer.
   */
  private async unrecognised(t: TenantContext, question: string): Promise<AskAnswer> {
    const o = await this.reports.overview(t);
    return {
      question,
      answer: `I could not work out “${question}”. Try naming what you want — a class ("dues in 8 STD"), a month ("July collections"), or a fee head ("which fee is collecting worst").`,
      stats: [
        { label: 'Invoiced', value: formatMoney(o.invoiced), sub: 'this year, for context' },
        { label: 'Collected', value: formatMoney(o.collected), sub: `${o.collectionRate}% of billed` },
        { label: 'Pending', value: formatMoney(o.pending), sub: `${o.pendingStudents} students` },
      ],
      links: [
        { label: 'Open Reports', to: '/reports' },
        { label: 'Collect a fee', to: '/payments' },
      ],
      ai: false,
      understood: false,
    };
  }
}

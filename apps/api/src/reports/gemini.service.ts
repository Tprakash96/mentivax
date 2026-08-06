import { Injectable, Logger } from '@nestjs/common';

/** The JSON we ask Gemini for: prose plus the figures worth pulling out. */
export interface GeminiAnswer {
  answer: string;
  stats: { label: string; value: string; sub: string }[];
}

/** Why a call couldn't be made — each maps to a different thing to go and fix. */
export type GeminiFailure =
  /** No GEMINI_AI_KEY set. */
  | 'unconfigured'
  /** Key is valid but has no quota left (or none allocated). */
  | 'quota'
  /** The configured model doesn't exist, or this key has no access to it. */
  | 'model'
  /** Anything else: network, timeout, malformed reply. */
  | 'error';

export type GeminiResult = ({ ok: true } & GeminiAnswer) | { ok: false; reason: GeminiFailure };

/**
 * SQL straight from the model. Untrusted: the database, not this type, is what
 * stops it reading another school. `unanswerable` means the model read the schema
 * and said the question cannot be answered from it — worth telling the user.
 */
export type GeminiSqlResult =
  | {
      ok: true;
      sql: string;
      title: string;
      /**
       * Output aliases that hold money, named by the model.
       *
       * Guessing this from the alias got it wrong in the way that matters: a
       * column called "Fee-exempt students" holding the count 1 was rendered as
       * "₹0". The model wrote the expression, so it knows which are amounts.
       */
      moneyColumns: string[];
    }
  | { ok: false; reason: GeminiFailure | 'unanswerable'; title?: string };

type CallResult = { ok: true; text: string } | { ok: false; reason: GeminiFailure };

/**
 * How long to wait. Writing SQL against the whole schema is a much bigger job
 * than phrasing a sentence — on a thinking model it regularly passed 20s, which
 * silently dropped Ask to its fallback tier.
 */
const TIMEOUT_PHRASE_MS = 20_000;
const TIMEOUT_SQL_MS = 60_000;

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Models to try, in order, until one answers.
 *
 * The free tier is metered **per model**, in tens of requests a day, so one model
 * is one small bucket — and the day it runs out, Ask silently drops to its weaker
 * tier. A chain of distinct models is several buckets, and exhausting one just
 * moves to the next.
 *
 * Chosen deliberately:
 * - **Non-thinking.** Writing a SELECT from a schema needs no deliberation, and
 *   thinking costs both latency and tokens: measured on this key, the lite models
 *   answer in ~1.1–1.4s where `gemini-3.5-flash` took 10s and
 *   `gemini-3-flash-preview` 15s.
 * - **Verified against a real key.** The 2.0-flash family reports a free-tier
 *   limit of *zero* and 2.5-flash is retired for new keys, so neither is here.
 *
 * Override with `GEMINI_MODELS` (comma-separated) when an account differs.
 * `GEMINI_MODEL` still works and is tried first.
 */
const DEFAULT_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite-preview',
  // Last resort: a real allowance, but it thinks, so it is slower. Capped below.
  'gemini-3.6-flash',
];

/** How long to leave a rate-limited model alone before trying it again. */
const COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Thin wrapper over the Gemini generateContent API. Configured from the
 * environment:
 *   GEMINI_AI_KEY  — API key (required; without it the service is inert)
 *   GEMINI_MODELS  — comma-separated fallback chain (default: DEFAULT_MODELS)
 *   GEMINI_MODEL   — a single preferred model, tried first
 *
 * Which models a key may call varies by account: older ids can be closed to new
 * keys, and a key can have *zero* free-tier allowance for one model while others
 * work fine. That is why this walks a chain rather than trusting one id.
 */
@Injectable()
export class GeminiService {
  private readonly log = new Logger(GeminiService.name);
  private readonly key = process.env.GEMINI_AI_KEY ?? process.env.GEMINI_API_KEY ?? '';
  private readonly models: string[];
  /** Model id → when its rate limit is worth testing again. */
  private readonly exhausted = new Map<string, number>();

  constructor() {
    const configured = (process.env.GEMINI_MODELS ?? '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    const preferred = process.env.GEMINI_MODEL?.trim();
    const chain = configured.length ? configured : DEFAULT_MODELS;
    // A single preferred model leads, but the chain still backs it up.
    this.models = [...new Set([...(preferred ? [preferred] : []), ...chain])];
  }

  isConfigured(): boolean {
    return this.key.length > 0;
  }

  /**
   * Turn a question into a single read-only SQL statement.
   *
   * The statement is *not* trusted. It runs as a restricted Postgres role whose
   * row-level policies confine it to the caller's school, so the model is free to
   * write whatever query answers the question — including one that forgets a
   * tenant predicate entirely — without being able to see another school's rows.
   * That is what makes open-ended questions safe to allow at all.
   */
  async sql(
    question: string,
    schema: string,
    context: { academicYearId: string; academicYearLabel: string; today: string },
    /**
     * A previous attempt and the error Postgres gave it. Passing these asks for a
     * correction rather than a fresh guess — the common failure is a column that
     * doesn't exist, which the model fixes immediately once told.
     */
    repair?: { sql: string; error: string },
  ): Promise<GeminiSqlResult> {
    if (!this.isConfigured()) return { ok: false, reason: 'unconfigured' };

    const body = {
      systemInstruction: {
        parts: [
          {
            text: [
              'You write ONE PostgreSQL SELECT statement that answers a school administrator\'s question.',
              'Output only the SQL and a short title. No prose, no markdown fences, no semicolon.',
              'Use ONLY the tables and columns in the SCHEMA. Table and column names are case-sensitive: always double-quote them.',
              'Never write INSERT/UPDATE/DELETE/DDL, never call set_config, never use more than one statement.',
              'Do NOT filter on "organizationId": row-level security already restricts every row to this school, and adding it risks getting it wrong.',
              'Return aggregates for "how much / how many" questions and rows for "who / which / list" questions.',
              'Alias every output column to a short human-readable name (e.g. AS "Student", AS "Still due").',
              'List in moneyColumns exactly those output aliases that are money amounts. A count is never a money column, however it is named.',
              'Keep money in paise as integers. Order the most interesting rows first and LIMIT to at most 50 for row-listing questions.',
              'If the question cannot be answered from this schema, return an empty sql string and say why in the title.',
            ].join(' '),
          },
        ],
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                `SCHEMA:\n${schema}`,
                `ACTIVE ACADEMIC YEAR: id=${context.academicYearId} label=${context.academicYearLabel}`,
                `TODAY: ${context.today}`,
                `QUESTION: ${question}`,
                ...(repair
                  ? [
                      `YOUR PREVIOUS ATTEMPT FAILED. Fix it.\nSQL: ${repair.sql}\nPOSTGRES ERROR: ${repair.error}`,
                    ]
                  : []),
              ].join('\n\n'),
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        // Writing one SELECT does not need deep deliberation, and a school is
        // waiting on the answer. Low keeps it a couple of seconds instead of
        // tens; the schema in the prompt does the heavy lifting.
        thinkingConfig: { thinkingLevel: 'low' },
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            sql: { type: 'STRING' },
            title: { type: 'STRING' },
            moneyColumns: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          required: ['sql', 'title', 'moneyColumns'],
        },
      },
    };

    const res = await this.call(body, TIMEOUT_SQL_MS);
    if (!res.ok) return res;
    try {
      const parsed = JSON.parse(res.text) as { sql?: string; title?: string; moneyColumns?: unknown };
      const sql = String(parsed.sql ?? '').trim();
      if (!sql) return { ok: false, reason: 'unanswerable', title: String(parsed.title ?? '') };
      return {
        ok: true,
        sql,
        title: String(parsed.title ?? ''),
        moneyColumns: Array.isArray(parsed.moneyColumns) ? parsed.moneyColumns.map(String) : [],
      };
    } catch {
      return { ok: false, reason: 'error' };
    }
  }

  /**
   * Ask the model to answer `question` using only `facts`. Never throws: a
   * failure comes back as a reason the caller can explain, so the Ask tab always
   * answers with real figures even when the model is unavailable.
   */
  async answer(question: string, facts: unknown): Promise<GeminiResult> {
    if (!this.isConfigured()) return { ok: false, reason: 'unconfigured' };

    const body = {
      systemInstruction: {
        parts: [
          {
            text: [
              "You are the accountant for an Indian school, answering the head's questions about fee collection.",
              'Answer ONLY from the FACTS JSON given in the user message. Never invent a number that is not in it.',
              'If the facts cannot answer the question, say so plainly and give the closest figure that is present.',
              'Every amount in FACTS is in paise: divide by 100 for rupees and write it Indian-style, e.g. ₹1,04,300.',
              'Reply in 1-3 short sentences, plain language, no markdown, no bullet lists.',
              'Then give up to 4 stats: label (2-4 words), value (a formatted figure), sub (a short qualifier).',
            ].join(' '),
          },
        ],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: `QUESTION: ${question}\n\nFACTS:\n${JSON.stringify(facts)}` }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        // Structured output — the model must return exactly this shape, so there
        // is no prose to parse out and a malformed reply becomes a retryable error.
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            answer: { type: 'STRING' },
            stats: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  label: { type: 'STRING' },
                  value: { type: 'STRING' },
                  sub: { type: 'STRING' },
                },
                required: ['label', 'value', 'sub'],
              },
            },
          },
          required: ['answer', 'stats'],
        },
      },
    };

    const res = await this.call(body);
    if (!res.ok) return res;

    try {
      const parsed = JSON.parse(res.text) as GeminiAnswer;
      if (typeof parsed.answer !== 'string' || !parsed.answer.trim()) {
        return { ok: false, reason: 'error' };
      }
      return {
        ok: true,
        answer: parsed.answer.trim(),
        stats: (Array.isArray(parsed.stats) ? parsed.stats : []).slice(0, 4).map((s) => ({
          label: String(s?.label ?? ''),
          value: String(s?.value ?? ''),
          sub: String(s?.sub ?? ''),
        })),
      };
    } catch {
      return { ok: false, reason: 'error' };
    }
  }

  /**
   * Try each model in the chain until one answers.
   *
   * A model that is rate-limited or unavailable is skipped and remembered, so the
   * next question goes straight to one that works instead of paying a round trip
   * to rediscover an exhausted bucket. Only when every model has been tried does
   * this report failure — and it reports the *most useful* reason, so "everything
   * is rate-limited" isn't mistaken for "the key is wrong".
   */
  private async call(body: unknown, timeoutMs = TIMEOUT_PHRASE_MS): Promise<CallResult> {
    const now = Date.now();
    const ready = this.models.filter((m) => (this.exhausted.get(m) ?? 0) <= now);
    // Everything is cooling down — try the whole chain anyway rather than refuse:
    // a limit may have reset early, and the alternative is a worse answer.
    const attempt = ready.length ? ready : this.models;

    let worstReason: GeminiFailure = 'error';
    for (const model of attempt) {
      const outcome = await this.callModel(model, body, timeoutMs);
      if (outcome.ok) {
        if (model !== attempt[0]) this.log.log(`Gemini answered on fallback model ${model}`);
        return outcome;
      }
      if (outcome.reason === 'quota') {
        this.exhausted.set(model, Date.now() + COOLDOWN_MS);
        worstReason = 'quota';
      } else if (outcome.reason === 'model') {
        // Not available to this key at all — never worth trying again this run.
        this.exhausted.set(model, Number.MAX_SAFE_INTEGER);
        if (worstReason !== 'quota') worstReason = 'model';
      }
      // Anything else (timeout, 5xx, malformed): move on to the next model.
    }

    this.log.warn(`Gemini: every model in the chain failed (${attempt.join(', ')})`);
    return { ok: false, reason: worstReason };
  }

  /**
   * One POST to generateContent against one model.
   *
   * 503/500 means the model is momentarily overloaded rather than anything being
   * wrong with the request, so it is worth one retry before moving down the chain.
   */
  private async callModel(
    model: string,
    body: unknown,
    timeoutMs: number,
    retriesLeft = 1,
  ): Promise<CallResult> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.key },
        body: JSON.stringify(body),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) {
        const detail = (await res.text()).replace(/\s+/g, ' ').slice(0, 220);
        this.log.warn(`Gemini ${model} returned ${res.status}: ${detail}`);
        if (res.status === 429) return { ok: false, reason: 'quota' };
        if (res.status === 404) return { ok: false, reason: 'model' };
        if ((res.status === 503 || res.status === 500) && retriesLeft > 0) {
          await new Promise((r) => setTimeout(r, 1_200));
          return this.callModel(model, body, timeoutMs, retriesLeft - 1);
        }
        return { ok: false, reason: 'error' };
      }

      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
      };
      // Thinking models can return reasoning as its own part. Join the answer
      // parts and skip the thoughts, so structured output still parses when a
      // model decides to show its working.
      const text = (json.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text)
        .join('')
        .trim();
      return text ? { ok: true, text } : { ok: false, reason: 'error' };
    } catch (err) {
      this.log.warn(`Gemini ${model} failed: ${err instanceof Error ? err.message : String(err)}`);
      return { ok: false, reason: 'error' };
    }
  }
}

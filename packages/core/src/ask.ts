/**
 * The Ask catalog — what a natural-language question is *allowed* to ask of the
 * database.
 *
 * The model never writes SQL. It reads this catalog and returns a plan: which
 * dataset, which filters, what to group by, what to measure. The server then
 * validates that plan against the catalog (`askPlanSchema`) and compiles it into
 * a query with `organizationId` and `academicYearId` forced on. So the worst a
 * crafted question can do is ask a *different allowed question* — it cannot
 * reach another school's rows, and it cannot name a column that isn't here.
 *
 * Field keys are a contract shared with the compiler in the API. Renaming one
 * silently breaks planning; add new keys instead.
 */
import { z } from 'zod';
import { readQuestion } from './ask-nl';

/** Comparison operators a filter may use, by field type. */
export const ASK_OPS = ['is', 'not', 'contains', 'gt', 'gte', 'lt', 'lte', 'before', 'after'] as const;
export type AskOp = (typeof ASK_OPS)[number];

export type AskFieldType = 'text' | 'enum' | 'money' | 'number' | 'date' | 'boolean';

export interface AskField {
  key: string;
  label: string;
  type: AskFieldType;
  /** Operators allowed on this field. */
  ops: AskOp[];
  /** For enums: the only accepted values. */
  values?: string[];
  /** Told to the model when the name alone isn't enough. */
  hint?: string;
  /** URL parameter this filter becomes when deep-linking to the page. */
  param?: string;
  /**
   * How this field reads inside a sentence — "using transport", not the label
   * "Uses school transport" (which produces "students uses school transport").
   */
  reads?: string;
}

export interface AskMeasure {
  key: string;
  label: string;
  /** Money measures render as rupees; counts as plain integers. */
  money: boolean;
}

export interface AskDataset {
  key: string;
  label: string;
  /** What this dataset answers — the model picks a dataset from these. */
  description: string;
  /** Where a person goes to see these rows in the app. */
  route: string;
  routeLabel: string;
  filters: AskField[];
  /** Fields the rows may be grouped by (aggregate mode). */
  groupBy: AskField[];
  measures: AskMeasure[];
  /** Columns returned in row mode, in display order. */
  columns: AskMeasure[];
  /** Default sort key for row mode. */
  defaultSort: string;
}

const CLASS_FILTER: AskField = {
  key: 'class',
  label: 'Class / standard',
  type: 'text',
  ops: ['is', 'contains'],
  hint: 'Class name exactly as the school writes it, e.g. "8 STD", "Nursery".',
  param: 'class',
  reads: 'class',
};

const money = (key: string, label: string): AskMeasure => ({ key, label, money: true });
const count = (key: string, label: string): AskMeasure => ({ key, label, money: false });

/** Every dataset a question may be answered from. */
export const ASK_DATASETS: AskDataset[] = [
  {
    key: 'students',
    label: 'Students',
    description:
      'One row per student with what they were billed, what they have paid and what they still owe. Use for "who owes", "which students", per-class dues, exempt or concession students, transport riders.',
    route: '/students',
    routeLabel: 'Open Students',
    filters: [
      CLASS_FILTER,
      { key: 'name', label: 'Student name', type: 'text', ops: ['contains'], param: 'search' },
      {
        key: 'enrollment',
        label: 'Enrollment status',
        type: 'enum',
        ops: ['is', 'not'],
        values: ['APPLICANT', 'ACTIVE', 'TC_ISSUED', 'ALUMNI'],
        param: 'status',
      },
      { key: 'newAdmission', label: 'Is a new admission this year', type: 'boolean', ops: ['is'], reads: 'newly admitted' },
      { key: 'feeExempt', label: 'Is exempt from fees', type: 'boolean', ops: ['is'], reads: 'fee exempt' },
      { key: 'hasConcession', label: 'Has a concession', type: 'boolean', ops: ['is'], reads: 'on a concession' },
      { key: 'ridesTransport', label: 'Uses school transport', type: 'boolean', ops: ['is'], reads: 'using transport' },
      {
        key: 'due',
        label: 'Amount still owed',
        type: 'money',
        ops: ['gt', 'gte', 'lt', 'lte', 'is'],
        hint: 'In paise. Use due gt 0 for "still owes"; due is 0 for "fully paid".',
        param: 'due',
      },
      { key: 'collected', label: 'Amount paid so far', type: 'money', ops: ['gt', 'gte', 'lt', 'lte', 'is'] },
    ],
    groupBy: [
      CLASS_FILTER,
      {
        key: 'enrollment',
        label: 'Enrollment status',
        type: 'enum',
        ops: ['is'],
        values: ['APPLICANT', 'ACTIVE', 'TC_ISSUED', 'ALUMNI'],
      },
      { key: 'transportStop', label: 'Transport stop', type: 'text', ops: ['is'] },
    ],
    measures: [
      count('students', 'Students'),
      money('billed', 'Billed'),
      money('collected', 'Collected'),
      money('due', 'Still due'),
    ],
    columns: [
      { key: 'name', label: 'Student', money: false },
      { key: 'class', label: 'Class', money: false },
      { key: 'billed', label: 'Billed', money: true },
      { key: 'collected', label: 'Paid', money: true },
      { key: 'due', label: 'Still due', money: true },
    ],
    defaultSort: 'due',
  },
  {
    key: 'invoices',
    label: 'Invoices',
    description:
      'One row per issued invoice. Use for invoice counts, overdue invoices, invoice status breakdowns, and what a particular invoice is worth.',
    route: '/invoices',
    routeLabel: 'Open Invoices',
    filters: [
      CLASS_FILTER,
      {
        key: 'status',
        label: 'Invoice status',
        type: 'enum',
        ops: ['is', 'not'],
        values: ['DRAFT', 'PENDING', 'PARTIAL', 'PAID', 'CANCELLED'],
        param: 'status',
      },
      { key: 'student', label: 'Student name', type: 'text', ops: ['contains'], param: 'search' },
      { key: 'number', label: 'Invoice number', type: 'text', ops: ['contains'] },
      {
        key: 'dueDate',
        label: 'Due date',
        type: 'date',
        ops: ['before', 'after'],
        hint: 'ISO date (YYYY-MM-DD). Use dueDate before <today> together with status not PAID for "overdue".',
      },
      { key: 'due', label: 'Amount still owed', type: 'money', ops: ['gt', 'gte', 'lt', 'lte', 'is'] },
    ],
    groupBy: [
      CLASS_FILTER,
      {
        key: 'status',
        label: 'Invoice status',
        type: 'enum',
        ops: ['is'],
        values: ['DRAFT', 'PENDING', 'PARTIAL', 'PAID', 'CANCELLED'],
      },
      { key: 'month', label: 'Month issued', type: 'date', ops: ['is'] },
    ],
    measures: [
      count('invoices', 'Invoices'),
      money('gross', 'Gross'),
      money('concession', 'Concession'),
      money('billed', 'Net billed'),
      money('collected', 'Collected'),
      money('due', 'Still due'),
    ],
    columns: [
      { key: 'number', label: 'Invoice', money: false },
      { key: 'student', label: 'Student', money: false },
      { key: 'class', label: 'Class', money: false },
      { key: 'status', label: 'Status', money: false },
      { key: 'billed', label: 'Billed', money: true },
      { key: 'collected', label: 'Paid', money: true },
      { key: 'due', label: 'Still due', money: true },
    ],
    defaultSort: 'due',
  },
  {
    key: 'payments',
    label: 'Receipts',
    description:
      'One row per receipt (money actually received). Use for collections in a period, how parents paid (cash/UPI/card), daily or monthly collection, and a particular receipt.',
    route: '/payments',
    routeLabel: 'Open Payment history',
    filters: [
      { key: 'student', label: 'Student name', type: 'text', ops: ['contains'], param: 'search' },
      {
        key: 'mode',
        label: 'Payment mode',
        type: 'enum',
        ops: ['is', 'not'],
        values: ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE'],
        param: 'mode',
      },
      { key: 'paidAt', label: 'Date received', type: 'date', ops: ['before', 'after'], hint: 'ISO date (YYYY-MM-DD).' },
      { key: 'amount', label: 'Receipt amount', type: 'money', ops: ['gt', 'gte', 'lt', 'lte', 'is'] },
    ],
    groupBy: [
      { key: 'mode', label: 'Payment mode', type: 'enum', ops: ['is'], values: ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE'] },
      { key: 'month', label: 'Month received', type: 'date', ops: ['is'] },
    ],
    measures: [count('receipts', 'Receipts'), money('amount', 'Amount')],
    columns: [
      { key: 'receiptNo', label: 'Receipt', money: false },
      { key: 'student', label: 'Student', money: false },
      { key: 'paidAt', label: 'Received', money: false },
      { key: 'mode', label: 'Mode', money: false },
      { key: 'amount', label: 'Amount', money: true },
    ],
    defaultSort: 'paidAt',
  },
  {
    key: 'feeHeads',
    label: 'Fee heads',
    description:
      'One row per fee head (School Fee, Books, Transport …) with billed vs collected, and per-instalment detail for term/monthly fees. Use for "which fee is collecting worst", term-wise collection, transport fee collection.',
    route: '/reports',
    routeLabel: 'Open Reports',
    filters: [],
    groupBy: [],
    measures: [
      money('billed', 'Billed'),
      money('collected', 'Collected'),
      money('due', 'Still due'),
      count('students', 'Students billed'),
    ],
    columns: [
      { key: 'name', label: 'Fee head', money: false },
      { key: 'billed', label: 'Billed', money: true },
      { key: 'collected', label: 'Collected', money: true },
      { key: 'due', label: 'Still due', money: true },
    ],
    defaultSort: 'due',
  },
];

export const askDataset = (key: string): AskDataset | undefined =>
  ASK_DATASETS.find((d) => d.key === key);

/**
 * Extra destinations an answer can point at that aren't a dataset — the "do
 * something about it" links. Keyed so the model can name one.
 */
export const ASK_ACTIONS: { key: string; label: string; route: string; description: string }[] = [
  { key: 'collect', label: 'Collect a fee', route: '/payments', description: 'Record a payment against a student.' },
  { key: 'bill', label: 'Add invoice', route: '/invoices/new', description: 'Bill a class or a student.' },
  { key: 'structure', label: 'Fee amounts', route: '/fees-structure', description: 'Change what each class is charged.' },
  { key: 'reports', label: 'Reports', route: '/reports', description: 'Collection dashboards and fee-head detail.' },
  { key: 'students', label: 'Students', route: '/students', description: 'The student roster.' },
];

// ---------------------------------------------------------------------------
// The plan the model returns
// ---------------------------------------------------------------------------

export const askFilterSchema = z.object({
  field: z.string().min(1).max(40),
  op: z.enum(ASK_OPS),
  /** Scalars only — no nested structures reach the compiler. */
  value: z.union([z.string().max(120), z.number(), z.boolean()]),
});
export type AskFilter = z.infer<typeof askFilterSchema>;

export const askPlanSchema = z.object({
  dataset: z.string().min(1).max(40),
  /** `rows` lists records; `summary` aggregates (optionally grouped). */
  mode: z.enum(['rows', 'summary']).default('summary'),
  groupBy: z.string().max(40).optional(),
  filters: z.array(askFilterSchema).max(6).default([]),
  sort: z.object({ by: z.string().max(40), dir: z.enum(['asc', 'desc']) }).optional(),
  limit: z.number().int().min(1).max(50).default(20),
  /** Action keys from ASK_ACTIONS worth offering alongside the answer. */
  actions: z.array(z.string().max(40)).max(3).default([]),
});
export type AskPlan = z.infer<typeof askPlanSchema>;

export interface AskPlanProblem {
  path: string;
  message: string;
}

/**
 * Check a plan against the catalog. Returns the plan narrowed to what the
 * catalog actually allows, plus anything rejected — an unknown field is dropped
 * rather than passed through, so a hallucinated column can never reach a query.
 */
export function validateAskPlan(plan: AskPlan): {
  ok: boolean;
  dataset?: AskDataset;
  plan: AskPlan;
  problems: AskPlanProblem[];
} {
  const problems: AskPlanProblem[] = [];
  const dataset = askDataset(plan.dataset);
  if (!dataset) {
    return {
      ok: false,
      plan,
      problems: [
        { path: 'dataset', message: `Unknown dataset "${plan.dataset}". Allowed: ${ASK_DATASETS.map((d) => d.key).join(', ')}.` },
      ],
    };
  }

  const filters: AskFilter[] = [];
  for (const f of plan.filters) {
    const field = dataset.filters.find((x) => x.key === f.field);
    if (!field) {
      problems.push({ path: `filters.${f.field}`, message: `"${f.field}" is not filterable on ${dataset.key}.` });
      continue;
    }
    if (!field.ops.includes(f.op)) {
      problems.push({ path: `filters.${f.field}`, message: `Operator "${f.op}" is not allowed on ${f.field}.` });
      continue;
    }
    if (field.values && !field.values.includes(String(f.value))) {
      problems.push({
        path: `filters.${f.field}`,
        message: `"${f.value}" is not one of ${field.values.join(', ')}.`,
      });
      continue;
    }
    filters.push(f);
  }

  let groupBy = plan.groupBy;
  if (groupBy && !dataset.groupBy.some((g) => g.key === groupBy)) {
    problems.push({ path: 'groupBy', message: `Cannot group ${dataset.key} by "${groupBy}".` });
    groupBy = undefined;
  }

  let sort = plan.sort;
  if (sort) {
    const sortable = [...dataset.measures, ...dataset.columns].some((m) => m.key === sort!.by);
    if (!sortable) {
      problems.push({ path: 'sort', message: `Cannot sort ${dataset.key} by "${sort.by}".` });
      sort = undefined;
    }
  }

  const actions = plan.actions.filter((a) => ASK_ACTIONS.some((x) => x.key === a));

  return {
    // A dropped filter still leaves a runnable, honest query — the answer just
    // covers more than asked, and the caller is told what was ignored.
    ok: true,
    dataset,
    plan: { ...plan, filters, groupBy, sort, actions },
    problems,
  };
}

/**
 * The catalog as the model sees it — compact, because it goes in every prompt.
 */
export function askCatalogForPrompt(): string {
  const lines: string[] = [];
  for (const d of ASK_DATASETS) {
    lines.push(`dataset ${d.key} — ${d.description}`);
    if (d.filters.length) {
      lines.push(
        `  filters: ${d.filters
          .map((f) => `${f.key}[${f.ops.join('|')}]${f.values ? `(${f.values.join('/')})` : ''}${f.hint ? ` — ${f.hint}` : ''}`)
          .join('; ')}`,
      );
    }
    if (d.groupBy.length) lines.push(`  groupBy: ${d.groupBy.map((g) => g.key).join(', ')}`);
    lines.push(`  measures: ${d.measures.map((m) => m.key).join(', ')}`);
  }
  lines.push(`actions: ${ASK_ACTIONS.map((a) => `${a.key} (${a.description})`).join('; ')}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Planning without a model
// ---------------------------------------------------------------------------

/**
 * Best-effort plan for a question, with no model involved.
 *
 * Thin wrapper over `readQuestion` in `ask-nl.ts`, which reads a question by
 * composing the concepts it recognises rather than matching whole phrasings.
 * Returns null when nothing could be identified at all.
 */
export function resolveLocalPlan(
  question: string,
  classNames: string[] = [],
  academicYearStart?: string,
): AskPlan | null {
  return readQuestion(question, classNames, academicYearStart)?.plan ?? null;
}

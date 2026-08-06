import { describe, expect, it } from 'vitest';
import {
  ASK_DATASETS,
  askCatalogForPrompt,
  askDataset,
  askPlanSchema,
  resolveLocalPlan,
  validateAskPlan,
} from './ask';

/** A plan as the model would return it, with schema defaults applied. */
const plan = (raw: unknown) => askPlanSchema.parse(raw);

describe('the Ask plan schema', () => {
  it('fills in the defaults a terse plan omits', () => {
    const p = plan({ dataset: 'students' });
    expect(p).toMatchObject({ mode: 'summary', filters: [], limit: 20, actions: [] });
  });

  it('refuses a plan with no dataset', () => {
    expect(() => plan({ mode: 'rows' })).toThrow();
  });

  it('caps the row limit so one question cannot pull the whole table', () => {
    expect(() => plan({ dataset: 'students', limit: 5000 })).toThrow();
  });

  it('refuses more filters than a question plausibly needs', () => {
    const filters = Array.from({ length: 7 }, () => ({ field: 'class', op: 'is', value: '8 STD' }));
    expect(() => plan({ dataset: 'students', filters })).toThrow();
  });

  it('accepts only scalar filter values, never nested structures', () => {
    expect(() =>
      plan({ dataset: 'students', filters: [{ field: 'class', op: 'is', value: { $ne: null } }] }),
    ).toThrow();
  });
});

describe('validating a plan against the catalog', () => {
  it('passes a plan that only names catalogued fields', () => {
    const r = validateAskPlan(
      plan({
        dataset: 'students',
        mode: 'rows',
        filters: [
          { field: 'class', op: 'is', value: '8 STD' },
          { field: 'due', op: 'gt', value: 0 },
        ],
        sort: { by: 'due', dir: 'desc' },
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.problems).toEqual([]);
    expect(r.plan.filters).toHaveLength(2);
    expect(r.dataset?.route).toBe('/students');
  });

  it('rejects an unknown dataset outright', () => {
    const r = validateAskPlan(plan({ dataset: 'salaries' }));
    expect(r.ok).toBe(false);
    expect(r.dataset).toBeUndefined();
    expect(r.problems[0]?.message).toContain('Unknown dataset');
  });

  it('drops a hallucinated column instead of passing it to the compiler', () => {
    const r = validateAskPlan(
      plan({ dataset: 'students', filters: [{ field: 'organizationId', op: 'is', value: 'other-school' }] }),
    );
    expect(r.plan.filters).toEqual([]);
    expect(r.problems[0]?.message).toContain('not filterable');
  });

  it('drops an operator the field does not allow', () => {
    // `name` is text — contains only, never a range comparison.
    const r = validateAskPlan(
      plan({ dataset: 'students', filters: [{ field: 'name', op: 'gt', value: 'M' }] }),
    );
    expect(r.plan.filters).toEqual([]);
    expect(r.problems[0]?.message).toContain('Operator "gt" is not allowed');
  });

  it('drops an enum value outside the allowed set', () => {
    const r = validateAskPlan(
      plan({ dataset: 'invoices', filters: [{ field: 'status', op: 'is', value: 'SECRET' }] }),
    );
    expect(r.plan.filters).toEqual([]);
    expect(r.problems[0]?.message).toContain('is not one of');
  });

  it('keeps the good filters when only one is bad', () => {
    const r = validateAskPlan(
      plan({
        dataset: 'invoices',
        filters: [
          { field: 'status', op: 'is', value: 'PARTIAL' },
          { field: 'nonsense', op: 'is', value: 1 },
        ],
      }),
    );
    expect(r.plan.filters).toEqual([{ field: 'status', op: 'is', value: 'PARTIAL' }]);
    expect(r.problems).toHaveLength(1);
  });

  it('drops a grouping the dataset does not support', () => {
    const r = validateAskPlan(plan({ dataset: 'payments', groupBy: 'class' }));
    expect(r.plan.groupBy).toBeUndefined();
    expect(r.problems[0]?.message).toContain('Cannot group');
  });

  it('keeps a grouping the dataset does support', () => {
    const r = validateAskPlan(plan({ dataset: 'payments', groupBy: 'mode' }));
    expect(r.plan.groupBy).toBe('mode');
    expect(r.problems).toEqual([]);
  });

  it('drops an unsortable sort key', () => {
    const r = validateAskPlan(plan({ dataset: 'students', sort: { by: 'aadhaar', dir: 'asc' } }));
    expect(r.plan.sort).toBeUndefined();
  });

  it('keeps only real action keys', () => {
    const r = validateAskPlan(plan({ dataset: 'students', actions: ['collect', 'drop-database'] }));
    expect(r.plan.actions).toEqual(['collect']);
  });
});

describe('the catalog itself', () => {
  it('gives every dataset a route to send people to', () => {
    for (const d of ASK_DATASETS) {
      expect(d.route.startsWith('/')).toBe(true);
      expect(d.routeLabel.length).toBeGreaterThan(0);
      expect(d.measures.length).toBeGreaterThan(0);
    }
  });

  it('uses distinct dataset keys', () => {
    const keys = ASK_DATASETS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('looks a dataset up by key', () => {
    expect(askDataset('invoices')?.label).toBe('Invoices');
    expect(askDataset('nope')).toBeUndefined();
  });

  it('describes every dataset to the model', () => {
    const prompt = askCatalogForPrompt();
    for (const d of ASK_DATASETS) expect(prompt).toContain(`dataset ${d.key}`);
  });
});

describe('planning without a model', () => {
  const CLASSES = ['Nursery', '1 STD', '8 STD', '10 STD'];

  it('recognises "who still owes fees" as a list of students with dues', () => {
    const p = resolveLocalPlan('Who still owes fees?', CLASSES);
    expect(p).toMatchObject({
      dataset: 'students',
      mode: 'rows',
      filters: [{ field: 'due', op: 'gt', value: 0 }],
    });
  });

  it('recognises "dues by class" as a grouped summary', () => {
    const p = resolveLocalPlan('Show dues by class', CLASSES);
    expect(p).toMatchObject({ dataset: 'students', mode: 'summary', groupBy: 'class' });
  });

  it('recognises how parents paid as receipts grouped by mode', () => {
    const p = resolveLocalPlan('How did parents pay this year?', CLASSES);
    expect(p).toMatchObject({ dataset: 'payments', groupBy: 'mode' });
  });

  it('recognises a fee-head question', () => {
    const p = resolveLocalPlan('Which fee head is collecting worst?', CLASSES);
    expect(p?.dataset).toBe('feeHeads');
  });

  it('recognises overdue invoices', () => {
    const p = resolveLocalPlan('Which invoices are overdue?', CLASSES);
    expect(p).toMatchObject({ dataset: 'invoices', mode: 'rows' });
    expect(p?.filters).toEqual(
      expect.arrayContaining([{ field: 'status', op: 'not', value: 'PAID' }]),
    );
  });

  it('narrows to a class the question names, instead of grouping by class', () => {
    const p = resolveLocalPlan('dues by class for 8 STD', CLASSES);
    expect(p?.filters).toEqual(expect.arrayContaining([{ field: 'class', op: 'is', value: '8 STD' }]));
    // Pinning one class makes grouping by class pointless — list the students.
    expect(p?.groupBy).toBeUndefined();
    expect(p?.mode).toBe('rows');
  });

  it('matches the school\'s own spelling of a class', () => {
    const p = resolveLocalPlan('who owes in nursery', CLASSES);
    expect(p?.filters).toEqual(
      expect.arrayContaining([{ field: 'class', op: 'is', value: 'Nursery' }]),
    );
  });

  it('returns null for a question it does not recognise', () => {
    expect(resolveLocalPlan('what is the wifi password', CLASSES)).toBeNull();
    expect(resolveLocalPlan('', CLASSES)).toBeNull();
  });

  it('only produces plans the catalog accepts', () => {
    const questions = [
      'who still owes fees',
      'dues by class',
      'how did parents pay',
      'which fee head is collecting worst',
      'which invoices are overdue',
      'fully paid students',
      'transport riders',
      'new admissions this year',
      'how much have we collected',
      'concession given',
      'invoice status breakdown',
      'monthly collection',
    ];
    for (const q of questions) {
      const p = resolveLocalPlan(q, CLASSES);
      expect(p, q).not.toBeNull();
      const checked = validateAskPlan(askPlanSchema.parse(p));
      expect(checked.ok, q).toBe(true);
      // Every locally-planned question must survive validation untouched.
      expect(checked.problems, q).toEqual([]);
    }
  });
});

describe('forgiving how people actually type', () => {
  const CLASSES = ['Nursery', '8 STD', '10 STD'];
  // Agaram's year runs Apr 2026 → Mar 2027.
  const YEAR_START = '2026-04-01';

  it('still answers when a word is misspelled', () => {
    // "colltions" for "collections" — one slip should not break the feature.
    const p = resolveLocalPlan('July month fees colltions', CLASSES, YEAR_START);
    expect(p).not.toBeNull();
    expect(p?.dataset).toBe('payments');
  });

  it('scopes a named month to the right calendar year', () => {
    const p = resolveLocalPlan('July month fees collections', CLASSES, YEAR_START);
    expect(p?.filters).toEqual(
      expect.arrayContaining([
        { field: 'paidAt', op: 'after', value: '2026-07-01' },
        { field: 'paidAt', op: 'before', value: '2026-08-01' },
      ]),
    );
  });

  it('puts a month after the academic-year start into the following calendar year', () => {
    // February of a year starting April 2026 is Feb 2027, not Feb 2026.
    const p = resolveLocalPlan('February collections', CLASSES, YEAR_START);
    expect(p?.filters).toEqual(
      expect.arrayContaining([{ field: 'paidAt', op: 'after', value: '2027-02-01' }]),
    );
  });

  it('rolls December into January correctly', () => {
    const p = resolveLocalPlan('December collections', CLASSES, YEAR_START);
    expect(p?.filters).toEqual(
      expect.arrayContaining([
        { field: 'paidAt', op: 'after', value: '2026-12-01' },
        { field: 'paidAt', op: 'before', value: '2027-01-01' },
      ]),
    );
  });

  it('accepts a short month name', () => {
    const p = resolveLocalPlan('aug collections', CLASSES, YEAR_START);
    expect(p?.filters).toEqual(
      expect.arrayContaining([{ field: 'paidAt', op: 'after', value: '2026-08-01' }]),
    );
  });

  it('does not fuzzy-match short words into false positives', () => {
    // "van" must not be read as a near-miss for some other keyword.
    expect(resolveLocalPlan('xyz abc', CLASSES, YEAR_START)).toBeNull();
    expect(resolveLocalPlan('what is the wifi password', CLASSES, YEAR_START)).toBeNull();
  });

  it('keeps month-scoped plans valid against the catalog', () => {
    for (const q of ['July collections', 'march fees', 'overdue in August']) {
      const p = resolveLocalPlan(q, CLASSES, YEAR_START);
      expect(p, q).not.toBeNull();
      const checked = validateAskPlan(askPlanSchema.parse(p));
      expect(checked.ok, q).toBe(true);
      expect(checked.problems, q).toEqual([]);
    }
  });
});

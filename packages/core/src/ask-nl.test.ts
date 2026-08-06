import { describe, expect, it } from 'vitest';
import { askDataset, askPlanSchema, validateAskPlan } from './ask';
import { describeReading, readQuestion } from './ask-nl';

const CLASSES = ['Nursery', 'L.K.G', '1 STD', '8 STD', '10 STD'];
const YEAR_START = '2026-04-01'; // Agaram runs Apr 2026 → Mar 2027

const read = (q: string) => readQuestion(q, CLASSES, YEAR_START);
const planOf = (q: string) => read(q)?.plan;

/** Every plan the reader produces must be one the catalog already allows. */
const expectValid = (q: string) => {
  const p = planOf(q);
  expect(p, q).toBeTruthy();
  const checked = validateAskPlan(askPlanSchema.parse(p));
  expect(checked.ok, q).toBe(true);
  expect(checked.problems, q).toEqual([]);
  return checked.plan;
};

describe('reading a question however it is worded', () => {
  it('reads the same plan from wildly different phrasings of "who owes"', () => {
    const asked = [
      'who still owes fees?',
      'which students have pending fees',
      'list the defaulters',
      'show me students with outstanding balance',
      'pending dues student list',
      'students yet to pay',
      'give names of children with arrears',
    ];
    for (const q of asked) {
      const p = planOf(q);
      expect(p?.dataset, q).toBe('students');
      expect(p?.filters, q).toEqual(
        expect.arrayContaining([{ field: 'due', op: 'gt', value: 0 }]),
      );
    }
  });

  it('does not care about word order', () => {
    const a = planOf('pending fees in 8 STD');
    const b = planOf('8 STD pending fees');
    const c = planOf('in 8 STD what is pending');
    for (const p of [a, b, c]) {
      expect(p?.dataset).toBe('students');
      expect(p?.filters).toEqual(
        expect.arrayContaining([
          { field: 'class', op: 'is', value: '8 STD' },
          { field: 'due', op: 'gt', value: 0 },
        ]),
      );
    }
  });

  it('picks receipts when the question is about money coming in', () => {
    for (const q of ['collections in June', 'june receipts', 'what did we receive in june']) {
      expect(planOf(q)?.dataset, q).toBe('payments');
    }
  });

  it('picks invoices for status and overdue questions', () => {
    expect(planOf('which invoices are overdue')?.dataset).toBe('invoices');
    expect(planOf('invoice status breakdown')?.dataset).toBe('invoices');
    expect(planOf('partly paid bills')?.dataset).toBe('invoices');
  });

  it('picks fee heads when asked about a fee', () => {
    expect(planOf('which fee head collects worst')?.dataset).toBe('feeHeads');
  });

  it('groups when the question says "by ..."', () => {
    expect(planOf('dues by class')?.groupBy).toBe('class');
    expect(planOf('collection by mode')?.groupBy).toBe('mode');
    expect(planOf('month wise collection')?.groupBy).toBe('month');
    expect(planOf('invoices by status')?.groupBy).toBe('status');
  });

  it('reads "how did they pay" as the mode split, but "how much" as a figure', () => {
    expect(planOf('how did parents pay this year')).toMatchObject({
      dataset: 'payments',
      groupBy: 'mode',
    });
    expect(planOf('how much have we collected')?.mode).toBe('summary');
  });

  it('lists records for who/which, totals for how much', () => {
    expect(planOf('which students owe')?.mode).toBe('rows');
    expect(planOf('how much is pending overall')?.mode).toBe('summary');
  });

  it('picks up the boolean flags', () => {
    expect(planOf('transport riders')?.filters).toEqual(
      expect.arrayContaining([{ field: 'ridesTransport', op: 'is', value: true }]),
    );
    expect(planOf('new admissions this year')?.filters).toEqual(
      expect.arrayContaining([{ field: 'newAdmission', op: 'is', value: true }]),
    );
    expect(planOf('fee exempt students')?.filters).toEqual(
      expect.arrayContaining([{ field: 'feeExempt', op: 'is', value: true }]),
    );
  });

  it('reads "fully paid" as the opposite of owing', () => {
    expect(planOf('fully paid students')?.filters).toEqual(
      expect.arrayContaining([{ field: 'due', op: 'is', value: 0 }]),
    );
  });
});

describe('forgiving spelling', () => {
  it('reads badly misspelled questions', () => {
    const cases: [string, string][] = [
      ['July month fees colltions', 'payments'],
      ['pendng fees', 'students'],
      ['studnts who ow money', 'students'],
      ['collectin by clas', 'students'],
      ['outstandng balnce', 'students'],
      ['invoces overdu', 'invoices'],
      ['transprt riders', 'students'],
      ['concesion given', 'students'],
    ];
    for (const [q, dataset] of cases) {
      const p = planOf(q);
      expect(p, q).toBeTruthy();
      expect(p?.dataset, q).toBe(dataset);
    }
  });

  it('reports what it corrected, so the answer can show its reading', () => {
    const r = read('pendng dues');
    expect(r?.corrections.some(([typed]) => typed === 'pendng')).toBe(true);
  });

  it('still finds a misspelled month', () => {
    const p = planOf('collections in agust');
    expect(p?.filters).toEqual(
      expect.arrayContaining([{ field: 'paidAt', op: 'after', value: '2026-08-01' }]),
    );
  });

  it('does not mangle a correctly spelled month', () => {
    const p = planOf('march collections');
    // March of a year starting April 2026 is March 2027.
    expect(p?.filters).toEqual(
      expect.arrayContaining([{ field: 'paidAt', op: 'after', value: '2027-03-01' }]),
    );
  });

  it('matches a class however it is typed', () => {
    expect(planOf('dues in 8 std')?.filters).toEqual(
      expect.arrayContaining([{ field: 'class', op: 'is', value: '8 STD' }]),
    );
    expect(planOf('nursery pending')?.filters).toEqual(
      expect.arrayContaining([{ field: 'class', op: 'is', value: 'Nursery' }]),
    );
  });

  it('does not invent meaning for gibberish', () => {
    for (const q of ['asdkjh qweqwe', 'zzzz', '']) {
      expect(read(q), q).toBeNull();
    }
  });

  it('reports low confidence when most of the question is unknown', () => {
    const r = read('wifi password please');
    // Either unread, or read with visibly low confidence — never confidently wrong.
    if (r) expect(r.confidence).toBeLessThan(0.5);
  });
});

describe('every reading is a legal plan', () => {
  it('produces catalog-valid plans across a broad sample', () => {
    const questions = [
      'who owes money',
      'dues by class',
      'pending in 10 STD',
      'fully paid students',
      'transport riders with dues',
      'new admissions',
      'exempt students',
      'concession given',
      'collections in June',
      'how did parents pay',
      'month wise collection',
      'which invoices are overdue',
      'invoice status breakdown',
      'which fee head collects worst',
      'colltions in july',
      'studnt dues by clas',
    ];
    for (const q of questions) expectValid(q);
  });

  it('never emits more filters than the schema allows', () => {
    const p = planOf('new admission transport exempt concession pending in 8 STD in june');
    expect(p!.filters.length).toBeLessThanOrEqual(6);
    expectValid('new admission transport exempt concession pending in 8 STD in june');
  });
});

describe('explaining the reading back', () => {
  it('states scope in plain words', () => {
    const p = planOf('pending fees in 10 STD')!;
    expect(describeReading(askDataset('students')!, p)).toBe('students in 10 STD, still owing');
  });

  it('names a month window', () => {
    const p = planOf('june collections')!;
    expect(describeReading(askDataset('payments')!, p)).toContain('in June 2026');
  });

  it('mentions the grouping', () => {
    const p = planOf('dues by class')!;
    expect(describeReading(askDataset('students')!, p)).toContain('by class');
  });
});

describe('not inferring meaning from filler words', () => {
  it('does not read "how" as "how much"', () => {
    // "how" is a prefix of "howmuch"; stretching it turns a method question
    // into a total and loses the mode split.
    expect(planOf('how did parents pay')).toMatchObject({ dataset: 'payments', groupBy: 'mode' });
  });

  it('does not read "fee" as "fee head"', () => {
    // "fee" prefixes "feehead", which would send an exempt-students question
    // to the fee-heads dataset.
    expect(planOf('fee exempt students')).toMatchObject({ dataset: 'students' });
    expect(planOf('fee exempt students')?.filters).toEqual(
      expect.arrayContaining([{ field: 'feeExempt', op: 'is', value: true }]),
    );
  });

  it('still honours a filler word that really is vocabulary', () => {
    // "total" is a stopword for confidence, but an exact concept hit.
    expect(planOf('total pending')?.mode).toBe('summary');
  });

  it('ignores people-words that are near-misses for real vocabulary', () => {
    // "parents" is two edits from "payments" — it must not be corrected to it.
    const r = read('how did parents pay');
    expect(r?.corrections.map(([typed]) => typed)).not.toContain('parents');
  });

  it('reads an unambiguous short prefix', () => {
    // "ow" can only be owe/owes/owing → still owing.
    expect(planOf('students who ow money')?.filters).toEqual(
      expect.arrayContaining([{ field: 'due', op: 'gt', value: 0 }]),
    );
  });

  it('leaves an ambiguous prefix unread rather than guessing', () => {
    // "st" could be student, std, stop or settled — guessing would be worse
    // than not reading it.
    const r = read('st');
    expect(r).toBeNull();
  });

  it('matches a class written without spaces', () => {
    expect(planOf('hw much is pendng in 8std')?.filters).toEqual(
      expect.arrayContaining([{ field: 'class', op: 'is', value: '8 STD' }]),
    );
  });

  it('does not let stray short words drag confidence down', () => {
    const r = read('hw much is pendng in 8std');
    expect(r).toBeTruthy();
    expect(r!.confidence).toBeGreaterThanOrEqual(0.34);
  });

  it('reports typos but not mere inflections', () => {
    const typos = read('pendng dues')?.corrections.map(([t]) => t) ?? [];
    expect(typos).toContain('pendng');
    // "collects" → "collect" is a stem, not a mistake worth flagging.
    const stems = read('which fee head collects worst')?.corrections.map(([t]) => t) ?? [];
    expect(stems).not.toContain('collects');
  });

  it('reads boolean filters as readable phrases', () => {
    const p = planOf('transport riders')!;
    expect(describeReading(askDataset('students')!, p)).toBe('students using transport');
  });
});

describe('declining rather than misreading', () => {
  it('does not read a document question as a dues question', () => {
    // "not" prefixes "notpaid"; stretching it turned this into "students still
    // owing" and answered a question nobody asked. Documents aren't in this
    // reader's vocabulary, so the right outcome is to decline and let the SQL
    // tier (or a rephrase) handle it.
    const r = read('who are not submitted the birth certificate');
    if (r) expect(r.confidence).toBeLessThan(0.34);
  });

  it('still reads "not paid" as the phrase it is', () => {
    expect(planOf('who has not paid')?.filters).toEqual(
      expect.arrayContaining([{ field: 'due', op: 'gt', value: 0 }]),
    );
  });

  it('flags the qualifier it missed, so the caller can decline', () => {
    // It recognises "students" but not "medical record". Answering would list
    // every student as though that were the answer.
    const r = read('which students have no medical record');
    expect(r?.unread).toEqual(expect.arrayContaining(['medical', 'record']));
    expect(r?.plan.filters).toEqual([]);
  });

  it('leaves nothing unread when it understood the whole question', () => {
    expect(read('who has not paid')?.unread).toEqual([]);
    expect(read('dues by class')?.unread).toEqual([]);
    expect(read('june collections')?.unread).toEqual([]);
  });
});

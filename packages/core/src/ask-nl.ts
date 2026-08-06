/**
 * Reading a question without a model.
 *
 * A school can ask anything, in any order, misspelled. Matching whole sentences
 * against a list of known phrasings fails the moment someone words it their own
 * way — so this reads a question *compositionally* instead: normalise every word
 * to a known concept (forgiving spelling), then assemble a plan from the concepts
 * that turned up. "8 STD pending fees", "fees pending for 8 STD" and "hw much is
 * pendng in 8std" all land on the same plan.
 *
 * This is still a fallback. Gemini planning (see `AskService`) understands far
 * more than a vocabulary can, and it takes over whenever it is reachable. What
 * this guarantees is that Ask never becomes useless without it, and that a
 * question it *can't* read is reported as unread rather than silently answered
 * with something else.
 */
import { askDataset, type AskDataset, type AskFilter, type AskPlan } from './ask';

/** A thing a question can be *about*, or a way it can be sliced. */
export type Concept =
  // What kind of record
  | 'students'
  | 'invoices'
  | 'receipts'
  | 'feeHeads'
  // What figure
  | 'due'
  | 'collected'
  | 'billed'
  | 'concession'
  // How to slice it
  | 'byClass'
  | 'byMode'
  | 'byMonth'
  | 'byStatus'
  | 'byStop'
  // Which records
  | 'unpaid'
  | 'paidFull'
  | 'partial'
  | 'overdue'
  | 'transport'
  | 'newAdmission'
  | 'exempt'
  | 'hasConcession'
  // What shape of answer
  | 'list'
  | 'total';

/**
 * Words that mean each concept. Deliberately generous — Indian school offices
 * say "arrears", "balance", "outstanding" and "due" for the same thing, and a
 * reader that only knows one of them feels broken.
 */
const VOCAB: Record<Concept, string[]> = {
  students: ['student', 'students', 'child', 'children', 'pupil', 'pupils', 'kid', 'kids', 'boy', 'girl', 'roll', 'roster'],
  invoices: ['invoice', 'invoices', 'bill', 'bills', 'billing'],
  receipts: ['receipt', 'receipts', 'payment', 'payments', 'pay', 'pays', 'paying', 'collection', 'collections', 'paid', 'received', 'remittance'],
  feeHeads: ['feehead', 'feeheads', 'head', 'heads', 'feetype', 'feetypes', 'tuition', 'books', 'uniform', 'store'],

  due: ['due', 'dues', 'pending', 'owe', 'owes', 'owed', 'owing', 'outstanding', 'balance', 'arrear', 'arrears', 'unpaid', 'remaining', 'left'],
  collected: ['collected', 'collect', 'collection', 'collections', 'received', 'realised', 'realized', 'inflow'],
  billed: ['billed', 'invoiced', 'charged', 'raised', 'demand'],
  concession: ['concession', 'concessions', 'discount', 'discounts', 'scholarship', 'waiver', 'rebate'],

  byClass: ['class', 'classes', 'classwise', 'standard', 'standards', 'std', 'grade', 'grades', 'section'],
  byMode: ['mode', 'modes', 'method', 'cash', 'upi', 'card', 'bank', 'cheque', 'gpay', 'online'],
  byMonth: ['month', 'months', 'monthly', 'monthwise'],
  byStatus: ['status', 'statuswise'],
  byStop: ['stop', 'stops', 'route', 'routes', 'area', 'areas'],

  // "yet to pay" / "to pay" read as outstanding — a very common phrasing.
  unpaid: ['unpaid', 'notpaid', 'nothing', 'defaulter', 'defaulters', 'nonpayer', 'topay', 'yetto'],
  paidFull: ['fullypaid', 'fully', 'settled', 'cleared', 'complete', 'closed'],
  partial: ['partial', 'partly', 'part', 'partpaid', 'halfpaid'],
  overdue: ['overdue', 'late', 'pastdue', 'delayed', 'lapsed'],
  transport: ['transport', 'bus', 'van', 'vehicle', 'rider', 'riders', 'travel'],
  newAdmission: ['newadmission', 'newadmissions', 'admission', 'admissions', 'joined', 'joinee', 'joinees', 'fresh', 'admitted', 'newcomer'],
  exempt: ['exempt', 'exempted', 'exemption', 'free'],
  hasConcession: ['concessional'],

  list: ['who', 'which', 'whom', 'list', 'name', 'names', 'show', 'display', 'find', 'give'],
  total: ['howmuch', 'howmany', 'total', 'sum', 'overall', 'aggregate', 'count'],
};

/** Words that carry no meaning here — ignored when judging confidence. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'am',
  'do', 'does', 'did', 'has', 'have', 'had', 'will', 'would', 'can', 'could',
  'in', 'on', 'at', 'of', 'for', 'from', 'to', 'by', 'with', 'and', 'or', 'but',
  'we', 'our', 'us', 'i', 'my', 'me', 'you', 'your', 'they', 'them', 'their',
  'this', 'that', 'these', 'those', 'it', 'its',
  'still', 'yet', 'now', 'so', 'far', 'much', 'many', 'any', 'all', 'some',
  'please', 'tell', 'what', 'whats', 'how', 'about', 'as', 'per', 'upto', 'till',
  'fee', 'fees', 'amount', 'money', 'rupees', 'rs', 'inr', 'value', 'figure',
  'school', 'year', 'term', 'report', 'data', 'details', 'detail', 'info',
  // People, not queryable things — and close enough to real vocabulary
  // ("parents" is two edits from "payments") to cause mis-readings if left in.
  'parent', 'parents', 'guardian', 'guardians', 'father', 'mother', 'family',
  'wise', 'each', 'every', 'total', 'overall', 'summary', 'break', 'down',
  // Negations. "not" prefixes "notpaid", which made "who has not submitted the
  // birth certificate" read as a dues question — confidently, and wrongly. The
  // two-word pass still catches "not paid" as the phrase "notpaid".
  'not', 'no', 'without', 'never', 'missing', 'submitted', 'given', 'got',
]);

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** Capped edit distance — we only care whether two words are *near*. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      row[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length] ?? max + 1;
}

/** How much misspelling to forgive, by word length. */
const slack = (word: string): number => (word.length >= 9 ? 3 : word.length >= 6 ? 2 : word.length >= 4 ? 1 : 0);

/** Every (concept, word) pair, longest word first so specifics win. */
const ENTRIES: { concept: Concept; word: string }[] = Object.entries(VOCAB)
  .flatMap(([concept, words]) => words.map((word) => ({ concept: concept as Concept, word })))
  .sort((a, b) => b.word.length - a.word.length);

/**
 * Resolve one typed word to a concept.
 *
 * Exact hit, then a near-miss inside the length-scaled slack, then a prefix
 * (so "pend", "collectn" and "studnt" all land). Returns the canonical word too,
 * so the caller can show what it read the question as.
 */
function readWord(token: string): { concept: Concept; canonical: string } | null {
  for (const e of ENTRIES) if (e.word === token) return { concept: e.concept, canonical: e.word };

  // Never *infer* a concept from a filler word. "how" is a prefix of "howmuch"
  // and "fee" of "feehead", so guessing would turn "how did they pay" into a
  // total and "fee exempt students" into a question about fee heads. An exact
  // hit above still counts — that's how "total" keeps working.
  if (STOPWORDS.has(token)) return null;

  const room = slack(token);
  if (room > 0) {
    let best: { concept: Concept; canonical: string; d: number } | null = null;
    for (const e of ENTRIES) {
      const allowed = Math.min(room, slack(e.word));
      if (allowed === 0) continue;
      const d = editDistance(token, e.word, allowed);
      if (d <= allowed && (!best || d < best.d)) best = { concept: e.concept, canonical: e.word, d };
    }
    if (best) return { concept: best.concept, canonical: best.canonical };
  }

  // A prefix of longer vocabulary words — but only when every word it could be
  // means the same thing. "ow" is unambiguously owe/owes/owing → due; "st" could
  // be student, std, stop or settled, so it is left unread rather than guessed.
  if (token.length >= 2) {
    const matches = ENTRIES.filter((e) => e.word.length > token.length && e.word.startsWith(token));
    const concepts = new Set(matches.map((m) => m.concept));
    if (concepts.size === 1 && matches[0]) {
      return { concept: matches[0].concept, canonical: matches[0].word };
    }
  }
  return null;
}

/** Strip spaces and punctuation so "8std" matches the class "8 STD". */
const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * A correction worth telling the user about.
 *
 * "pendng" → "pending" is a typo they'll want to see. "collects" → "collect" and
 * "given" → "give" are just inflections; reporting those makes the UI look like
 * it's second-guessing perfectly good spelling.
 */
const worthReporting = (typed: string, readAs: string): boolean =>
  !typed.startsWith(readAs) && !readAs.startsWith(typed);

/** What a question was understood to mean. */
export interface AskReading {
  plan: AskPlan;
  /** Concepts recognised, for debugging and for explaining the reading. */
  concepts: Concept[];
  /** Words auto-corrected on the way in: `[typed, readAs]`. */
  corrections: [string, string][];
  /**
   * Share of meaningful words the reader could account for (0–1). Low means the
   * question was mostly words we don't know, and the answer should say so.
   */
  confidence: number;
  /**
   * Meaning-carrying words that mapped to nothing.
   *
   * The number matters less than the combination: unread words *and* a plan with
   * no filters means the question named a subject we understood ("students") and
   * a qualifier we did not ("medical record"). Answering that returns every
   * student — a confident answer to a question nobody asked — so the caller
   * should decline instead.
   */
  unread: string[];
}

const plan = (dataset: string, over: Partial<AskPlan> = {}): AskPlan => ({
  dataset,
  mode: 'summary',
  filters: [],
  limit: 20,
  actions: [],
  ...over,
});

/** A named month resolved into the academic year it belongs to. */
function monthFilter(index: number, academicYearStart?: string) {
  const start = academicYearStart ? new Date(academicYearStart) : null;
  const valid = start && !Number.isNaN(start.getTime());
  const startYear = valid ? start!.getUTCFullYear() : new Date().getUTCFullYear();
  const startMonth = valid ? start!.getUTCMonth() : 3;
  const year = index >= startMonth ? startYear : startYear + 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  const nextIsNextYear = index === 11;
  return {
    from: `${year}-${pad(index + 1)}-01`,
    to: `${nextIsNextYear ? year + 1 : year}-${pad(nextIsNextYear ? 1 : index + 2)}-01`,
  };
}

/**
 * Read a question into a plan.
 *
 * Returns null only when nothing at all could be identified — no record type, no
 * figure, no filter. Anything less than null is worth answering, because a
 * partly-understood question still beats a shrug, provided the answer states
 * what it understood (which is what `AskReading.plan` lets the caller do).
 */
export function readQuestion(
  question: string,
  classNames: string[] = [],
  academicYearStart?: string,
): AskReading | null {
  const raw = question.toLowerCase().trim();
  if (!raw) return null;

  // Class names can contain spaces ("8 STD", "L.K.G"); match them before the
  // question is torn into words, and remove them so "std" doesn't also register
  // as a grouping.
  let working = ` ${raw} `;
  let namedClass: string | null = null;
  for (const name of [...classNames].sort((a, b) => b.length - a.length)) {
    if (!name) continue;
    const needle = name.toLowerCase();
    if (working.includes(needle)) {
      namedClass = name;
      working = working.replace(needle, ' ');
      break;
    }
  }
  // Also catch it written without the spaces or dots — "8std", "lkg".
  if (!namedClass) {
    for (const name of [...classNames].sort((a, b) => b.length - a.length)) {
      const squashed = squash(name);
      if (squashed.length < 2) continue;
      const token = working.split(/[^a-z0-9]+/).find((w) => squash(w) === squashed);
      if (token) {
        namedClass = name;
        working = working.replace(token, ' ');
        break;
      }
    }
  }

  const tokens = working.split(/[^a-z0-9]+/).filter(Boolean);
  const found = new Set<Concept>();
  const corrections: [string, string][] = [];
  let monthIndex = -1;
  /** Words that carry meaning, and how many of them we could account for. */
  const carriers = new Set<string>();
  const read = new Set<string>();

  for (const token of tokens) {
    // One- and two-letter leftovers ("hw", "u") are noise, not evidence that the
    // question was misunderstood — don't let them drag confidence down.
    if (token.length > 2 && !STOPWORDS.has(token)) carriers.add(token);

    const m = MONTHS.findIndex((name) => name === token || name.slice(0, 3) === token);
    if (m >= 0) {
      monthIndex = m;
      read.add(token);
      continue;
    }
    const hit = readWord(token);
    if (hit) {
      found.add(hit.concept);
      read.add(token);
      if (hit.canonical !== token && worthReporting(token, hit.canonical)) {
        corrections.push([token, hit.canonical]);
      }
    }
  }
  // Two-word phrases ("how much", "new admission", "fully paid"). A pair that
  // lands credits both its words, or "new admissions" would read as understood
  // while scoring as gibberish.
  for (let i = 0; i + 1 < tokens.length; i += 1) {
    const a = tokens[i]!;
    const b = tokens[i + 1]!;
    const hit = readWord(`${a}${b}`);
    if (hit) {
      found.add(hit.concept);
      read.add(a);
      read.add(b);
    }
  }
  // A misspelled month, checked after the exact pass so "march" never fuzzes.
  //
  // Deliberately strict: short month names are one edit away from ordinary words
  // ("fully" → "july", "many" → "may"), so a word that already means something
  // is left alone, and 3–5 letter months allow only a single edit.
  if (monthIndex < 0) {
    for (const token of tokens) {
      if (token.length < 4 || STOPWORDS.has(token) || readWord(token)) continue;
      const m = MONTHS.findIndex((name) => {
        const room = name.length <= 5 ? 1 : 2;
        return editDistance(token, name, room) <= room;
      });
      if (m >= 0) {
        monthIndex = m;
        corrections.push([token, MONTHS[m]!]);
        read.add(token);
        break;
      }
    }
  }

  const has = (...c: Concept[]) => c.some((x) => found.has(x));
  const nothingKnown = found.size === 0 && monthIndex < 0 && !namedClass;
  if (nothingKnown) return null;

  // --- which dataset ------------------------------------------------------
  //
  // Naming the record type wins over inferring it. "students yet to pay" is a
  // question about students even though it contains "pay"; deciding on the verb
  // would answer the wrong question. Only when no record noun appears do we
  // infer from what's being asked (a mode or a month needs receipts, because
  // that is where modes and dates live).
  let dataset: string;
  if (has('feeHeads')) dataset = 'feeHeads';
  else if (has('students')) dataset = 'students';
  else if (has('invoices')) dataset = 'invoices';
  else if (has('overdue', 'byStatus', 'partial')) dataset = 'invoices';
  else if (has('byStop', 'transport')) dataset = 'students';
  // Owing is a property of a student, not of a receipt. "who has not paid"
  // contains "paid", but answering it from the receipts table would list the
  // payments that *were* made — the opposite of what was asked.
  else if (has('unpaid') || has('due')) dataset = 'students';
  else if (has('receipts', 'byMode') || monthIndex >= 0) dataset = 'payments';
  else dataset = 'students';

  // A "by class" question needs a dataset that can group by class. Receipts
  // can't, so "collection by class" is really a student-level question.
  if (has('byClass') && !namedClass && !(askDataset(dataset)?.groupBy.some((g) => g.key === 'class') ?? false)) {
    dataset = 'students';
  }

  const built = plan(dataset);
  const def = askDataset(dataset);
  const filters: AskFilter[] = [];
  const can = (field: string) => def?.filters.some((f) => f.key === field) ?? false;

  // --- which records ------------------------------------------------------
  if (has('overdue') && can('status')) {
    filters.push({ field: 'status', op: 'not', value: 'PAID' });
    if (can('due')) filters.push({ field: 'due', op: 'gt', value: 0 });
  } else if (has('partial') && can('status')) {
    filters.push({ field: 'status', op: 'is', value: 'PARTIAL' });
  } else if (has('paidFull') && can('due')) {
    filters.push({ field: 'due', op: 'is', value: 0 });
  } else if (has('due', 'unpaid') && can('due')) {
    filters.push({ field: 'due', op: 'gt', value: 0 });
  }

  if (has('transport') && can('ridesTransport')) {
    filters.push({ field: 'ridesTransport', op: 'is', value: true });
  }
  if (has('newAdmission') && can('newAdmission')) {
    filters.push({ field: 'newAdmission', op: 'is', value: true });
  }
  if (has('exempt') && can('feeExempt')) {
    filters.push({ field: 'feeExempt', op: 'is', value: true });
  }
  if (has('concession', 'hasConcession') && can('hasConcession')) {
    filters.push({ field: 'hasConcession', op: 'is', value: true });
  }
  if (namedClass && can('class')) {
    filters.push({ field: 'class', op: 'is', value: namedClass });
  }
  if (monthIndex >= 0) {
    const field = dataset === 'payments' ? 'paidAt' : 'dueDate';
    if (can(field)) {
      const { from, to } = monthFilter(monthIndex, academicYearStart);
      filters.push({ field, op: 'after', value: from });
      filters.push({ field, op: 'before', value: to });
    }
  }

  // --- how to slice -------------------------------------------------------
  const groupable = (key: string) => def?.groupBy.some((g) => g.key === key) ?? false;
  let groupBy: string | undefined;
  // A named class is already the slice — don't group by the thing we pinned.
  if (has('byClass') && !namedClass && groupable('class')) groupBy = 'class';
  else if (has('byMode') && groupable('mode')) groupBy = 'mode';
  else if (has('byMonth') && monthIndex < 0 && groupable('month')) groupBy = 'month';
  else if (has('byStatus') && groupable('status')) groupBy = 'status';
  else if (has('byStop') && groupable('transportStop')) groupBy = 'transportStop';
  // "How did parents pay?" asks by what method — a bare "how" about receipts
  // means the split, whereas "how much" (mapped to `total`) means the figure.
  else if (dataset === 'payments' && /\bhow\b/.test(raw) && !has('total') && groupable('mode')) {
    groupBy = 'mode';
  }

  // --- rows or a total ----------------------------------------------------
  // "who/which/list" wants records; "how much/total" wants a figure. Grouping
  // implies a summary. With neither signal, a narrowed question is more useful
  // as a list and a broad one as a total.
  const wantsList = has('list') && !has('total');
  const mode: AskPlan['mode'] = groupBy ? 'summary' : wantsList ? 'rows' : has('total') ? 'summary' : filters.length > 0 ? 'rows' : 'summary';

  // --- what to do next ----------------------------------------------------
  const actions: string[] = [];
  if (filters.some((f) => f.field === 'due' && f.op === 'gt')) actions.push('collect');
  if (has('feeHeads')) actions.push('reports');

  const sortKey = def?.measures.some((m) => m.key === 'due') ? 'due' : def?.defaultSort;
  const result: AskPlan = {
    ...built,
    mode,
    groupBy,
    // The schema caps filters; keep the most specific if a question piles them on.
    filters: filters.slice(0, 6),
    sort: sortKey ? { by: sortKey, dir: 'desc' } : undefined,
    actions: actions.slice(0, 3),
  };

  return {
    plan: result,
    concepts: [...found],
    corrections,
    confidence: carriers.size === 0 ? 1 : [...carriers].filter((w) => read.has(w)).length / carriers.size,
    unread: [...carriers].filter((w) => !read.has(w)),
  };
}

/**
 * The filters of a plan in plain words — "in 8 STD, still owing", "in July 2026".
 *
 * Shared by the answer sentence and the "read as" line so the two can never
 * disagree about what was asked.
 */
export function describeFilters(dataset: AskDataset, p: AskPlan): string {
  const parts: string[] = [];
  // Read like a person: where, then when, then how, then the qualifier.
  const rank = (field: string) => (field === 'class' ? 0 : field === 'mode' ? 2 : field === 'due' ? 4 : 3);
  const filters = [...p.filters].sort((a, b) => rank(a.field) - rank(b.field));

  // A whole calendar month arrives as after <1st> + before <1st of next>.
  const after = filters.find((f) => f.op === 'after');
  const before = filters.find((f) => f.op === 'before');
  if (after && before && after.field === before.field) {
    const from = new Date(String(after.value));
    const to = new Date(String(before.value));
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      const wholeMonth =
        from.getUTCDate() === 1 && to.getUTCDate() === 1 && (to.getUTCMonth() - from.getUTCMonth() + 12) % 12 === 1;
      const name = MONTHS[from.getUTCMonth()] ?? '';
      parts.push(
        wholeMonth
          ? `in ${name.charAt(0).toUpperCase()}${name.slice(1)} ${from.getUTCFullYear()}`
          : `between ${String(after.value)} and ${String(before.value)}`,
      );
      filters.splice(filters.indexOf(after), 1);
      filters.splice(filters.indexOf(before), 1);
    }
  }

  for (const f of filters) {
    const field = dataset.filters.find((x) => x.key === f.field);
    const label = (field?.reads ?? field?.label ?? f.field).toLowerCase();
    if (f.field === 'due') parts.push(f.op === 'is' && Number(f.value) === 0 ? 'fully paid' : 'still owing');
    else if (f.field === 'class') parts.push(`in ${f.value}`);
    else if (f.field === 'mode') parts.push(`paid by ${f.value}`);
    else if (f.op === 'contains') parts.push(`matching “${f.value}”`);
    else if (f.op === 'not') parts.push(`not ${String(f.value).toLowerCase()}`);
    else if (typeof f.value === 'boolean') parts.push(f.value ? label : `not ${label}`);
    else if (f.op === 'after') parts.push(`after ${String(f.value)}`);
    else if (f.op === 'before') parts.push(`before ${String(f.value)}`);
    else parts.push(`${label} ${f.value}`);
  }
  return parts.join(', ');
}

/** "receipts in July 2026, by mode" — how the question was read. */
export function describeReading(dataset: AskDataset, p: AskPlan): string {
  const scope = describeFilters(dataset, p);
  const group = dataset.groupBy.find((g) => g.key === p.groupBy);
  const grouped = p.groupBy ? `, by ${(group?.reads ?? group?.label ?? p.groupBy).toLowerCase()}` : '';
  return `${dataset.label.toLowerCase()}${scope ? ` ${scope}` : ''}${grouped}`;
}

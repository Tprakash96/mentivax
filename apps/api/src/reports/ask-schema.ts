import { Prisma } from '@mentivax/db';

/**
 * Tables the Ask role cannot read, so there is no point describing them. Keep in
 * step with the `ask_row_level_security` migration.
 */
const HIDDEN = new Set(['User', 'RefreshToken']);

/** Columns that are noise in a prompt, or that no question should filter on. */
const HIDDEN_FIELDS = new Set(['createdAt', 'updatedAt']);

/**
 * The rules a correct query has to know but the column names don't say.
 *
 * Without these an LLM writes SQL that is syntactically fine and financially
 * wrong: counting draft invoices as billed, counting voided receipts as
 * collected, or reporting paise as rupees. Every one of these was learned from
 * the existing reporting code, and they are the same rules the Reports page uses.
 */
const BUSINESS_RULES = `
MONEY
- Every money column is an INTEGER number of paise. 100 paise = ₹1. Never treat
  them as rupees. Do not divide in SQL — return paise and let the caller format.

INVOICES
- An invoice counts as real ("live") only when "status" IN ('PENDING','PARTIAL','PAID').
  DRAFT is not billable yet and CANCELLED no longer counts. Always exclude both
  unless the question is explicitly about drafts or cancellations.
- "netAmount" is what the parent owes after concession; "grossAmount" is before it;
  "discountAmount" is the concession. "paidAmount" is money received so far.
- Amount still owed = "netAmount" - "paidAmount" (never below zero).

RECEIPTS (payments)
- A voided receipt has "isActive" = false. Always filter isActive = true when
  summing money received.
- "Payment" has no academicYearId. Scope a payment to a year either through its
  allocations to invoices of that year, or by "paidAt" falling inside the year.
- "PaymentAllocation" splits one receipt across invoices; "lineId" names a
  specific fee line, or is NULL for a whole-invoice payment.

STUDENTS
- "enrollmentStatus": APPLICANT (not admitted yet), ACTIVE, TC_ISSUED, ALUMNI.
  A question about "students" means ACTIVE unless it says otherwise.
- "documents" is a text[] of the document names the school has COLLECTED, matched
  by name against the "DocumentType" table (which lists what the school asks for,
  with "required"). So "students who have not submitted the birth certificate" is
  students where NOT ('Birth certificate' = ANY("documents")).
- "feeExempt" students are billed nothing. "discountType"/"discountValue" hold a
  student-level concession: PERCENT is basis points (1000 = 10%), FLAT is paise.

TRANSPORT
- A student rides transport when "transportStopId" IS NOT NULL.
- Fares live on "TransportStop" ("bothWayFare", "oneWayFare", both paise);
  "transportShift" BOTH pays bothWayFare, MORNING/EVENING pay oneWayFare.
- Transport is billed through invoice lines whose "feeKey" starts with 'transport'.

FEES
- "InvoiceLine" is one fee head on one invoice; "feeKey"/"feeName" are snapshots
  taken at issue time. "periods" is a JSON array of per-instalment paise amounts
  (e.g. two terms), so jsonb_array_elements can break a fee into instalments.
- "FeeStructure" is what a class is charged for a fee type in a year.

STAFF, EXPENSES
- "Employee"."status" and "LedgerEntry"."status"/"kind" (INCOME/EXPENSE) drive
  those modules. "LedgerEntry" amounts are paise as well.
- A deleted voucher is soft-deleted: "LedgerEntry"."isActive" = false. It stays in
  the table so voucher numbers and history survive, but it must be excluded from
  every list and every total. Always filter isActive = true, the same way you
  would for a voided "Payment".

JOIN PATHS (the model gets these wrong when left to guess)
- An invoice has NO class column. Class is reached: "Invoice"."studentId" ->
  "Student"."id", then "Student"."classId" -> "SchoolClass"."id".
- A payment has no class either: "Payment"."studentId" -> "Student".
- Which vehicle a student rides: "Student"."transportStopId" -> "TransportStop",
  then "TransportStop"."routeId" -> "TransportRoute" (which holds "vehicleType"
  BUS/VAN and "vehicleNumber").
- Money a receipt put against an invoice: "PaymentAllocation"."paymentId" ->
  "Payment" and "PaymentAllocation"."invoiceId" -> "Invoice".
- Fee heads on an invoice: "InvoiceLine"."invoiceId" -> "Invoice".
- What a class is charged: "FeeStructure"."classId" + "FeeStructure"."feeTypeId".

SCOPE
- Row-level security already restricts every table to the caller's school. Do NOT
  add an "organizationId" filter — it is applied for you, and adding one only
  risks getting it wrong.
- Most tables also carry "academicYearId". The active year is given below; filter
  on it when the question is about this year (which is the usual case).
`.trim();

/** Postgres type names for the columns the model will actually use. */
function sqlType(field: Prisma.DMMF.Field): string {
  if (field.kind === 'enum') return `enum(${field.type})`;
  const base: Record<string, string> = {
    String: 'text',
    Int: 'integer',
    Float: 'double precision',
    Boolean: 'boolean',
    DateTime: 'timestamp',
    Json: 'jsonb',
    Decimal: 'numeric',
    BigInt: 'bigint',
  };
  const t = base[field.type] ?? field.type;
  return field.isList ? `${t}[]` : t;
}

/**
 * The database, as the model needs to see it: real table and column names,
 * quoted the way Postgres requires, plus enum values and foreign keys.
 *
 * Generated from Prisma's DMMF rather than hand-written, so it cannot drift out
 * of step with the schema — add a column and the prompt knows about it.
 */
export function askSchemaForPrompt(): string {
  const models = Prisma.dmmf.datamodel.models.filter((m) => !HIDDEN.has(m.name));
  const enums = new Map(Prisma.dmmf.datamodel.enums.map((e) => [e.name, e.values.map((v) => v.name)]));

  const lines: string[] = [];
  lines.push('TABLES (Postgres, names are case-sensitive — always double-quote them)');
  for (const m of models) {
    const cols = m.fields
      .filter((f) => f.kind !== 'object' && !HIDDEN_FIELDS.has(f.name))
      .map((f) => `"${f.name}" ${sqlType(f)}${f.isRequired ? '' : ' null'}`);
    lines.push(`"${m.name}"(${cols.join(', ')})`);

    // Relations, so joins are written against columns that exist.
    const fks = m.fields.filter((f) => f.kind === 'object' && f.relationFromFields?.length);
    if (fks.length) {
      const joins = fks
        .map((f) => `"${f.relationFromFields![0]}" -> "${f.type}"."${f.relationToFields?.[0] ?? 'id'}"`)
        .join(', ');
      lines.push(`  joins: ${joins}`);
    }
  }

  const used = [...enums.entries()].filter(([name]) =>
    models.some((m) => m.fields.some((f) => f.type === name)),
  );
  if (used.length) {
    lines.push('');
    lines.push('ENUMS');
    for (const [name, values] of used) lines.push(`${name}: ${values.join(' | ')}`);
  }

  lines.push('');
  lines.push('RULES THE COLUMN NAMES DO NOT TELL YOU');
  lines.push(BUSINESS_RULES);
  return lines.join('\n');
}

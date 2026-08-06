import { Fragment, useEffect, useMemo, useState } from 'react';
import { formatMoney, paiseToRupees, rupeesToPaise, type FeePeriod, type PaymentMode } from '@mentivax/core';
import type { Invoice, MentivaxClient, Payment, Student } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { Pagination, usePager } from '../components/Pagination';
import { StudentPicker } from '../components/StudentPicker';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

const MODE_LABEL: Record<PaymentMode, string> = {
  CASH: 'Cash',
  UPI: 'UPI / GPay',
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  CARD: 'Card',
};

// Selectable payment modes. Cheque is kept in MODE_LABEL so any historical
// cheque record still renders, but is no longer offered when recording a payment.
const MODES: { value: PaymentMode; label: string }[] = (['CASH', 'UPI', 'BANK_TRANSFER', 'CARD'] as PaymentMode[]).map(
  (value) => ({ value, label: MODE_LABEL[value] }),
);

/**
 * A single due unit for a student — one *period* of a fee line (or the whole
 * line when it isn't period-based). Amounts in paise. Grouping by `lineId`
 * reconstructs the parent fee; `periodLabel` is null for single-period lines.
 */
interface Due {
  key: string;
  invoiceId: string;
  lineId: string;
  feeName: string;
  period: FeePeriod;
  periodLabel: string | null;
  total: number;
  paid: number;
  pending: number;
}

/** Label for one instalment within a period-based line (matches InvoiceBreakdown). */
function periodLabel(period: FeePeriod, i: number): string {
  if (period === 'TERM') return `Term ${i + 1}`;
  if (period === 'MONTHLY') return `Instalment ${i + 1}`;
  return `Period ${i + 1}`;
}


/**
 * Net amount charged per period for each line of an invoice. Periods carry the
 * *gross* per-instalment split; concessions (per-line, then a whole-invoice one)
 * are settled earliest-period-first — exactly how InvoiceBreakdown shows them —
 * so the per-period nets sum to the line's netAmount.
 */
function netPeriodsByLine(inv: Invoice): { line: NonNullable<Invoice['lines']>[number]; nets: number[] }[] {
  const lines = inv.lines ?? [];
  const perLineHasDiscount = lines.some((l) => l.discountAmount > 0);
  let wholeRemaining = inv.discountAmount > 0 && !perLineHasDiscount ? inv.discountAmount : 0;
  return lines.map((l) => {
    const gross = Array.isArray(l.periods) && l.periods.length ? l.periods : [l.grossAmount];
    let lineRemaining = l.discountAmount;
    const nets = gross.map((g) => {
      let d = 0;
      if (lineRemaining > 0) {
        const take = Math.min(lineRemaining, g);
        d += take;
        lineRemaining -= take;
      }
      if (wholeRemaining > 0) {
        const take = Math.min(wholeRemaining, g - d);
        d += take;
        wholeRemaining -= take;
      }
      return g - d;
    });
    return { line: l, nets };
  });
}

/**
 * Loads a student's fee dues, broken down by fee line across their invoices
 * (oldest invoice first). Invoice-level `paidAmount` is distributed across its
 * lines sequentially so each fee shows how much is already paid vs. pending.
 */
async function loadDues(api: MentivaxClient, studentId: string): Promise<Due[]> {
  const invoices = (await api.invoices.list()).filter((i) => i.studentId === studentId);
  invoices.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const details = await Promise.all(invoices.map((i) => api.invoices.get(i.id)));
  const dues: Due[] = [];
  for (const inv of details) {
    // Already-collected money fills the earliest periods first, mirroring how
    // billing settles a student's ledger — so "Paid" lands on the right terms.
    let remainingPaid = inv.paidAmount;
    for (const { line: l, nets } of netPeriodsByLine(inv)) {
      const multi = nets.length > 1;
      nets.forEach((amt, i) => {
        const paid = Math.min(remainingPaid, amt);
        remainingPaid -= paid;
        dues.push({
          key: multi ? `${l.id}:${i}` : l.id,
          invoiceId: inv.id,
          lineId: l.id,
          feeName: l.feeName,
          period: l.period,
          periodLabel: multi ? periodLabel(l.period, i) : null,
          total: amt,
          paid,
          pending: Math.max(0, amt - paid),
        });
      });
    }
  }
  return dues;
}

type AllocRow = Due & { payNow: number; balance: number; eligible: boolean };

/**
 * Manual split: the user set a "Paying now" amount per fee line. Each line's
 * amount fills its own periods oldest-first (never more than the line's pending).
 */
function allocateManual(dues: Due[], payByLine: Record<string, number>) {
  const rem: Record<string, number> = { ...payByLine };
  const rows: AllocRow[] = dues.map((d) => {
    const budget = rem[d.lineId] ?? 0;
    const payNow = d.pending > 0 ? Math.min(budget, d.pending) : 0;
    rem[d.lineId] = budget - payNow;
    return { ...d, payNow, balance: d.pending - payNow, eligible: (payByLine[d.lineId] ?? 0) > 0 };
  });
  const pendingBefore = dues.reduce((s, d) => s + d.pending, 0);
  const payingNow = rows.reduce((s, r) => s + r.payNow, 0);
  return {
    rows,
    pendingBefore,
    selectedPending: pendingBefore,
    payingNow,
    pendingAfter: Math.max(0, pendingBefore - payingNow),
    advance: 0,
  };
}

/**
 * Top-down split: the amount fills the ticked ("pay towards") fees from the top
 * of the list down — each fee cleared in full (oldest period first) before the
 * next gets anything. Un-ticked fees are skipped entirely. Every fee is ticked
 * by default, so a plain amount simply pours top-to-bottom across all dues.
 */
function allocateTopDown(dues: Due[], amountPaise: number, excluded: Set<string>) {
  let rem = amountPaise;
  const payByKey: Record<string, number> = {};
  for (const d of dues) {
    if (excluded.has(d.feeName) || d.pending <= 0) continue;
    const pay = Math.min(rem, d.pending);
    payByKey[d.key] = pay;
    rem -= pay;
  }
  const rows: AllocRow[] = dues.map((d) => {
    const payNow = payByKey[d.key] ?? 0;
    return { ...d, payNow, balance: d.pending - payNow, eligible: !excluded.has(d.feeName) };
  });
  const pendingBefore = dues.reduce((s, d) => s + d.pending, 0);
  const selectedPending = dues.reduce((s, d) => s + (excluded.has(d.feeName) ? 0 : d.pending), 0);
  const advance = Math.max(0, rem);
  const payingNow = amountPaise - advance;
  return {
    rows,
    pendingBefore,
    selectedPending,
    payingNow,
    pendingAfter: Math.max(0, pendingBefore - payingNow),
    advance,
  };
}

export function PaymentsPage() {
  const { api, can } = useApi();
  const toast = useToast();
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [collectedOpen, setCollectedOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [viewing, setViewing] = useState<Payment | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const summary = useAsync(() => api.payments.summary(), []);
  const payments = useAsync(() => api.payments.list({ search }), [search]);
  const pager = usePager(payments.data ?? []);

  const s = summary.data;
  const collectedPct = s && s.totalInvoiced > 0 ? Math.round((s.collected / s.totalInvoiced) * 100) : 0;

  const reloadAll = () => {
    summary.reload();
    payments.reload();
  };

  // Void a payment: reverses its allocations on the invoices it paid and marks
  // it inactive (Collected / Balance due follow). Reversible-safe, but confirm first.
  const voidPayment = async (p: Payment) => {
    if (!window.confirm(`Void payment ${p.receiptNo} (${p.studentName}, ${formatMoney(p.amount)})? This reverses it from the invoices it paid.`)) return;
    setVoidingId(p.id);
    try {
      await api.payments.deactivate(p.id);
      reloadAll();
      toast(`Payment ${p.receiptNo} voided`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not void payment');
    } finally {
      setVoidingId(null);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Payments</h1>
          <div className="sub">Counter collections, allocated period by period</div>
        </div>
      </div>

      <div className="paygrid">
        <button className="paycard inv clickable" onClick={() => setInvOpen(true)}>
          <div className="h">
            <span className="ic" style={{ background: 'var(--blue-soft)', color: 'var(--blue)' }}>
              <Icon name="invoice" size={16} />
            </span>
            Total invoiced
          </div>
          <div className="big">{formatMoney(s?.totalInvoiced ?? 0)}</div>
          <div className="sub">
            {s?.invoiceCount ?? 0} invoices issued <span className="viewhint">· view details ›</span>
          </div>
        </button>
        <button className="paycard paid clickable" onClick={() => setCollectedOpen(true)}>
          <div className="h">
            <span className="ic" style={{ background: 'var(--green-soft)', color: 'var(--green-ink)' }}>
              <Icon name="check" size={16} />
            </span>
            Collected
          </div>
          <div className="big">{formatMoney(s?.collected ?? 0)}</div>
          <div className="sub">
            {collectedPct}% of invoiced <span className="viewhint">· view details ›</span>
          </div>
        </button>
        <button className="paycard due clickable" onClick={() => setDueOpen(true)}>
          <div className="h">
            <span className="ic" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>
              <Icon name="building" size={16} />
            </span>
            Balance due
          </div>
          <div className="big">{formatMoney(s?.balanceDue ?? 0)}</div>
          <div className="sub">
            across all students <span className="viewhint">· view details ›</span>
          </div>
        </button>
      </div>

      <div className="tbar">
        <h4 className="section">Transaction history</h4>
        <div className="sp" />
        <div className="search">
          <Icon name="search" />
          <input
            placeholder="Search student, receipt…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn grn" onClick={() => setOpen(true)}>
          <Icon name="plus" size={15} />
          Add payment
        </button>
      </div>

      <div className="card-t">
        <table>
          <thead>
            <tr>
              <th>Receipt</th>
              <th>Date</th>
              <th>Student</th>
              <th className="num">Amount</th>
              <th>Mode</th>
              <th>Note</th>
              <th className="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pager.pageItems.map((p) => (
              <Fragment key={p.id}>
                <tr className={p.isActive ? undefined : 'pay-inactive'}>
                  <td className="mono" style={{ fontSize: '12.5px' }}>
                    {p.receiptNo}
                    {!p.isActive && <span className="tag old inactive-tag">Inactive</span>}
                  </td>
                  <td className="mono" style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>
                    {p.paidAt.slice(0, 10)}
                  </td>
                  <td>
                    <b style={{ fontWeight: 600 }}>{p.studentName}</b>
                  </td>
                  <td className="num">
                    <button
                      className="amt-toggle"
                      onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                      title="Show period breakdown"
                    >
                      {formatMoney(p.amount)}
                      <Icon
                        name="chevron"
                        size={13}
                        style={{ transform: expanded === p.id ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
                      />
                    </button>
                  </td>
                  <td>
                    <span className={`mode-chip mode-${p.mode.toLowerCase()}`}>{MODE_LABEL[p.mode]}</span>
                  </td>
                  <td style={{ color: 'var(--ink-3)' }}>{p.description ?? '—'}</td>
                  <td className="num">
                    <div className="rowacts">
                      <button className="btn sm grn" onClick={() => setEditing(p)}>
                        <Icon name="pencil" size={13} />
                        Edit
                      </button>
                      <button className="btn sm grn" onClick={() => setViewing(p)}>
                        <Icon name="eye" size={13} />
                        View
                      </button>
                      {p.isActive && can('payments:delete') && (
                        <button
                          className="btn sm danger"
                          disabled={voidingId === p.id}
                          onClick={() => voidPayment(p)}
                          title="Void this payment"
                        >
                          <Icon name="x" size={13} />
                          {voidingId === p.id ? 'Voiding…' : 'Void'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {expanded === p.id && (
                  <tr className="brk-row">
                    <td colSpan={7}>
                      <PaymentBreakdownDetail id={p.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {payments.loading && <div className="state">Loading payments…</div>}
        {payments.error && <div className="state err">{payments.error}</div>}
        {!payments.loading && !payments.error && (payments.data?.length ?? 0) === 0 && (
          <div className="state">No payments recorded yet.</div>
        )}
        <Pagination
          page={pager.page}
          pages={pager.pages}
          pageSize={pager.pageSize}
          total={pager.total}
          onPage={pager.setPage}
          onPageSize={pager.setPageSize}
        />
      </div>

      {open && (
        <RecordPaymentModal
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            reloadAll();
            toast('Payment recorded — receipt generated, invoices updated');
          }}
        />
      )}
      {editing && (
        <RecordPaymentModal
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reloadAll();
            toast('Payment updated — invoices re-allocated');
          }}
        />
      )}
      {viewing && <PaymentViewModal p={viewing} onClose={() => setViewing(null)} />}
      {invOpen && <InvoicesDetailModal onClose={() => setInvOpen(false)} />}
      {collectedOpen && <CollectedDetailModal onClose={() => setCollectedOpen(false)} />}
      {dueOpen && <BalanceDueDetailModal onClose={() => setDueOpen(false)} />}
    </>
  );
}

/** Read-only detail of one payment: header, amount, note, and period breakdown. */
function PaymentViewModal({ p, onClose }: { p: Payment; onClose: () => void }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, width: '94%' }}>
        <div className="mh">
          <div>
            <b>
              {p.receiptNo} · {p.studentName}
            </b>
            <span>Payment details</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb">
          <div className="inv-meta">
            <span className="mono">{p.paidAt.slice(0, 10)}</span>
            <span className={`mode-chip mode-${p.mode.toLowerCase()}`}>{MODE_LABEL[p.mode]}</span>
            {!p.isActive && (
              <span className="tag old">
                <i />
                Inactive
              </span>
            )}
          </div>

          <div className="alloc-sums" style={{ marginTop: 12, gridTemplateColumns: '1fr' }}>
            <div className="alloc-sum pay">
              <span>Amount received</span>
              <b>{formatMoney(p.amount)}</b>
            </div>
          </div>

          {p.description && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
              Note: {p.description}
            </div>
          )}

          <h4 className="std-sec" style={{ marginTop: 18, marginBottom: 10 }}>
            Period breakdown
          </h4>
          <div className="card-t pay-view-brk">
            <PaymentBreakdownDetail id={p.id} />
          </div>
        </div>
        <div className="mf">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const INV_STATUS: Record<string, { cls: string; label: string }> = {
  PAID: { cls: 'paid', label: 'Paid' },
  PARTIAL: { cls: 'part', label: 'Partial' },
  PENDING: { cls: 'due', label: 'Pending' },
  DRAFT: { cls: 'old', label: 'Draft' },
  CANCELLED: { cls: 'old', label: 'Cancelled' },
};

/** Read-only list of every invoice issued, opened from the Total invoiced card. */
export function InvoicesDetailModal({ onClose, scope }: { onClose: () => void; scope?: Invoice[] }) {
  const { api } = useApi();
  const invoices = useAsync(() => (scope ? Promise.resolve(scope) : api.invoices.list()), []);
  const list = invoices.data ?? [];
  const total = list.reduce((n, i) => n + i.netAmount, 0);

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 780, width: '94%' }}>
        <div className="mh">
          <div>
            <b>Invoices issued{list.length ? ` · ${list.length}` : ''}</b>
            <span>{scope ? 'Matching the current filter' : 'Every invoice for the active year'} — {formatMoney(total)} total</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb" style={{ padding: 0 }}>
          <div className="card-t" style={{ border: 'none', boxShadow: 'none', borderRadius: 0, minHeight: 0, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Issued</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((v) => {
                  const st = INV_STATUS[v.status] ?? INV_STATUS.PENDING!;
                  return (
                    <tr key={v.id}>
                      <td className="mono" style={{ fontSize: '12.5px' }}>
                        {v.number}
                      </td>
                      <td>
                        <b style={{ fontWeight: 600 }}>{v.studentName}</b>
                      </td>
                      <td>
                        <span className="cls">{v.className}</span>
                      </td>
                      <td className="mono" style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>
                        {v.issueDate.slice(0, 10)}
                      </td>
                      <td className="num">{formatMoney(v.netAmount)}</td>
                      <td>
                        <span className={`tag ${st.cls}`}>
                          <i />
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {invoices.loading && <div className="state">Loading invoices…</div>}
          {invoices.error && <div className="state err">{invoices.error}</div>}
          {!invoices.loading && list.length === 0 && (
            <div className="state">No invoices issued yet.</div>
          )}
        </div>
        <div className="mf">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** Read-only list of every collected payment, opened from the Collected card. */
export function CollectedDetailModal({ onClose, scope }: { onClose: () => void; scope?: Invoice[] }) {
  const { api } = useApi();
  const payments = useAsync(() => (scope ? Promise.resolve([]) : api.payments.list()), []);
  // Which payment row is expanded to show its period-wise breakdown.
  const [openId, setOpenId] = useState<string | null>(null);
  // Scoped view: collected per matching invoice. Global view: every payment receipt.
  const collectedInvoices = (scope ?? []).filter((v) => v.paidAmount > 0);
  const list = payments.data ?? [];
  const total = scope
    ? collectedInvoices.reduce((n, v) => n + v.paidAmount, 0)
    : list.reduce((n, p) => n + p.amount, 0);

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760, width: '94%' }}>
        <div className="mh">
          <div>
            <b>Collected{scope ? ` · ${collectedInvoices.length}` : list.length ? ` · ${list.length} payments` : ''}</b>
            <span>{scope ? 'Collected on matching invoices' : 'Every payment received this year'} — {formatMoney(total)} total</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb" style={{ padding: 0 }}>
          <div className="card-t" style={{ border: 'none', boxShadow: 'none', borderRadius: 0, minHeight: 0, overflowY: 'auto' }}>
            {scope ? (
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Student</th>
                    <th>Class</th>
                    <th className="num">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {collectedInvoices.map((v) => (
                    <tr key={v.id}>
                      <td className="mono" style={{ fontSize: '12.5px' }}>{v.number}</td>
                      <td><b style={{ fontWeight: 600 }}>{v.studentName}</b></td>
                      <td><span className="cls">{v.className}</span></td>
                      <td className="num" style={{ color: 'var(--success-ink)', fontWeight: 650 }}>{formatMoney(v.paidAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Date</th>
                    <th>Student</th>
                    <th className="num">Amount</th>
                    <th>Mode</th>
                    <th aria-label="expand" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => {
                    const open = openId === p.id;
                    return (
                      <Fragment key={p.id}>
                        <tr
                          className="pay-row"
                          onClick={() => setOpenId(open ? null : p.id)}
                          style={{ cursor: 'pointer', background: open ? 'var(--green-soft)' : undefined }}
                        >
                          <td className="mono" style={{ fontSize: '12.5px' }}>
                            {p.receiptNo}
                          </td>
                          <td className="mono" style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>
                            {p.paidAt.slice(0, 10)}
                          </td>
                          <td>
                            <b style={{ fontWeight: 600 }}>{p.studentName}</b>
                          </td>
                          <td className="num" style={{ color: 'var(--success-ink)', fontWeight: 650 }}>
                            {formatMoney(p.amount)}
                          </td>
                          <td>
                            <span className={`mode-chip mode-${p.mode.toLowerCase()}`}>{MODE_LABEL[p.mode]}</span>
                          </td>
                          <td className="num" style={{ color: 'var(--ink-3)' }}>
                            <span style={{ display: 'inline-flex', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }}>
                              <Icon name="chevron" size={16} />
                            </span>
                          </td>
                        </tr>
                        {open && (
                          <tr className="pay-detail-row">
                            <td colSpan={6} style={{ padding: '4px 14px 14px', background: 'var(--green-soft)' }}>
                              {p.description && (
                                <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{p.description}</div>
                              )}
                              <PaymentBreakdownDetail id={p.id} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {payments.loading && <div className="state">Loading payments…</div>}
          {scope && collectedInvoices.length === 0 && <div className="state">Nothing collected on these invoices yet.</div>}
          {!scope && !payments.loading && list.length === 0 && (
            <div className="state">No payments collected yet.</div>
          )}
        </div>
        <div className="mf">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** Invoices with an outstanding balance, opened from the Balance due card. */
export function BalanceDueDetailModal({ onClose, scope }: { onClose: () => void; scope?: Invoice[] }) {
  const { api } = useApi();
  const invoices = useAsync(() => (scope ? Promise.resolve(scope) : api.invoices.list()), []);
  const due = (invoices.data ?? [])
    .map((v) => ({ ...v, pending: Math.max(0, v.netAmount - v.paidAmount) }))
    .filter((v) => v.pending > 0);
  const total = due.reduce((n, v) => n + v.pending, 0);

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820, width: '94%' }}>
        <div className="mh">
          <div>
            <b>Balance due{due.length ? ` · ${due.length}` : ''}</b>
            <span>Invoices still owing — {formatMoney(total)} total</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb" style={{ padding: 0 }}>
          <div className="card-t" style={{ border: 'none', boxShadow: 'none', borderRadius: 0, minHeight: 0, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th className="num">Net</th>
                  <th className="num">Paid</th>
                  <th className="num">Pending</th>
                </tr>
              </thead>
              <tbody>
                {due.map((v) => (
                  <tr key={v.id}>
                    <td className="mono" style={{ fontSize: '12.5px' }}>
                      {v.number}
                    </td>
                    <td>
                      <b style={{ fontWeight: 600 }}>{v.studentName}</b>
                    </td>
                    <td>
                      <span className="cls">{v.className}</span>
                    </td>
                    <td className="num">{formatMoney(v.netAmount)}</td>
                    <td className="num muted">{formatMoney(v.paidAmount)}</td>
                    <td className="num pending-red">{formatMoney(v.pending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {invoices.loading && <div className="state">Loading…</div>}
          {!invoices.loading && due.length === 0 && (
            <div className="state">Nothing due — everything is paid up.</div>
          )}
        </div>
        <div className="mf">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function RecordPaymentModal({
  onClose,
  onSaved,
  editing,
  initialStudentId,
}: {
  onClose: () => void;
  onSaved: () => void;
  editing?: Payment | null;
  initialStudentId?: string;
}) {
  const { api } = useApi();
  const students = useAsync(() => (editing ? Promise.resolve([]) : api.students.list({})), []);
  const [studentId, setStudentId] = useState(editing?.studentId ?? initialStudentId ?? '');
  const [rupees, setRupees] = useState(editing ? String(paiseToRupees(editing.amount)) : '');
  // Manual split: user typed a "Paying now" per fee. Keyed by lineId, in rupee strings.
  const [manualMode, setManualMode] = useState(false);
  const [manualPay, setManualPay] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<PaymentMode>(editing?.mode ?? 'CASH');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const list: Student[] = students.data ?? [];
  const amount = Number(rupees) || 0;

  // Live fee allocation preview (record mode only).
  const dues = useAsync(
    () => (!editing && studentId ? loadDues(api, studentId) : Promise.resolve<Due[]>([])),
    [studentId, editing],
  );
  // One entry per fee (name + total pending) for the "clear first" checkbox list.
  const feeSummary = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of dues.data ?? []) m.set(d.feeName, (m.get(d.feeName) ?? 0) + d.pending);
    return [...m.entries()].map(([feeName, pending]) => ({ feeName, pending }));
  }, [dues.data]);
  // Fees the user un-ticked (skipped). Empty = every fee is paid towards, so all
  // boxes are checked by default and the amount fills them top-to-bottom.
  const [excludedFees, setExcludedFees] = useState<Set<string>>(new Set());
  // Fresh student → pay towards every fee again, and drop any manual split.
  useEffect(() => {
    setExcludedFees(new Set());
    setManualMode(false);
    setManualPay({});
  }, [dues.data]);

  // Auto split: pour the amount top-to-bottom across the still-ticked fees.
  const autoAlloc = useMemo(
    () => allocateTopDown(dues.data ?? [], rupeesToPaise(amount), excludedFees),
    [dues.data, amount, excludedFees],
  );
  // Tick/untick a fee: also drop any manual split so the amount re-drives.
  const toggleExcluded = (feeName: string) => {
    setManualMode(false);
    setManualPay({});
    setExcludedFees((s) => {
      const next = new Set(s);
      if (next.has(feeName)) next.delete(feeName);
      else next.add(feeName);
      return next;
    });
  };
  // Manual split: honour each fee's typed "Paying now".
  const manualPaise = useMemo(() => {
    const m: Record<string, number> = {};
    for (const [lineId, v] of Object.entries(manualPay)) m[lineId] = rupeesToPaise(Number(v) || 0);
    return m;
  }, [manualPay]);
  const manualAlloc = useMemo(
    () => allocateManual(dues.data ?? [], manualPaise),
    [dues.data, manualPaise],
  );
  const alloc = manualMode ? manualAlloc : autoAlloc;

  // The auto split per fee line — used to seed the manual inputs on first edit.
  const autoPayByLine = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of autoAlloc.rows) m[r.lineId] = (m[r.lineId] ?? 0) + r.payNow;
    return m;
  }, [autoAlloc]);

  // First edit of any fee input seeds every fee from the current auto split, so
  // switching to manual keeps whatever was already allocated, then applies the edit.
  const editFee = (lineId: string, value: string) => {
    if (!manualMode) {
      const seed: Record<string, string> = {};
      for (const [lid, paise] of Object.entries(autoPayByLine)) {
        seed[lid] = paise > 0 ? String(paiseToRupees(paise)) : '';
      }
      seed[lineId] = value;
      setManualPay(seed);
      setManualMode(true);
    } else {
      setManualPay((m) => ({ ...m, [lineId]: value }));
    }
  };
  const resetToAuto = () => {
    setManualMode(false);
    setManualPay({});
  };

  // The amount actually being paid (manual = sum of the split; auto = the field).
  const effectivePaise = manualMode ? manualAlloc.payingNow : rupeesToPaise(amount);
  const valid = (editing ? true : !!studentId) && (editing ? amount > 0 : effectivePaise > 0);
  // Group the flat period rows back under their parent fee line, preserving order.
  const allocGroups = useMemo(() => {
    const map = new Map<string, { lineId: string; feeName: string; period: FeePeriod; rows: AllocRow[] }>();
    const order: string[] = [];
    for (const r of alloc.rows as AllocRow[]) {
      let g = map.get(r.lineId);
      if (!g) {
        g = { lineId: r.lineId, feeName: r.feeName, period: r.period, rows: [] };
        map.set(r.lineId, g);
        order.push(r.lineId);
      }
      g.rows.push(r);
    }
    return order.map((id) => map.get(id)!);
  }, [alloc]);
  const showPreview = !editing && !!studentId && (dues.data?.length ?? 0) > 0;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setErr(null);
    try {
      if (editing) {
        await api.payments.update(editing.id, {
          amount: rupeesToPaise(amount),
          mode,
          description: description || undefined,
        });
      } else {
        // Persist exactly the split shown on the left (checkbox-priority, manual
        // per-fee, or plain oldest-first) as one allocation per fee line, so what
        // the user sees is what's recorded. No preview → let the API auto-apply.
        let allocations: { invoiceId: string; lineId: string; amount: number }[] | undefined;
        if (showPreview) {
          const byLine = new Map<string, { invoiceId: string; lineId: string; amount: number }>();
          for (const r of alloc.rows) {
            if (r.payNow <= 0) continue;
            const g = byLine.get(r.lineId);
            if (g) g.amount += r.payNow;
            else byLine.set(r.lineId, { invoiceId: r.invoiceId, lineId: r.lineId, amount: r.payNow });
          }
          allocations = [...byLine.values()];
        }
        await api.payments.create({
          studentId,
          amount: effectivePaise,
          mode,
          description: description || undefined,
          allocations,
        });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 1000, width: '95vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="mh">
          <div>
            <b>{editing ? 'Edit payment' : 'Add payment'}</b>
            <span>
              {editing
                ? `Receipt ${editing.receiptNo} · re-allocates to the student's open invoices`
                : "Auto-allocates to the student's oldest open invoices"}
            </span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div className="ai-split">
            {/* LEFT — period-based payment allocation */}
            <div className="ai-right">
              {showPreview ? (
                <>
                  <h4 className="std-sec" style={{ marginTop: 0, marginBottom: 8 }}>Period-based payment allocation</h4>
                  <div className="pba-grid">
                    {allocGroups.map((g) => {
                      const agg = g.rows.reduce(
                        (a, r) => ({
                          total: a.total + r.total,
                          paid: a.paid + r.paid,
                          pending: a.pending + r.pending,
                          payNow: a.payNow + r.payNow,
                          balance: a.balance + r.balance,
                        }),
                        { total: 0, paid: 0, pending: 0, payNow: 0, balance: 0 },
                      );
                      const eligible = g.rows[0]!.eligible;
                      const payVal = manualMode
                        ? (manualPay[g.lineId] ?? '')
                        : agg.payNow > 0
                          ? String(paiseToRupees(agg.payNow))
                          : '';
                      return (
                        <div className={`pba-group${eligible ? '' : ' alloc-off'}`} key={g.lineId}>
                          <div className="pba-title">
                            <span>{g.feeName}</span>
                            <span className="pba-title-right">
                              <span className="pba-pay">
                                Pay ₹
                                <input
                                  className="pba-pay-in"
                                  type="number"
                                  min={0}
                                  max={paiseToRupees(agg.pending)}
                                  value={payVal}
                                  disabled={agg.pending === 0}
                                  placeholder="0"
                                  onChange={(e) => editFee(g.lineId, e.target.value)}
                                />
                              </span>
                              <span className="pba-total mono">/ {formatMoney(agg.total)}</span>
                            </span>
                          </div>
                          <div className="pba-note">
                            <Icon name="info" size={13} />
                            Type what to pay for this fee — it settles the oldest period first.
                          </div>
                          <div className="card-t" style={{ overflowX: 'auto' }}>
                            <table className="fs-tbl">
                              <colgroup>
                                <col style={{ width: '26%' }} />
                                <col style={{ width: '14%' }} />
                                <col style={{ width: '12%' }} />
                                <col style={{ width: '16%' }} />
                                <col style={{ width: '16%' }} />
                                <col style={{ width: '16%' }} />
                              </colgroup>
                              <thead>
                                <tr>
                                  <th>Period</th>
                                  <th className="num">Total</th>
                                  <th className="num">Paid</th>
                                  <th className="num">Pending</th>
                                  <th className="num">Paying now</th>
                                  <th className="num">Balance</th>
                                </tr>
                              </thead>
                              <tbody>
                                {g.rows.map((r) => {
                                  const rowCls = r.payNow > 0 ? (r.balance === 0 ? 'alloc-full' : 'alloc-part') : '';
                                  const label = r.periodLabel ?? (g.period === 'DUE_DATE' ? 'On due date' : 'One-time');
                                  return (
                                    <tr key={r.key} className={rowCls}>
                                      <td><span className="fs-chip">{label}</span></td>
                                      <td className="num mono">{formatMoney(r.total)}</td>
                                      <td className={`num mono${r.paid > 0 ? ' amt-paid' : ' muted'}`}>{r.paid > 0 ? formatMoney(r.paid) : '—'}</td>
                                      <td className={`num mono${r.pending > 0 ? ' amt-due' : ' muted'}`}>{r.pending > 0 ? formatMoney(r.pending) : '—'}</td>
                                      <td className="num mono" style={{ color: r.payNow > 0 ? 'var(--success-ink)' : 'var(--ink-4)', fontWeight: 600 }}>
                                        {r.payNow > 0 ? formatMoney(r.payNow) : '—'}
                                      </td>
                                      <td className={`num mono${r.balance > 0 ? ' pending-red' : ' muted'}`}>
                                        {formatMoney(r.balance)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {alloc.advance > 0 && (
                    <div className="alloc-note">
                      {formatMoney(alloc.advance)} is more than the selected dues — it will be recorded as an advance.
                    </div>
                  )}
                </>
              ) : (
                <div className="ai-empty">
                  {editing
                    ? 'Editing re-allocates to the open invoices automatically.'
                    : !editing && studentId && dues.loading
                      ? 'Loading dues…'
                      : 'Pick a student to see the payment allocation.'}
                </div>
              )}
            </div>

            {/* RIGHT — the payment form */}
            <div className="ai-left">
              <div className="fld">
                <label>Student</label>
                {editing ? (
                  <input value={editing.studentName} disabled />
                ) : (
                  <StudentPicker students={list} value={studentId} onChange={setStudentId} />
                )}
              </div>
              <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="fld">
                  <label>
                    Amount (₹)
                    {showPreview && manualMode ? (
                      <button type="button" className="linkbtn" onClick={resetToAuto}>
                        Reset to auto-split
                      </button>
                    ) : (
                      showPreview &&
                      alloc.selectedPending > 0 && (
                        <button
                          type="button"
                          className="linkbtn"
                          onClick={() => setRupees(String(paiseToRupees(alloc.selectedPending)))}
                        >
                          Pay full · {formatMoney(alloc.selectedPending)}
                        </button>
                      )
                    )}
                  </label>
                  {manualMode ? (
                    <input value={paiseToRupees(effectivePaise)} disabled title="Set by the per-fee split on the left" />
                  ) : (
                    <input type="number" min={0} value={rupees} onChange={(e) => setRupees(e.target.value)} placeholder="0" />
                  )}
                </div>
                <div className="fld">
                  <label>Payment mode</label>
                  <select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
                    {MODES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {showPreview && feeSummary.length > 0 && (
                <div className="fld">
                  <label>Fees to pay towards (untick to skip)</label>
                  <div className="fee-checks">
                    {feeSummary.map((f) => (
                      <label key={f.feeName} className={`fee-check${f.pending === 0 ? ' off' : ''}`}>
                        <input
                          type="checkbox"
                          checked={f.pending > 0 && !excludedFees.has(f.feeName)}
                          disabled={f.pending === 0}
                          onChange={() => toggleExcluded(f.feeName)}
                        />
                        <span className="fee-check-name">{f.feeName}</span>
                        <span className="fee-check-amt mono">{formatMoney(f.pending)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {showPreview && (
                <div className="alloc-sums" style={{ gridTemplateColumns: '1fr', gap: 10 }}>
                  <div className="alloc-sum">
                    <span>Pending before</span>
                    <b>{formatMoney(alloc.pendingBefore)}</b>
                  </div>
                  <div className="alloc-sum pay">
                    <span>Paying now</span>
                    <b>{formatMoney(alloc.payingNow)}</b>
                  </div>
                  <div className="alloc-sum due">
                    <span>Pending after</span>
                    <b>{formatMoney(alloc.pendingAfter)}</b>
                  </div>
                </div>
              )}

              <div className="fld">
                <label>Description (optional)</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Term 1 school fee" />
              </div>
              <div className="totalbar">
                <span>Total amount{manualMode ? ' · manual split' : ''}</span>
                <b>{formatMoney(editing ? rupeesToPaise(amount) : effectivePaise)}</b>
              </div>
              {err && <div className="state err">{err}</div>}
            </div>
          </div>
        </div>
        <div className="mf">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn grn" disabled={!valid || saving} onClick={save}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Expandable period-wise breakdown of one payment (fee × period it covered). */
function PaymentBreakdownDetail({ id }: { id: string }) {
  const { api } = useApi();
  const bd = useAsync(() => api.payments.breakdown(id), [id]);
  const rows = bd.data?.rows ?? [];
  return (
    <div className="brk">
      {bd.loading && <span className="muted">Loading breakdown…</span>}
      {bd.error && <span className="state err">{bd.error}</span>}
      {!bd.loading && !bd.error && rows.length === 0 && (
        <span className="muted">No period breakdown available for this payment.</span>
      )}
      {rows.length > 0 && (
        <table className="brk-tbl">
          <thead>
            <tr>
              <th>Fee</th>
              <th>Period</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <b>{r.feeName}</b>
                </td>
                <td>
                  <span className="fs-chip">{r.period}</span>
                </td>
                <td className="num">{formatMoney(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

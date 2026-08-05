import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatMoney, paiseToRupees, rupeesToPaise, type FeePeriod, type InvoiceStatus } from '@mentivax/core';
import type { Invoice, InvoiceLine } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { Pagination, usePager } from '../components/Pagination';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AddInvoiceModal } from './GenerateInvoicesPage';
import { InvoicesDetailModal, CollectedDetailModal, BalanceDueDetailModal } from './PaymentsPage';

const STATUS_TAG: Record<string, { cls: string; label: string }> = {
  PAID: { cls: 'paid', label: 'Paid' },
  PARTIAL: { cls: 'part', label: 'Partial' },
  PENDING: { cls: 'due', label: 'Pending' },
  DRAFT: { cls: 'old', label: 'Draft' },
  CANCELLED: { cls: 'old', label: 'Cancelled' },
};

function statusTag(s: InvoiceStatus) {
  const t = STATUS_TAG[s] ?? STATUS_TAG.PENDING!;
  return (
    <span className={`tag ${t.cls}`}>
      <i />
      {t.label}
    </span>
  );
}

export function InvoicesPage() {
  const { api } = useApi();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [statOpen, setStatOpen] = useState<null | 'billed' | 'collected' | 'pending'>(null);
  const [editRow, setEditRow] = useState<Invoice | null>(null);
  const { data, loading, error, reload } = useAsync(() => api.invoices.list({ search }), [search]);

  // Deep link from "Edit invoice in Fees →" (e.g. right after admitting a student).
  const editParam = params.get('edit');
  useEffect(() => {
    if (!editParam) return;
    let active = true;
    api.invoices
      .get(editParam)
      .then((inv) => active && setEditRow(inv))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [editParam, api]);
  // Class-wise view: defaults to All (so every invoice shows), filter by class.
  const classes = useAsync(() => api.classes.list(), []);
  const [cls, setCls] = useState<string | 'all'>('all');

  const rows = data ?? [];
  const countByClass = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of rows) m[i.className] = (m[i.className] ?? 0) + 1;
    return m;
  }, [rows]);
  const filtered = cls && cls !== 'all' ? rows.filter((i) => i.className === cls) : rows;
  const pager = usePager(filtered);

  // Billed / Collected / Pending track the *current view* (search + class filter)
  // so the totals always agree with the class counts and the list below them.
  const filterActive = search.trim() !== '' || (cls !== 'all' && cls !== null);
  const billedTotal = filtered.reduce((s, i) => s + i.netAmount, 0);
  const collectedTotal = filtered.reduce((s, i) => s + i.paidAmount, 0);
  const pendingTotal = filtered.reduce((s, i) => s + Math.max(0, i.netAmount - i.paidAmount), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Invoices</h1>
          <div className="sub">Every invoice issued this year, verified standard by standard</div>
        </div>
      </div>

      <div className="statbar">
        <button className="statbar-fig" onClick={() => setStatOpen('billed')} title="See these invoices">
          <span>Billed {filterActive && <span className="muted">· filtered</span>}<span className="sb-hint"> · view ›</span></span>
          <b style={{ color: 'var(--ink-deep)' }}>{formatMoney(billedTotal)}</b>
        </button>
        <button className="statbar-fig" onClick={() => setStatOpen('collected')} title="See what's collected">
          <span>Collected {filterActive && <span className="muted">· filtered</span>}<span className="sb-hint"> · view ›</span></span>
          <b className="pos">{formatMoney(collectedTotal)}</b>
        </button>
        <button className="statbar-fig" onClick={() => setStatOpen('pending')} title="See what's owing">
          <span>Pending {filterActive && <span className="muted">· filtered</span>}<span className="sb-hint"> · view ›</span></span>
          <b style={{ color: 'var(--red-fig)' }}>{formatMoney(pendingTotal)}</b>
        </button>
        <div className="statbar-sp" />
        <div className="search">
          <Icon name="search" />
          <input placeholder="Search invoice, student…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="btn grn" onClick={() => setAddOpen(true)}>
          <Icon name="plus" size={15} />
          Add invoice
        </button>
      </div>

      {addOpen && (
        <AddInvoiceModal
          onClose={() => setAddOpen(false)}
          onDone={() => {
            setAddOpen(false);
            reload();
          }}
        />
      )}

      <div className="fs-layout">
        <div className="classlist">
          <button className={`cli${cls === 'all' ? ' on' : ''}`} onClick={() => setCls('all')}>
            All classes
            <span className="n">{rows.length}</span>
          </button>
          {(classes.data ?? []).map((c) => (
            <button
              key={c.id}
              className={`cli${cls === c.name ? ' on' : ''}`}
              onClick={() => setCls(c.name)}
            >
              {c.name}
              <span className="n">{countByClass[c.name] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="card-t" style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Student</th>
              <th>Class</th>
              <th className="num">Invoiced</th>
              <th className="num">Paid</th>
              <th className="num">Pending</th>
              <th>Status</th>
              <th className="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pager.pageItems.map((v) => {
              const pending = Math.max(0, v.netAmount - v.paidAmount);
              return (
                <tr key={v.id} className="click" onClick={() => setDetailId(v.id)}>
                  <td className="mono" style={{ fontSize: '12.5px' }}>
                    {v.number}
                  </td>
                  <td>
                    <b style={{ fontWeight: 600 }}>{v.studentName}</b>
                  </td>
                  <td>
                    <span className="cls">{v.className}</span>
                  </td>
                  <td className="num mono">{formatMoney(v.netAmount)}</td>
                  <td className="num mono" style={{ color: v.paidAmount > 0 ? 'var(--success-ink)' : 'var(--ink-6)' }}>
                    {v.paidAmount > 0 ? formatMoney(v.paidAmount) : '—'}
                  </td>
                  <td className="num mono" style={{ color: pending > 0 ? 'var(--red-fig)' : 'var(--ink-6)', fontWeight: 600 }}>
                    {pending > 0 ? formatMoney(pending) : '—'}
                  </td>
                  <td>{statusTag(v.status)}</td>
                  <td className="num" onClick={(e) => e.stopPropagation()}>
                    <button className="btn sm grn" onClick={() => setEditRow(v)}>
                      <Icon name="pencil" size={13} />
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading && <div className="state">Loading invoices…</div>}
        {error && <div className="state err">{error}</div>}
        {!loading && !error && (data?.length ?? 0) === 0 && (
          <div className="state">No invoices yet — add invoices from the button above.</div>
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
      </div>

      {detailId && <InvoiceDetailModal id={detailId} onClose={() => setDetailId(null)} />}
      {statOpen === 'billed' && <InvoicesDetailModal scope={filterActive ? filtered : undefined} onClose={() => setStatOpen(null)} />}
      {statOpen === 'collected' && <CollectedDetailModal scope={filterActive ? filtered : undefined} onClose={() => setStatOpen(null)} />}
      {statOpen === 'pending' && <BalanceDueDetailModal scope={filterActive ? filtered : undefined} onClose={() => setStatOpen(null)} />}
      {editRow && (
        <EditInvoiceModal
          inv={editRow}
          onClose={() => {
            setEditRow(null);
            if (editParam) navigate('/invoices', { replace: true });
          }}
          onDone={() => {
            setEditRow(null);
            if (editParam) navigate('/invoices', { replace: true });
            reload();
          }}
        />
      )}
    </>
  );
}

/** Edit an invoice's label, dates, and invoice-level discount. */
function EditInvoiceModal({ inv, onClose, onDone }: { inv: Invoice; onClose: () => void; onDone: () => void }) {
  const { api } = useApi();
  const toast = useToast();
  // The list row lacks fee lines; fetch the full invoice for the breakdown.
  const full = useAsync(() => api.invoices.get(inv.id), [inv.id]);
  const [name, setName] = useState(inv.name);
  const [issueDate, setIssueDate] = useState(inv.issueDate.slice(0, 10));
  const [dueDate, setDueDate] = useState(inv.dueDate.slice(0, 10));
  const [discount, setDiscount] = useState(String(paiseToRupees(inv.discountAmount)));
  const [discountReason, setDiscountReason] = useState(inv.discountReason ?? '');
  const [busy, setBusy] = useState(false);
  // Reason presets: the school's concessions (School Setup → Discounts) + defaults.
  const concessions = useAsync(() => api.setup.discounts.list().catch(() => []), []);
  const reasonOptions = [
    ...new Set([
      ...(concessions.data ?? []).map((c) => c.name),
      'Sibling concession',
      'Staff ward',
      'Merit scholarship',
      'Financial hardship',
      'Management concession',
    ]),
  ];
  // Dropdown selection: a preset name, "__other__" for free text, or "" for none.
  const [reasonChoice, setReasonChoice] = useState('');
  useEffect(() => {
    if (!inv.discountReason) return;
    setReasonChoice(reasonOptions.includes(inv.discountReason) ? inv.discountReason : '__other__');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concessions.data]);

  const discPaise = Math.min(inv.grossAmount, Math.max(0, rupeesToPaise(Number(discount) || 0)));
  const net = Math.max(0, inv.grossAmount - discPaise);

  const save = async () => {
    setBusy(true);
    try {
      await api.invoices.update(inv.id, {
        name: name.trim() || undefined,
        issueDate,
        dueDate,
        discountType: discPaise > 0 ? 'FLAT' : 'NONE',
        discountValue: discPaise,
        discountReason: discPaise > 0 ? discountReason.trim() || undefined : undefined,
      });
      toast(`Invoice ${inv.number} updated`);
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update invoice');
      setBusy(false);
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
            <b>Edit invoice · {inv.number}</b>
            <span>
              {inv.studentName} · {inv.className}
            </span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div className="ai-split">
            {/* LEFT — the invoice breakdown */}
            <div className="ai-right">
              {full.data ? (
                <>
                  <div className="inv-meta" style={{ marginBottom: 8 }}>
                    <span className="mono">Issued {full.data.issueDate.slice(0, 10)}</span>
                    <span className="mono">Due {full.data.dueDate.slice(0, 10)}</span>
                  </div>
                  <PeriodAllocationView invoice={full.data} />
                </>
              ) : (
                <div className="state">Loading…</div>
              )}
            </div>

            {/* RIGHT — adjust the invoice */}
            <div className="ai-left">
              <h4 className="std-sec" style={{ marginTop: 0 }}>Adjust invoice</h4>
              <div className="fld">
                <label>Invoice name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="fld">
                  <label>Issue date</label>
                  <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                </div>
                <div className="fld">
                  <label>Due date</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>

              <div className="fld">
                <label>Discount (₹)</label>
                <input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>

              {discPaise > 0 && (
                <div className="fld">
                  <label>Discount reason <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>· optional</span></label>
                  <select
                    value={reasonChoice}
                    onChange={(e) => {
                      const val = e.target.value;
                      setReasonChoice(val);
                      setDiscountReason(val === '__other__' ? '' : val);
                    }}
                  >
                    <option value="">Select a reason…</option>
                    {reasonOptions.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                    <option value="__other__">Other…</option>
                  </select>
                </div>
              )}
              {discPaise > 0 && reasonChoice === '__other__' && (
                <div className="fld">
                  <label>Reason (other)</label>
                  <input
                    type="text"
                    placeholder="Enter a reason"
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                  />
                </div>
              )}

              <div className="totalbar">
                <span>New net after your change</span>
                <b>{formatMoney(net)}</b>
              </div>
              {inv.paidAmount > 0 && (
                <div className="alloc-note">
                  {formatMoney(inv.paidAmount)} already paid — status updates from the new net.
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mf">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn grn" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Read-only detail of a single invoice: header, fee lines, and paid/pending totals. */
/** Label for one instalment of a period-based fee. */
function periodLabelFor(period: FeePeriod, i: number, count: number): string {
  if (period === 'TERM') return count > 1 ? `Term ${i + 1}` : 'Term';
  if (period === 'MONTHLY') return `Instalment ${i + 1}`;
  if (period === 'DUE_DATE') return 'On due date';
  return 'One-time';
}

interface PeriodRow {
  label: string;
  gross: number;
  discount: number;
  net: number;
  paid: number;
  status: InvoiceStatus;
}
interface FeeGroup {
  feeName: string;
  feeKey: string;
  period: FeePeriod;
  total: number;
  rows: PeriodRow[];
}

/**
 * Split a real invoice into per-fee, per-period rows and settle each period's
 * status from the invoice's paid amount (earliest period first — the same order
 * billing collects in). Concessions are allocated per-line then whole-invoice,
 * matching InvoiceBreakdown, so the payable per period is exact.
 */
function buildFeeGroups(inv: Invoice): FeeGroup[] {
  const lines = inv.lines ?? [];
  const perLineHasDiscount = lines.some((l) => l.discountAmount > 0);
  let wholeRemaining = inv.discountAmount > 0 && !perLineHasDiscount ? inv.discountAmount : 0;

  const groups: FeeGroup[] = lines.map((l: InvoiceLine) => {
    const gross = Array.isArray(l.periods) && l.periods.length ? l.periods : [l.grossAmount];
    let lineRemaining = l.discountAmount;
    const rows: PeriodRow[] = gross.map((g, i) => {
      let d = 0;
      if (lineRemaining > 0) {
        const t = Math.min(lineRemaining, g);
        d += t;
        lineRemaining -= t;
      }
      if (wholeRemaining > 0) {
        const t = Math.min(wholeRemaining, g - d);
        d += t;
        wholeRemaining -= t;
      }
      return { label: periodLabelFor(l.period, i, gross.length), gross: g, discount: d, net: g - d, paid: 0, status: 'PENDING' as InvoiceStatus };
    });
    return { feeName: l.feeName, feeKey: l.feeKey, period: l.period, total: gross.reduce((a, b) => a + b, 0), rows };
  });

  // Fill paid amount across every period, oldest fee/period first.
  let paidRem = inv.paidAmount;
  for (const g of groups) {
    for (const r of g.rows) {
      const pay = Math.min(paidRem, r.net);
      paidRem -= pay;
      r.paid = pay;
      r.status = r.net === 0 || pay >= r.net ? 'PAID' : pay > 0 ? 'PARTIAL' : 'PENDING';
    }
  }
  return groups;
}

/**
 * Period-based payment allocation panel — one table per fee head, each period
 * showing Amount / Discount / Payable / Paid / Status. Shared by the invoice
 * detail and edit modals so both match the Add-invoice design.
 */
function PeriodAllocationView({ invoice }: { invoice: Invoice }) {
  const groups = buildFeeGroups(invoice);
  return (
    <>
      <h4 className="std-sec" style={{ marginTop: 0, marginBottom: 8 }}>Period-based payment allocation</h4>
      <div className="pba-grid">
        {groups.map((g) => (
          <div className="pba-group" key={g.feeKey}>
            <div className="pba-title">
              <span>{g.feeName}</span>
              <span className="pba-total mono">{formatMoney(g.total)}</span>
            </div>
            <div className="pba-note">
              <Icon name="info" size={13} />
              Paid amount is settled from the oldest period first.
            </div>
            <div className="card-t" style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th className="num">Amount</th>
                    <th className="num">Discount</th>
                    <th className="num">Payable</th>
                    <th className="num">Paid</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r, i) => (
                    <tr key={i}>
                      <td><span className="fs-chip">{r.label}</span></td>
                      <td className="num mono">{formatMoney(r.gross)}</td>
                      <td className={`num mono${r.discount > 0 ? '' : ' muted'}`}>
                        {r.discount > 0 ? `−${formatMoney(r.discount)}` : formatMoney(0)}
                      </td>
                      <td className="num mono">{formatMoney(r.net)}</td>
                      <td className={`num mono${r.paid > 0 ? ' pos' : ' muted'}`}>
                        {r.paid > 0 ? formatMoney(r.paid) : '—'}
                      </td>
                      <td>{statusTag(r.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function InvoiceDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { api } = useApi();
  const { data: v, loading, error } = useAsync(() => api.invoices.get(id), [id]);
  const pending = v ? Math.max(0, v.netAmount - v.paidAmount) : 0;

  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 1000, width: '95vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="mh">
          <div>
            <b>{v ? `${v.number} · ${v.studentName}` : 'Invoice'}</b>
            <span>{v ? `${v.className} · ${v.name}` : 'Loading…'}</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {loading && <div className="state">Loading invoice…</div>}
          {error && <div className="state err">{error}</div>}
          {v && (
            <div className="ai-split">
              {/* LEFT — period-based payment allocation */}
              <div className="ai-right">
                <PeriodAllocationView invoice={v} />
              </div>

              {/* RIGHT — invoice summary */}
              <div className="ai-left">
                <div>
                  <div className="acct-label">Invoice ID</div>
                  <div className="mono" style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{v.number}</div>
                </div>
                <div className="inv-meta" style={{ marginTop: 2 }}>
                  {statusTag(v.status)}
                  <span className="cls">{v.className}</span>
                </div>
                <div className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                  Issued {v.issueDate.slice(0, 10)} · Due {v.dueDate.slice(0, 10)}
                </div>

                <div className="alloc-sums" style={{ gridTemplateColumns: '1fr', gap: 10 }}>
                  <div className="alloc-sum"><span>Gross</span><b>{formatMoney(v.grossAmount)}</b></div>
                  {v.discountAmount > 0 && (
                    <div className="alloc-sum"><span>Discount</span><b style={{ color: 'var(--red-fig)' }}>−{formatMoney(v.discountAmount)}</b></div>
                  )}
                  <div className="alloc-sum pay"><span>Net payable</span><b>{formatMoney(v.netAmount)}</b></div>
                  <div className="alloc-sum"><span>Paid</span><b className="pos">{formatMoney(v.paidAmount)}</b></div>
                  <div className="alloc-sum"><span>Pending</span><b style={{ color: pending > 0 ? 'var(--red-fig)' : 'var(--success-ink)' }}>{formatMoney(pending)}</b></div>
                </div>
              </div>
            </div>
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

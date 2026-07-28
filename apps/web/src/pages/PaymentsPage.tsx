import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { formatMoney, paiseToRupees, rupeesToPaise, type PaymentMode } from '@mentivax/core';
import type { MentivaxClient, Payment, Student } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { Pagination, usePager } from '../components/Pagination';
import { StudentPicker } from '../components/StudentPicker';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

const MODES: { value: PaymentMode; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI / GPay' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CARD', label: 'Card' },
];

const MODE_LABEL = Object.fromEntries(MODES.map((m) => [m.value, m.label]));

/** Multi-select dropdown for choosing which fees a payment covers. */
function FeesSelect({
  feeNames,
  selected,
  onChange,
}: {
  feeNames: string[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const all = feeNames.length > 0 && selected.size === feeNames.length;
  const label =
    feeNames.length === 0
      ? 'No fees'
      : all
        ? 'All fees'
        : selected.size === 0
          ? 'Select fees…'
          : [...selected].join(', ');
  const toggle = (n: string) => {
    const s = new Set(selected);
    if (s.has(n)) s.delete(n);
    else s.add(n);
    onChange(s);
  };

  return (
    <div className="picker" ref={ref}>
      <button type="button" className="feesel" onClick={() => setOpen((o) => !o)}>
        <span className="feesel-label">{label}</span>
      </button>
      {open && (
        <div className="picker-menu">
          <button
            type="button"
            className="feesel-opt feesel-all"
            onClick={() => onChange(new Set(all ? [] : feeNames))}
          >
            {all ? 'Clear all' : 'Select all'}
          </button>
          {feeNames.map((n) => (
            <label key={n} className="feesel-opt">
              <input type="checkbox" checked={selected.has(n)} onChange={() => toggle(n)} />
              <span>{n}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** A single fee due for a student (across their invoices), amounts in paise. */
interface Due {
  key: string;
  feeName: string;
  total: number;
  paid: number;
  pending: number;
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
    let remainingPaid = inv.paidAmount;
    for (const l of inv.lines ?? []) {
      const paid = Math.min(remainingPaid, l.netAmount);
      remainingPaid -= paid;
      dues.push({
        key: l.id,
        feeName: l.feeName,
        total: l.netAmount,
        paid,
        pending: Math.max(0, l.netAmount - paid),
      });
    }
  }
  return dues;
}

/** Split the entered amount across the selected fees' pending dues, oldest first. */
function allocate(dues: Due[], amountPaise: number, selected: Set<string>) {
  let rem = amountPaise;
  const rows = dues.map((d) => {
    const eligible = selected.has(d.feeName);
    const payNow = eligible && d.pending > 0 ? Math.min(rem, d.pending) : 0;
    rem -= payNow;
    return { ...d, payNow, balance: d.pending - payNow, eligible };
  });
  const pendingBefore = dues.reduce((s, d) => s + d.pending, 0);
  const selectedPending = dues.reduce((s, d) => s + (selected.has(d.feeName) ? d.pending : 0), 0);
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
  const { api } = useApi();
  const toast = useToast();
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

  return (
    <>
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
                    <span className="cls">{MODE_LABEL[p.mode]}</span>
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
            <span className="cls">{MODE_LABEL[p.mode]}</span>
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
function InvoicesDetailModal({ onClose }: { onClose: () => void }) {
  const { api } = useApi();
  const invoices = useAsync(() => api.invoices.list(), []);
  const list = invoices.data ?? [];
  const total = list.reduce((n, i) => n + i.netAmount, 0);

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 780, width: '94%' }}>
        <div className="mh">
          <div>
            <b>Invoices issued{list.length ? ` · ${list.length}` : ''}</b>
            <span>Every invoice for the active year — {formatMoney(total)} total</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb" style={{ padding: 0, maxHeight: '62vh', overflowY: 'auto' }}>
          <div className="card-t" style={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
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
function CollectedDetailModal({ onClose }: { onClose: () => void }) {
  const { api } = useApi();
  const payments = useAsync(() => api.payments.list(), []);
  const list = payments.data ?? [];
  const total = list.reduce((n, p) => n + p.amount, 0);

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760, width: '94%' }}>
        <div className="mh">
          <div>
            <b>Collected{list.length ? ` · ${list.length} payments` : ''}</b>
            <span>Every payment received this year — {formatMoney(total)} total</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb" style={{ padding: 0, maxHeight: '62vh', overflowY: 'auto' }}>
          <div className="card-t" style={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Date</th>
                  <th>Student</th>
                  <th className="num">Amount</th>
                  <th>Mode</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
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
                      <span className="cls">{MODE_LABEL[p.mode]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {payments.loading && <div className="state">Loading payments…</div>}
          {!payments.loading && list.length === 0 && (
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
function BalanceDueDetailModal({ onClose }: { onClose: () => void }) {
  const { api } = useApi();
  const invoices = useAsync(() => api.invoices.list(), []);
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
        <div className="mb" style={{ padding: 0, maxHeight: '62vh', overflowY: 'auto' }}>
          <div className="card-t" style={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
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
  const [mode, setMode] = useState<PaymentMode>(editing?.mode ?? 'CASH');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const list: Student[] = students.data ?? [];
  const amount = Number(rupees) || 0;
  const valid = (editing ? true : !!studentId) && amount > 0;

  // Live fee allocation preview (record mode only).
  const dues = useAsync(
    () => (!editing && studentId ? loadDues(api, studentId) : Promise.resolve<Due[]>([])),
    [studentId, editing],
  );
  const feeNames = useMemo(
    () => [...new Set((dues.data ?? []).map((d) => d.feeName))],
    [dues.data],
  );
  const [selectedFees, setSelectedFees] = useState<Set<string>>(new Set());
  // Default to all fees whenever the student's dues change.
  useEffect(() => {
    setSelectedFees(new Set((dues.data ?? []).map((d) => d.feeName)));
  }, [dues.data]);
  const alloc = useMemo(
    () => allocate(dues.data ?? [], rupeesToPaise(amount), selectedFees),
    [dues.data, amount, selectedFees],
  );
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
        await api.payments.create({
          studentId,
          amount: rupeesToPaise(amount),
          mode,
          description: description || undefined,
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
        style={{ maxWidth: showPreview ? 680 : 480, width: '94%' }}
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
        <div className="mb" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
          <div className="fld">
            <label>Student</label>
            {editing ? (
              <input value={editing.studentName} disabled />
            ) : (
              <StudentPicker students={list} value={studentId} onChange={setStudentId} />
            )}
          </div>
          {showPreview && (
            <div className="fld">
              <label>Fees to pay towards</label>
              <FeesSelect feeNames={feeNames} selected={selectedFees} onChange={setSelectedFees} />
            </div>
          )}
          <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="fld">
              <label>
                Amount (₹)
                {showPreview && alloc.selectedPending > 0 && (
                  <button
                    type="button"
                    className="linkbtn"
                    onClick={() => setRupees(String(paiseToRupees(alloc.selectedPending)))}
                  >
                    Pay full · {formatMoney(alloc.selectedPending)}
                  </button>
                )}
              </label>
              <input
                type="number"
                min={0}
                value={rupees}
                onChange={(e) => setRupees(e.target.value)}
                placeholder="0"
              />
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

          {showPreview && (
            <div className="alloc">
              <div className="alloc-sums">
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
              <div className="card-t alloc-card">
                <table className="fs-tbl">
                  <colgroup>
                    <col />
                    <col style={{ width: 86 }} />
                    <col style={{ width: 82 }} />
                    <col style={{ width: 94 }} />
                    <col style={{ width: 104 }} />
                    <col style={{ width: 94 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Fee</th>
                      <th className="num">Total</th>
                      <th className="num">Paid</th>
                      <th className="num">Pending</th>
                      <th className="num">Paying now</th>
                      <th className="num">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alloc.rows.map((r) => (
                      <tr
                        key={r.key}
                        className={`${r.payNow > 0 ? (r.balance === 0 ? 'alloc-full' : 'alloc-part') : ''}${r.eligible ? '' : ' alloc-off'}`}
                      >
                        <td>
                          <b className="alloc-feename" title={r.feeName}>
                            {r.feeName}
                          </b>
                        </td>
                        <td className="num">{formatMoney(r.total)}</td>
                        <td className="num muted">{formatMoney(r.paid)}</td>
                        <td className="num">{formatMoney(r.pending)}</td>
                        <td
                          className="num"
                          style={{ color: r.payNow > 0 ? 'var(--success-ink)' : 'var(--ink-3)', fontWeight: 650 }}
                        >
                          {r.payNow > 0 ? formatMoney(r.payNow) : '—'}
                        </td>
                        <td className={`num${r.balance > 0 ? ' pending-red' : ' muted'}`}>
                          {formatMoney(r.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {alloc.advance > 0 && (
                <div className="alloc-note">
                  {formatMoney(alloc.advance)} is more than the selected dues — it will be recorded as an advance.
                </div>
              )}
            </div>
          )}
          {!editing && studentId && dues.loading && <div className="state">Loading dues…</div>}

          <div className="fld">
            <label>Description (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Term 1 school fee"
            />
          </div>
          <div className="totalbar">
            <span>Total amount</span>
            <b>{formatMoney(rupeesToPaise(amount))}</b>
          </div>
          {err && <div className="state err">{err}</div>}
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

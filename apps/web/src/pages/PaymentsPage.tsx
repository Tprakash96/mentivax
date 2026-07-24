import { useState } from 'react';
import { formatMoney, rupeesToPaise, type PaymentMode } from '@mentivax/core';
import type { Student } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
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

export function PaymentsPage() {
  const { api } = useApi();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const summary = useAsync(() => api.payments.summary(), []);
  const payments = useAsync(() => api.payments.list({ search }), [search]);

  const s = summary.data;
  const collectedPct = s && s.totalInvoiced > 0 ? Math.round((s.collected / s.totalInvoiced) * 100) : 0;

  const reloadAll = () => {
    summary.reload();
    payments.reload();
  };

  return (
    <>
      <div className="paygrid">
        <div className="paycard inv">
          <div className="h">
            <span className="ic" style={{ background: 'var(--blue-soft)', color: 'var(--blue)' }}>
              <Icon name="invoice" size={16} />
            </span>
            Total invoiced
          </div>
          <div className="big">{formatMoney(s?.totalInvoiced ?? 0)}</div>
          <div className="sub">{s?.invoiceCount ?? 0} invoices issued</div>
        </div>
        <div className="paycard paid">
          <div className="h">
            <span className="ic" style={{ background: 'var(--green-soft)', color: 'var(--green-ink)' }}>
              <Icon name="check" size={16} />
            </span>
            Collected
          </div>
          <div className="big">{formatMoney(s?.collected ?? 0)}</div>
          <div className="sub">{collectedPct}% of invoiced</div>
        </div>
        <div className="paycard due">
          <div className="h">
            <span className="ic" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>
              <Icon name="building" size={16} />
            </span>
            Balance due
          </div>
          <div className="big">{formatMoney(s?.balanceDue ?? 0)}</div>
          <div className="sub">across all students</div>
        </div>
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
          Record payment
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
            </tr>
          </thead>
          <tbody>
            {(payments.data ?? []).map((p) => (
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
                <td className="num" style={{ color: 'var(--green-ink)', fontWeight: 650 }}>
                  {formatMoney(p.amount)}
                </td>
                <td>
                  <span className="cls">{MODE_LABEL[p.mode]}</span>
                </td>
                <td style={{ color: 'var(--ink-3)' }}>{p.description ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.loading && <div className="state">Loading payments…</div>}
        {payments.error && <div className="state err">{payments.error}</div>}
        {!payments.loading && !payments.error && (payments.data?.length ?? 0) === 0 && (
          <div className="state">No payments recorded yet.</div>
        )}
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
    </>
  );
}

function RecordPaymentModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { api } = useApi();
  const students = useAsync(() => api.students.list({}), []);
  const [studentId, setStudentId] = useState('');
  const [rupees, setRupees] = useState('');
  const [mode, setMode] = useState<PaymentMode>('CASH');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const list: Student[] = students.data ?? [];
  const amount = Number(rupees) || 0;
  const valid = studentId && amount > 0;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setErr(null);
    try {
      await api.payments.create({
        studentId,
        amount: rupeesToPaise(amount),
        mode,
        description: description || undefined,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div>
            <b>Record payment</b>
            <span>Auto-allocates to the student&apos;s oldest open invoices</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb">
          <div className="fld">
            <label>Student</label>
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Select a student…</option>
              {list.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.className} · {formatMoney(s.pending)} due
                </option>
              ))}
            </select>
          </div>
          <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="fld">
              <label>Amount (₹)</label>
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
            {saving ? 'Saving…' : 'Add payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

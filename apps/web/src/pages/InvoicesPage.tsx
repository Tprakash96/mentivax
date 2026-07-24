import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatMoney, type InvoiceStatus } from '@mentivax/core';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

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
  const toast = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { data, loading, error } = useAsync(() => api.invoices.list({ search }), [search]);

  return (
    <>
      <div className="paths">
        <div className="path primary">
          <span className="pill-time">
            <Icon name="clock" size={12} />
            ~1 hour, not a day
          </span>
          <h3>Issue invoices for a whole class</h3>
          <p>
            Pick a class, and Mentivax fills each student&apos;s fees from your fee structure — old vs
            new, van or no van. Tune discounts in one pass, then create every invoice at once.
          </p>
          <button className="btn grn" onClick={() => navigate('/invoices/new')}>
            <Icon name="plus" size={15} />
            Start class billing
          </button>
        </div>
        <div className="path sec">
          <h3>Single student invoice</h3>
          <p>One-off invoice for a specific student — same fee lines, one form.</p>
          <button className="btn" onClick={() => toast('Single-invoice form — same fee lines, one student')}>
            <Icon name="plus" size={15} />
            New single invoice
          </button>
        </div>
      </div>

      <div className="tbar">
        <h4 className="section">Recent invoices</h4>
        <div className="sp" />
        <div className="search">
          <Icon name="search" />
          <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card-t">
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Student</th>
              <th>Class</th>
              <th>Name</th>
              <th>Issued</th>
              <th className="num">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((v) => (
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
                <td style={{ color: 'var(--ink-2)' }}>{v.name}</td>
                <td className="mono" style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>
                  {v.issueDate.slice(0, 10)}
                </td>
                <td className="num">{formatMoney(v.netAmount)}</td>
                <td>{statusTag(v.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="state">Loading invoices…</div>}
        {error && <div className="state err">{error}</div>}
        {!loading && !error && (data?.length ?? 0) === 0 && (
          <div className="state">No invoices yet — start a class billing run above.</div>
        )}
      </div>
    </>
  );
}

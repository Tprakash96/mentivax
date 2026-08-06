import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatMoney } from '@mentivax/core';
import { Icon } from '../components/Icon';
import { Pagination, usePager } from '../components/Pagination';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

/**
 * Full-page drill-down for the Collected figure. Invoices that received money
 * are split into two tabs — Fully paid (paid = invoiced) and Partially paid
 * (paid < invoiced) — each tab showing its invoice count, collected total, and
 * the detail list.
 */
export function CollectedPage() {
  const { api } = useApi();
  const navigate = useNavigate();
  const invoices = useAsync(() => api.invoices.list(), []);
  const [tab, setTab] = useState<'full' | 'partial'>('full');

  const source = invoices.data ?? [];
  const collected = source.filter((v) => v.paidAmount > 0);
  const fully = collected.filter((v) => v.paidAmount >= v.netAmount);
  const partial = collected.filter((v) => v.paidAmount < v.netAmount);
  const fullyTotal = fully.reduce((n, v) => n + v.paidAmount, 0);
  const partialTotal = partial.reduce((n, v) => n + v.paidAmount, 0);

  const rows = tab === 'full' ? fully : partial;
  const pager = usePager(rows);

  return (
    <>
      <div className="page-head">
        <div>
          <button className="crumb" onClick={() => navigate('/payments')}>
            <Icon name="arrowLeft" size={15} /> Payments
          </button>
          <h1>Collected</h1>
          <div className="sub">Money received this year, split by settlement status</div>
        </div>
      </div>

      <div className="coll-tabs">
        <button
          className={`coll-tab full${tab === 'full' ? ' on' : ''}`}
          onClick={() => setTab('full')}
          aria-pressed={tab === 'full'}
        >
          <span className="coll-tab-lbl">
            Fully paid <span className="coll-tab-count">{fully.length}</span>
          </span>
          <b className="coll-tab-amt">{formatMoney(fullyTotal)}</b>
          <span className="coll-tab-sub">collected</span>
        </button>
        <button
          className={`coll-tab partial${tab === 'partial' ? ' on' : ''}`}
          onClick={() => setTab('partial')}
          aria-pressed={tab === 'partial'}
        >
          <span className="coll-tab-lbl">
            Partially paid <span className="coll-tab-count">{partial.length}</span>
          </span>
          <b className="coll-tab-amt">{formatMoney(partialTotal)}</b>
          <span className="coll-tab-sub">collected</span>
        </button>
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
              {tab === 'partial' && <th className="num">Still due</th>}
            </tr>
          </thead>
          <tbody>
            {pager.pageItems.map((v) => (
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
                <td className="num mono" style={{ color: 'var(--ink-3)' }}>
                  {formatMoney(v.netAmount)}
                </td>
                <td className="num mono" style={{ color: 'var(--success-ink)', fontWeight: 650 }}>
                  {formatMoney(v.paidAmount)}
                </td>
                {tab === 'partial' && (
                  <td className="num mono" style={{ color: 'var(--red-fig)', fontWeight: 600 }}>
                    {formatMoney(Math.max(0, v.netAmount - v.paidAmount))}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!invoices.loading && rows.length === 0 && (
          <div className="state">No {tab === 'full' ? 'fully' : 'partially'} paid invoices yet.</div>
        )}
        {invoices.loading && <div className="state">Loading…</div>}
        <Pagination
          page={pager.page}
          pages={pager.pages}
          pageSize={pager.pageSize}
          total={pager.total}
          onPage={pager.setPage}
          onPageSize={pager.setPageSize}
        />
      </div>
    </>
  );
}

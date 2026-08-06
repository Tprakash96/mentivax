import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatMoney } from '@mentivax/core';
import type { FeeHeadRow, ReportsOverview } from '@mentivax/api-client';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

type Tab = 'overview' | 'fees' | 'conc';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'fees', label: 'Fee heads' },
  { id: 'conc', label: 'Concessions' },
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Fees & collections reporting. Three tabs, all reading server-computed figures
 * so nothing is re-derived here: Overview (headline numbers), Fee heads (per-fee
 * and per-instalment collection) and Concessions. Plain-language questions live
 * in the Ask bar on the home page.
 *
 * Every figure covers *live* invoices — drafts and cancelled invoices excluded —
 * which is what makes these totals agree with the Payments page.
 */
export function ReportsPage() {
  const { api, hasModule } = useApi();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');

  const overview = useAsync(() => api.reports.overview(), []);
  const o = overview.data;

  return (
    <>
      {/* The shell already titles the page "Reports"; this row carries the live
          facts behind the figures and the two places you go next. */}
      <div className="page-head rep-head">
        <div className="rep-meta">
          {o
            ? `${o.academicYear} · ${plural(o.liveInvoices, 'live invoice')} · updated as receipts come in`
            : 'Fees & collections'}
        </div>
        <div className="rowacts">
          <button className="btn" onClick={() => navigate('/students')}>
            Students
          </button>
          <button className="btn grn" onClick={() => navigate('/payments')}>
            Payment history
          </button>
        </div>
      </div>

      <div className="subtabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`subtab${tab === t.id ? ' on' : ''}`}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
          >
            {t.label}
          </button>
        ))}
      </div>

      {overview.error && <div className="state">Could not load reports: {overview.error}</div>}

      {tab === 'overview' && <Overview data={o} loading={overview.loading} />}
      {tab === 'fees' && <FeeHeads showTransport={hasModule('transport')} />}
      {tab === 'conc' && <Concessions />}
    </>
  );
}

/* ================================ Overview ================================ */

function Overview({ data, loading }: { data: ReportsOverview | null; loading: boolean }) {
  if (!data) return <div className="state">{loading ? 'Loading…' : 'No figures yet.'}</div>;

  const paidTotal = Math.max(1, data.modes.reduce((n, m) => n + m.amount, 0));

  return (
    <>
      <div className="kpi-strip">
        <div className="kpi">
          <span>Collected till now</span>
          <b className="mono pos">{formatMoney(data.collected)}</b>
          <span>{plural(data.receiptCount, 'receipt')}</span>
        </div>
        <div className="kpi">
          <span>Invoiced</span>
          <b className="mono">{formatMoney(data.invoiced)}</b>
          <span>{plural(data.liveInvoices, 'live invoice')}</span>
        </div>
        <div className="kpi">
          <span>Pending</span>
          <b className="mono neg">{formatMoney(data.pending)}</b>
          <span>{plural(data.pendingStudents, 'student')}</span>
        </div>
        <div className="kpi">
          <span>Collection rate</span>
          <b className="mono">{data.collectionRate}%</b>
          <span>of what is billed</span>
        </div>
        <div className="kpi">
          <span>Concession given</span>
          <b className="mono pos">{formatMoney(data.concession)}</b>
          <span>{plural(data.concessionStudents, 'student')} · live invoices</span>
        </div>
      </div>

      <div className="rep-grid">
        <div className="rep-card">
          <h4 className="section">
            How they paid <span className="rep-note">all receipts</span>
          </h4>
          {data.modes.map((m) => (
            <div key={m.key} className="rep-row">
              <span className={`mode-chip mode-${m.key.toLowerCase()}`}>{m.label}</span>
              <span className="rep-bar">
                <span
                  className={`mode-fill mode-${m.key.toLowerCase()}`}
                  style={{ width: `${(m.amount / paidTotal) * 100}%` }}
                />
              </span>
              <span className="rep-amt mono">{formatMoney(m.amount)}</span>
            </div>
          ))}
          {data.receiptCount === 0 && <div className="state">No receipts yet.</div>}
        </div>

        <div className="rep-card">
          <h4 className="section">Who has paid</h4>
          <div className="rep-facts">
            <div>
              <span>Fully paid students</span>
              <b className="mono">{data.fullyPaidStudents}</b>
            </div>
            <div>
              <span>Part paid</span>
              <b className="mono">{data.partPaidStudents}</b>
            </div>
            <div>
              <span>Not paid at all</span>
              <b className="mono">{data.unpaidStudents}</b>
            </div>
            <div>
              <span>Average receipt</span>
              <b className="mono">{formatMoney(data.averageReceipt)}</b>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ================================ Fee heads =============================== */

function FeeHeads({ showTransport }: { showTransport: boolean }) {
  const { api } = useApi();
  const heads = useAsync(() => api.reports.feeHeads(), []);
  const rows = heads.data?.rows ?? [];

  return (
    <>
      <div className="rep-card">
        <h4 className="section">By fee head</h4>
        {rows.map((r) => (
          <FeeHead key={r.key} row={r} />
        ))}
        {heads.loading && <div className="state">Loading…</div>}
        {!heads.loading && rows.length === 0 && (
          <div className="state">Nothing billed yet — issue an invoice and it shows up here.</div>
        )}
      </div>
      {showTransport && <Transport />}
    </>
  );
}

/** One fee head, with its per-instalment detail when it has instalments. */
function FeeHead({ row }: { row: FeeHeadRow }) {
  return (
    <div className="fh">
      <div className="fh-top">
        <span className="rep-dot" style={{ background: row.dot }} />
        <div className="fh-id">
          <div className="fh-name">{row.name}</div>
          <div className="fh-sub">
            {formatMoney(row.billed)} billed · {row.rate}% in · {plural(row.students, 'student')}
          </div>
        </div>
        <div className="fh-figs">
          <div className="mono fh-in">{formatMoney(row.paid)}</div>
          <div className={`fh-due${row.due > 0 ? '' : ' settled'}`}>
            {row.due > 0 ? `${formatMoney(row.due)} due` : 'settled'}
          </div>
        </div>
      </div>

      <div className="fh-payers">
        <span className={`fh-chip full${row.full ? '' : ' off'}`}>{row.full} fully paid</span>
        <span className={`fh-chip part${row.part ? '' : ' off'}`}>{row.part} part paid</span>
        <span className={`fh-chip none${row.none ? '' : ' off'}`}>{row.none} not paid</span>
      </div>

      {row.periods.length > 1 && (
        <div className="fh-periods">
          {row.periods.map((p) => (
            <div key={p.index} className="fh-period">
              <div className="fh-prow">
                <span className="fh-plabel">{p.label}</span>
                <span className="rep-bar">
                  <span
                    style={{
                      width: `${Math.max(3, p.rate)}%`,
                      background: p.rate >= 90 ? 'var(--success)' : p.rate >= 40 ? 'var(--green)' : 'var(--amber-dot)',
                    }}
                  />
                </span>
                <span className={`mono fh-prate${p.rate >= 40 ? ' good' : ''}`}>{p.rate}%</span>
                <span className="mono fh-pval">
                  {formatMoney(p.paid)} / {formatMoney(p.billed)}
                </span>
              </div>
              <div className="fh-ppayers">
                {p.full > 0 && (
                  <span>
                    <i className="d-p" />
                    {p.full} paid
                  </span>
                )}
                {p.part > 0 && (
                  <span>
                    <i className="d-a" />
                    {p.part} part
                  </span>
                )}
                {p.none > 0 && (
                  <span>
                    <i className="d-l" />
                    {p.none} nothing
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Transport collection by pickup stop — only when the module is plugged in. */
function Transport() {
  const { api } = useApi();
  const report = useAsync(() => api.reports.transport(), []);
  const data = report.data;
  if (!data || data.rows.length === 0) return null;

  const quiet = data.quietStops > 0 ? ` · ${plural(data.quietStops, 'stop')} not billed yet` : '';

  return (
    <div className="rep-card" style={{ marginTop: 16 }}>
      <h4 className="section">
        Transport{' '}
        <span className="rep-note">
          live invoices only · {plural(data.billedRiders, 'billed rider')} of {data.assignedRiders} assigned
          {quiet}
        </span>
      </h4>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Stop</th>
              <th className="num">Riders</th>
              <th className="num">Billed</th>
              <th className="num">Collected</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <b style={{ fontWeight: 600 }}>{r.name}</b>
                  <div className="fh-sub">{r.route}</div>
                </td>
                <td className="num mono" style={{ color: 'var(--ink-3)' }}>
                  {r.riders}
                </td>
                <td className="num mono" style={{ fontWeight: 650 }}>
                  {formatMoney(r.billed)}
                </td>
                <td className="num mono pos">{formatMoney(r.collected)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =============================== Concessions ============================== */

function Concessions() {
  const { api } = useApi();
  const report = useAsync(() => api.reports.concessions(), []);
  const d = report.data;

  if (!d) return <div className="state">{report.loading ? 'Loading…' : 'No concessions yet.'}</div>;

  const basis = (kind: string, value: number, appliesTo: string) => {
    if (kind === 'PERCENT') return `${value / 100}% of ${appliesTo || 'the invoice'}`;
    if (kind === 'FLAT') return `${formatMoney(value)} flat`;
    return 'typed on the invoice';
  };

  return (
    <div className="rep-card">
      <h4 className="section">Concessions given</h4>
      {d.rows.map((r) => (
        <div key={r.id} className="rep-row">
          <div className="fh-id">
            <div className="fh-name">{r.label}</div>
            <div className="fh-sub">
              {basis(r.kind, r.value, r.appliesTo)} ·{' '}
              {r.students > 0 ? plural(r.students, 'student') : 'not applied to anyone yet'}
            </div>
          </div>
          <span className="rep-amt mono pos">{r.amount > 0 ? formatMoney(r.amount) : '—'}</span>
        </div>
      ))}

      <div className="rep-row">
        <div className="fh-id">
          <div className="fh-name">Gross before concession</div>
          <div className="fh-sub">on {plural(d.liveInvoices, 'live invoice')}</div>
        </div>
        <span className="rep-amt mono">{formatMoney(d.grossBeforeConcession)}</span>
      </div>
      <div className="rep-row">
        <div className="fh-id">
          <div className="fh-name">Net asked of parents</div>
          <div className="fh-sub">after every concession above</div>
        </div>
        <span className="rep-amt mono">{formatMoney(d.netAsked)}</span>
      </div>

      {d.rows.length === 0 && <div className="state">No concession is written into any live invoice yet.</div>}
    </div>
  );
}

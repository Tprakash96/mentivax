import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatMoney, paiseToRupees, rupeesToPaise, type InvoiceStatus } from '@mentivax/core';
import type { Invoice } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { InvoiceBreakdown } from '../components/InvoiceBreakdown';
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
  const summary = useAsync(() => api.payments.summary(), []);

  // Class-wise view: defaults to All (so every invoice shows), filter by class.
  const classes = useAsync(() => api.classes.list(), []);
  const [cls, setCls] = useState<string | 'all'>('all');

  const rows = data ?? [];
  const sm = summary.data;
  const countByClass = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of rows) m[i.className] = (m[i.className] ?? 0) + 1;
    return m;
  }, [rows]);
  const filtered = cls && cls !== 'all' ? rows.filter((i) => i.className === cls) : rows;
  const pager = usePager(filtered);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Invoices</h1>
          <div className="sub">Every invoice issued this year, verified standard by standard</div>
        </div>
      </div>

      <div className="statbar">
        <button className="statbar-fig" onClick={() => setStatOpen('billed')} title="See every invoice">
          <span>Billed <span className="sb-hint">· view ›</span></span>
          <b style={{ color: 'var(--ink-deep)' }}>{formatMoney(sm?.totalInvoiced ?? 0)}</b>
        </button>
        <button className="statbar-fig" onClick={() => setStatOpen('collected')} title="See every payment received">
          <span>Collected <span className="sb-hint">· view ›</span></span>
          <b className="pos">{formatMoney(sm?.collected ?? 0)}</b>
        </button>
        <button className="statbar-fig" onClick={() => setStatOpen('pending')} title="See invoices still owing">
          <span>Pending <span className="sb-hint">· view ›</span></span>
          <b style={{ color: 'var(--red-fig)' }}>{formatMoney(sm?.balanceDue ?? 0)}</b>
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
      {statOpen === 'billed' && <InvoicesDetailModal onClose={() => setStatOpen(null)} />}
      {statOpen === 'collected' && <CollectedDetailModal onClose={() => setStatOpen(null)} />}
      {statOpen === 'pending' && <BalanceDueDetailModal onClose={() => setStatOpen(null)} />}
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
  const [busy, setBusy] = useState(false);

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
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600, width: '94%' }}>
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
        <div className="mb" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {full.data && <InvoiceBreakdown invoice={full.data} />}
          <h4 className="std-sec" style={{ marginTop: 16 }}>Adjust invoice</h4>
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
            <input
              type="number"
              min={0}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </div>

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
function InvoiceDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { api } = useApi();
  const { data: v, loading, error } = useAsync(() => api.invoices.get(id), [id]);
  const pending = v ? Math.max(0, v.netAmount - v.paidAmount) : 0;

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620, width: '94%' }}>
        <div className="mh">
          <div>
            <b>{v ? `${v.number} · ${v.studentName}` : 'Invoice'}</b>
            <span>{v ? `${v.className} · ${v.name}` : 'Loading…'}</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb">
          {loading && <div className="state">Loading invoice…</div>}
          {error && <div className="state err">{error}</div>}
          {v && (
            <>
              <div className="inv-meta" style={{ marginBottom: 2 }}>
                {statusTag(v.status)}
                <span className="cls">{v.className}</span>
              </div>
              <InvoiceBreakdown invoice={v} />
              {pending > 0 && (
                <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                  Pending: {formatMoney(pending)}
                </div>
              )}
            </>
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

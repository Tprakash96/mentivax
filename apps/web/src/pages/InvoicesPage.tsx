import { useMemo, useState } from 'react';
import { formatMoney, paiseToRupees, rupeesToPaise, type InvoiceStatus } from '@mentivax/core';
import type { Invoice, InvoiceLine } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { Pagination, usePager } from '../components/Pagination';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AddInvoiceModal } from './GenerateInvoicesPage';

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
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<Invoice | null>(null);
  const { data, loading, error, reload } = useAsync(() => api.invoices.list({ search }), [search]);

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

  return (
    <>
      <div className="tbar">
        <h4 className="section">Recent invoices</h4>
        <div className="sp" />
        <div className="search">
          <Icon name="search" />
          <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
              <th>Issued</th>
              <th className="num">Amount</th>
              <th>Status</th>
              <th className="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pager.pageItems.map((v) => (
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
                <td className="mono" style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>
                  {v.issueDate.slice(0, 10)}
                </td>
                <td className="num">{formatMoney(v.netAmount)}</td>
                <td>{statusTag(v.status)}</td>
                <td className="num" onClick={(e) => e.stopPropagation()}>
                  <button className="btn sm grn" onClick={() => setEditRow(v)}>
                    <Icon name="pencil" size={13} />
                    Edit
                  </button>
                </td>
              </tr>
            ))}
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
      {editRow && (
        <EditInvoiceModal
          inv={editRow}
          onClose={() => setEditRow(null)}
          onDone={() => {
            setEditRow(null);
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
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, width: '94%' }}>
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
        <div className="mb">
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

          <div className="alloc-sums" style={{ marginTop: 6, gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="alloc-sum">
              <span>Base fee</span>
              <b>{formatMoney(inv.grossAmount)}</b>
            </div>
            <div className="alloc-sum">
              <span>Discount</span>
              <b>{formatMoney(discPaise)}</b>
            </div>
            <div className="alloc-sum pay">
              <span>Net</span>
              <b>{formatMoney(net)}</b>
            </div>
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

/** Human duration label for an invoice line (from its period + span). */
function lineDuration(l: InvoiceLine): string {
  const n = Array.isArray(l.periods) ? l.periods.length : 1;
  switch (l.period) {
    case 'TERM':
      return n > 1 ? `${n} terms` : 'Term';
    case 'MONTHLY':
      return n > 1 ? `${n} months` : 'Monthly';
    case 'DUE_DATE':
      return 'Due date';
    default:
      return 'One time';
  }
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
              <div className="inv-meta">
                {statusTag(v.status)}
                <span className="mono">Issued {v.issueDate.slice(0, 10)}</span>
                <span className="mono">Due {v.dueDate.slice(0, 10)}</span>
              </div>

              <div className="card-t" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Fee</th>
                      <th>Duration</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(v.lines ?? []).map((l) => (
                      <tr key={l.id}>
                        <td>
                          <b style={{ fontWeight: 600 }}>{l.feeName}</b>
                        </td>
                        <td>
                          <span className="fs-chip">{lineDuration(l)}</span>
                        </td>
                        <td className="num">{formatMoney(l.grossAmount)}</td>
                      </tr>
                    ))}
                    {(v.lines?.length ?? 0) === 0 && (
                      <tr>
                        <td colSpan={3} className="muted" style={{ textAlign: 'center' }}>
                          No fee lines on this invoice.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="alloc-sums" style={{ marginTop: 14, gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="alloc-sum">
                  <span>Net payable</span>
                  <b>{formatMoney(v.netAmount)}</b>
                </div>
                <div className="alloc-sum pay">
                  <span>Paid</span>
                  <b>{formatMoney(v.paidAmount)}</b>
                </div>
                <div className="alloc-sum due">
                  <span>Pending</span>
                  <b>{formatMoney(pending)}</b>
                </div>
              </div>

              {v.discountAmount > 0 && (
                <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                  Gross {formatMoney(v.grossAmount)} · discount −{formatMoney(v.discountAmount)}
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

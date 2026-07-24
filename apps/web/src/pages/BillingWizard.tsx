import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { computeDiscount, formatMoney, rupeesToPaise, type DiscountType } from '@mentivax/core';
import type { BatchPreview } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

type Segment = 'all' | 'new' | 'old';
type Step = 'setup' | 'review' | 'done';

interface RowAdjust {
  type: DiscountType;
  /** Display value: percent as whole %, flat as rupees. */
  value: number;
  reason: string;
}

const SEGMENTS: { seg: Segment; label: string }[] = [
  { seg: 'all', label: 'All' },
  { seg: 'new', label: 'New only' },
  { seg: 'old', label: 'Old only' },
];

const today = () => new Date().toISOString().slice(0, 10);

function Stepper({ step }: { step: Step }) {
  const idx = step === 'setup' ? 0 : step === 'review' ? 1 : 2;
  const labels = ['Set up the batch', 'Review & adjust', 'Create'];
  return (
    <div className="steps">
      {labels.map((l, i) => (
        <div key={l} style={{ display: 'contents' }}>
          <div className={`stp${i === idx ? ' on' : i < idx ? ' done' : ''}`}>
            <span className="n">{i < idx ? <Icon name="check" size={13} /> : i + 1}</span>
            <b>{l}</b>
          </div>
          {i < 2 && <div className={`stp-line${i < idx ? ' done' : ''}`} />}
        </div>
      ))}
    </div>
  );
}

/** Discount in paise for a row given its gross and adjustment. */
function rowDiscount(gross: number, adj: RowAdjust | undefined): number {
  if (!adj || adj.type === 'NONE') return 0;
  if (adj.type === 'PERCENT') return computeDiscount(gross, 'PERCENT', Math.round(adj.value * 100));
  return computeDiscount(gross, 'FLAT', rupeesToPaise(adj.value));
}

export function BillingWizard() {
  const { api } = useApi();
  const toast = useToast();
  const navigate = useNavigate();

  const classes = useAsync(() => api.classes.list(), []);
  const feeTypes = useAsync(() => api.feeTypes.list(), []);

  const [step, setStep] = useState<Step>('setup');
  const [classId, setClassId] = useState('');
  const [segment, setSegment] = useState<Segment>('all');
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [name, setName] = useState('Annual Fees 2026–27');
  const [issueDate, setIssueDate] = useState(today());
  const [dueDate, setDueDate] = useState(today());
  const [adjust, setAdjust] = useState<Record<string, RowAdjust>>({});
  const [created, setCreated] = useState(0);
  const [busy, setBusy] = useState(false);

  // Default selections once catalog data lands.
  useEffect(() => {
    if (!classId && classes.data?.[0]) setClassId(classes.data[0].id);
  }, [classes.data, classId]);
  useEffect(() => {
    if (feeTypes.data && Object.keys(enabled).length === 0) {
      setEnabled(Object.fromEntries(feeTypes.data.map((f) => [f.key, true])));
    }
  }, [feeTypes.data, enabled]);

  const feeKeys = useMemo(
    () => Object.entries(enabled).filter(([, on]) => on).map(([k]) => k),
    [enabled],
  );

  // Live preview from the server (used for both the setup estimate and grid).
  const preview = useAsync<BatchPreview | null>(
    () =>
      classId && feeKeys.length
        ? api.invoices.previewBatch({ classId, segment, feeKeys })
        : Promise.resolve(null),
    [classId, segment, feeKeys.join(',')],
  );

  const pv = preview.data;

  // Client-side totals that factor in the review-grid discounts.
  const totals = useMemo(() => {
    if (!pv) return { count: 0, gross: 0, discount: 0, net: 0 };
    let gross = 0;
    let discount = 0;
    for (const r of pv.rows) {
      gross += r.gross;
      discount += rowDiscount(r.gross, adjust[r.studentId]);
    }
    return { count: pv.rows.length, gross, discount, net: Math.max(0, gross - discount) };
  }, [pv, adjust]);

  const setRow = (studentId: string, patch: Partial<RowAdjust>) =>
    setAdjust((a) => ({
      ...a,
      [studentId]: { type: 'NONE', value: 0, reason: '', ...a[studentId], ...patch },
    }));

  const create = async () => {
    if (!pv) return;
    setBusy(true);
    try {
      const adjustments: Record<string, { flatDiscount?: number; reason?: string }> = {};
      for (const r of pv.rows) {
        const d = rowDiscount(r.gross, adjust[r.studentId]);
        if (d > 0) adjustments[r.studentId] = { flatDiscount: d, reason: adjust[r.studentId]?.reason || undefined };
      }
      const res = await api.invoices.createBatch({
        name,
        classId,
        segment,
        feeKeys,
        issueDate,
        dueDate,
        adjustments,
      });
      setCreated(res.created);
      setStep('done');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to create invoices');
    } finally {
      setBusy(false);
    }
  };

  // ---- Step: done ----
  if (step === 'done') {
    return (
      <div className="success">
        <div className="badge">
          <Icon name="check" size={32} />
        </div>
        <h2>{created} invoices created</h2>
        <p>
          Every parent can be notified on WhatsApp with their amount and a UPI link. Receipts send
          themselves as payments arrive.
        </p>
        <div className="acts">
          <button className="btn grn" onClick={() => navigate('/invoices')}>
            Back to invoices
          </button>
          <button
            className="btn"
            onClick={() => {
              setAdjust({});
              setCreated(0);
              setStep('setup');
            }}
          >
            Bill another class
          </button>
        </div>
      </div>
    );
  }

  // ---- Step: review ----
  if (step === 'review') {
    const cols = pv?.columns ?? [];
    return (
      <>
        <Stepper step="review" />
        <div className="tbar">
          <span className="muted" style={{ fontSize: 12 }}>
            {pv?.className} · set a discount per student; totals update live
          </span>
        </div>
        <div className="gridwrap">
          <table className="rvw">
            <thead>
              <tr>
                <th className="rn">#</th>
                <th>Student</th>
                <th>Type</th>
                {cols.map((c) => (
                  <th key={c.key} className="num">
                    {c.name}
                  </th>
                ))}
                <th>Discount</th>
                <th className="num">Value</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {(pv?.rows ?? []).map((r, i) => {
                const adj = adjust[r.studentId] ?? { type: 'NONE' as DiscountType, value: 0, reason: '' };
                const disc = rowDiscount(r.gross, adj);
                return (
                  <tr key={r.studentId}>
                    <td className="rn">{i + 1}</td>
                    <td>
                      <div className="sname">
                        <span className="av">{r.name[0]}</span>
                        <b>{r.name}</b>
                      </div>
                    </td>
                    <td>
                      <span className={`tag ${r.isNewAdmission ? 'new' : 'old'}`}>
                        <i />
                        {r.isNewAdmission ? 'New' : 'Old'}
                      </span>
                    </td>
                    {cols.map((c) => {
                      const v = r.amounts[c.key];
                      return (
                        <td key={c.key} className="num">
                          {v == null ? <span className="na">—</span> : formatMoney(v)}
                        </td>
                      );
                    })}
                    <td>
                      <select
                        className="tsel"
                        value={adj.type}
                        onChange={(e) => setRow(r.studentId, { type: e.target.value as DiscountType })}
                      >
                        <option value="NONE">None</option>
                        <option value="PERCENT">Percentage</option>
                        <option value="FLAT">Manual ₹</option>
                      </select>
                    </td>
                    <td className="num">
                      {adj.type === 'NONE' ? (
                        <span className="na">—</span>
                      ) : (
                        <input
                          className="cell"
                          type="number"
                          min={0}
                          value={adj.value || ''}
                          onChange={(e) => setRow(r.studentId, { value: Number(e.target.value) })}
                        />
                      )}
                    </td>
                    <td className="total">{formatMoney(Math.max(0, r.gross - disc))}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td />
                <td className="lbl">Total</td>
                <td />
                {cols.map((c) => (
                  <td key={c.key} />
                ))}
                <td className="lbl">−{formatMoney(totals.discount)}</td>
                <td />
                <td className="net">{formatMoney(totals.net)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="footbar">
          <div className="sums">
            <div className="s">
              <div className="k">Invoices</div>
              <div className="v">{totals.count}</div>
            </div>
            <div className="s">
              <div className="k">Gross</div>
              <div className="v">{formatMoney(totals.gross)}</div>
            </div>
            <div className="s">
              <div className="k">Discounts</div>
              <div className="v amb">−{formatMoney(totals.discount)}</div>
            </div>
            <div className="s">
              <div className="k">Net to invoice</div>
              <div className="v grn">{formatMoney(totals.net)}</div>
            </div>
          </div>
          <div className="sp" />
          <button className="btn ghost" onClick={() => setStep('setup')}>
            <Icon name="arrowLeft" size={15} />
            Back
          </button>
          <button className="btn grn" disabled={busy || totals.count === 0} onClick={create}>
            {busy ? 'Creating…' : `Create ${totals.count} invoices`}
          </button>
        </div>
      </>
    );
  }

  // ---- Step: setup ----
  return (
    <>
      <Stepper step="setup" />

      <div className="panel">
        <h4>Invoice details</h4>
        <div className="ph">These apply to every invoice in this batch.</div>
        <div className="frow">
          <div className="fld">
            <label>Invoice name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="fld">
            <label>Invoice date</label>
            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div className="fld">
            <label>Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="panel">
        <h4>Who is this for?</h4>
        <div className="ph">Fees auto-fill from your fee structure based on each student&apos;s new/old status.</div>
        <div className="frow" style={{ gridTemplateColumns: '220px 1fr', alignItems: 'end' }}>
          <div className="fld">
            <label>Class</label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              {(classes.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label>Students</label>
            <div className="seg">
              {SEGMENTS.map((s) => (
                <button key={s.seg} className={segment === s.seg ? 'on' : ''} onClick={() => setSegment(s.seg)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h4>Fee lines</h4>
        <div className="ph">Toggle any line off; per-student changes happen in the next step.</div>
        <div className="feelines">
          {(feeTypes.data ?? []).map((f) => {
            const on = enabled[f.key] ?? true;
            return (
              <div key={f.key} className={`fl${on ? '' : ' off'}`}>
                <div
                  className={`chk${on ? ' on' : ''}`}
                  onClick={() => setEnabled((e) => ({ ...e, [f.key]: !on }))}
                >
                  <Icon name="check" size={13} />
                </div>
                <div className="fn">
                  <b>{f.name}</b>
                  <span>
                    {f.description}
                    {f.optIn ? ' · van students only' : ''}
                  </span>
                </div>
                <div className="amt">
                  <span className="lab">Pricing</span>
                  <span className="money" style={{ fontSize: 12 }}>
                    {f.pricingMode === 'SPLIT' ? 'New / Old' : 'One price'}
                  </span>
                </div>
                <div className="amt">
                  <span className="lab">Period</span>
                  <span className="chip-period">
                    {f.period === 'ONE_TIME' ? 'One-time' : `${f.periodCount}×`}
                  </span>
                </div>
                <div />
              </div>
            );
          })}
        </div>
        <div className="note">
          <Icon name="info" size={16} />
          <span>
            Opt-in fees (like <b>Van Fee</b>) only apply to students with transport — they fill in for
            van students and stay blank for the rest.
          </span>
        </div>
      </div>

      <div className="footbar">
        <div className="sums">
          <div className="s">
            <div className="k">Students in batch</div>
            <div className="v">{preview.loading ? '…' : totals.count}</div>
          </div>
          <div className="s">
            <div className="k">Est. total invoiced</div>
            <div className="v grn">{preview.loading ? '…' : formatMoney(totals.gross)}</div>
          </div>
        </div>
        <div className="sp" />
        <button className="btn ghost" onClick={() => navigate('/invoices')}>
          Cancel
        </button>
        <button
          className="btn grn"
          disabled={!classId || feeKeys.length === 0 || totals.count === 0}
          onClick={() => setStep('review')}
        >
          Review invoices
          <Icon name="arrowRight" size={15} />
        </button>
      </div>
    </>
  );
}

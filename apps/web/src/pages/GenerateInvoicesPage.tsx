import { useMemo, useState } from 'react';
import {
  computeDiscount,
  formatMoney,
  rupeesToPaise,
  splitEven,
  type DiscountType,
  type FeeScope,
} from '@mentivax/core';
import type { InvoiceSinglePreview } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { StudentPicker } from '../components/StudentPicker';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

/**
 * Add a single invoice for one student — pick the student, optionally apply a
 * discount, and create the invoice from their standard's fees + transport.
 */
export function AddInvoiceModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { api } = useApi();
  const toast = useToast();
  const students = useAsync(() => api.students.list({}), []);
  const preview = useAsync(() => api.invoices.generatePreview(), []);

  const [studentId, setStudentId] = useState('');
  const [feeScope, setFeeScope] = useState<FeeScope>('ALL');
  const [discType, setDiscType] = useState<DiscountType>('NONE');
  const [discValue, setDiscValue] = useState(0);
  const [discReason, setDiscReason] = useState('');
  const [discFeeKey, setDiscFeeKey] = useState('');
  const [discPeriod, setDiscPeriod] = useState('');
  const [busy, setBusy] = useState(false);

  // Base fee per student, split by fee type, from the generate preview.
  const feesById = useMemo(
    () =>
      Object.fromEntries(
        (preview.data ?? []).map(
          (r) => [r.studentId, { all: r.gross, academic: r.academicGross, transport: r.transportGross }] as const,
        ),
      ),
    [preview.data],
  );
  const invoicedIds = useMemo(
    () => new Set((preview.data ?? []).filter((r) => r.hasInvoice).map((r) => r.studentId)),
    [preview.data],
  );

  // Period-wise split of the invoice under the chosen student + fee type.
  const split = useAsync(
    () =>
      studentId
        ? api.invoices.previewSingle(studentId, feeScope)
        : Promise.resolve<InvoiceSinglePreview | null>(null),
    [studentId, feeScope],
  );

  // Group the period rows by fee for the per-fee allocation view.
  const allocGroups = useMemo(() => {
    const map = new Map<string, { feeKey: string; feeName: string; rows: { period: string; amount: number }[] }>();
    for (const r of split.data?.rows ?? []) {
      const g = map.get(r.feeName) ?? { feeKey: r.feeKey, feeName: r.feeName, rows: [] };
      g.rows.push({ period: r.period, amount: r.amount });
      map.set(r.feeName, g);
    }
    return [...map.values()];
  }, [split.data]);

  // Distinct fees (key + name + gross) to choose which one a discount applies to.
  const feeOptions = useMemo(() => {
    const map = new Map<string, { key: string; name: string; gross: number }>();
    for (const r of split.data?.rows ?? []) {
      const g = map.get(r.feeKey) ?? { key: r.feeKey, name: r.feeName, gross: 0 };
      g.gross += r.amount;
      map.set(r.feeKey, g);
    }
    return [...map.values()];
  }, [split.data]);

  // Periods of the fee the discount targets (to optionally narrow the discount).
  const periodOptions = useMemo(
    () =>
      (split.data?.rows ?? [])
        .filter((r) => r.feeKey === discFeeKey)
        .map((r, i) => ({ index: i, label: r.period, amount: r.amount })),
    [split.data, discFeeKey],
  );

  const sel = (students.data ?? []).find((s) => s.id === studentId);
  const fees = feesById[studentId];
  const base =
    feeScope === 'ACADEMIC' ? (fees?.academic ?? 0) : feeScope === 'TRANSPORT' ? (fees?.transport ?? 0) : (fees?.all ?? 0);
  const storedDiscount =
    discType === 'PERCENT' ? Math.round(discValue * 100) : discType === 'FLAT' ? rupeesToPaise(discValue) : 0;
  // Discount base: a specific period, a whole fee, or the whole invoice.
  const targetFee = feeOptions.find((f) => f.key === discFeeKey);
  const discountBase = !discFeeKey
    ? base
    : discPeriod !== ''
      ? (periodOptions[Number(discPeriod)]?.amount ?? targetFee?.gross ?? base)
      : (targetFee?.gross ?? base);
  const discount = computeDiscount(discountBase, discType, storedDiscount);
  const net = Math.max(0, base - discount);
  const canCreate = !!studentId && base > 0 && !busy;

  // Discount charged against one period of the targeted fee (for the allocation view):
  // a chosen period gets the whole discount; "Split equally" spreads it across periods.
  const periodDiscount = (feeKey: string, index: number, count: number): number => {
    if (discType === 'NONE' || discount <= 0 || feeKey !== discFeeKey) return 0;
    if (discPeriod !== '') return Number(discPeriod) === index ? discount : 0;
    return splitEven(discount, count)[index] ?? 0;
  };

  const create = async () => {
    if (!canCreate) return;
    setBusy(true);
    try {
      await api.invoices.createOne({
        studentId,
        feeScope,
        discountType: discType,
        discountValue: storedDiscount,
        discountReason: discType !== 'NONE' ? discReason.trim() || undefined : undefined,
        discountFeeKey: discType !== 'NONE' && discFeeKey ? discFeeKey : undefined,
        discountPeriodIndex:
          discType !== 'NONE' && discFeeKey && discPeriod !== '' ? Number(discPeriod) : undefined,
      });
      toast(`Invoice created for ${sel?.name ?? 'student'}`);
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create invoice');
      setBusy(false);
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 1200, width: '95vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="mh">
          <div>
            <b>Add invoice</b>
            <span>Create an invoice for a student from their standard’s fees.</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div className="ai-split">
            {/* LEFT — the form */}
            <div className="ai-left">
              <div className="fld">
                <label>Student</label>
                <StudentPicker
                  students={students.data ?? []}
                  value={studentId}
                  onChange={(id) => {
                    setStudentId(id);
                    setFeeScope('ALL');
                    setDiscType('NONE');
                    setDiscValue(0);
                    setDiscReason('');
                    setDiscFeeKey('');
                    setDiscPeriod('');
                  }}
                />
              </div>

              {studentId && (fees?.all ?? 0) > 0 && (
                <>
                  {sel?.className && (
                    <div className="muted" style={{ fontSize: 12.5, marginTop: -4, marginBottom: 4 }}>
                      Standard: <b>{sel.className}</b>
                    </div>
                  )}

                  <div className="fld">
                    <label>Fees type</label>
                    <select
                      value={feeScope}
                      onChange={(e) => {
                        setFeeScope(e.target.value as FeeScope);
                        setDiscFeeKey('');
                        setDiscPeriod('');
                      }}
                    >
                      <option value="ALL">All fees (academic + transport)</option>
                      <option value="ACADEMIC">Academic</option>
                      <option value="TRANSPORT">Transport</option>
                    </select>
                  </div>

                  {base > 0 ? (
                    <>
                      <div className="alloc-sums" style={{ marginTop: 6, gridTemplateColumns: '1fr' }}>
                        <div className="alloc-sum">
                          <span>Base fee</span>
                          <b>{formatMoney(base)}</b>
                        </div>
                        <div className="alloc-sum">
                          <span>Discount</span>
                          <b>{formatMoney(discount)}</b>
                        </div>
                        <div className="alloc-sum pay">
                          <span>Net</span>
                          <b>{formatMoney(net)}</b>
                        </div>
                      </div>

                      <div className="frow" style={{ gridTemplateColumns: discType === 'NONE' ? '1fr' : '1fr 160px' }}>
                        <div className="fld">
                          <label>Discount (optional)</label>
                          <select value={discType} onChange={(e) => setDiscType(e.target.value as DiscountType)}>
                            <option value="NONE">No discount</option>
                            <option value="PERCENT">Percent %</option>
                            <option value="FLAT">Flat ₹</option>
                          </select>
                        </div>
                        {discType !== 'NONE' && (
                          <div className="fld">
                            <label>{discType === 'PERCENT' ? 'Percent (%)' : 'Amount (₹)'}</label>
                            <input
                              type="number"
                              min={0}
                              placeholder="0"
                              value={discValue || ''}
                              onChange={(e) => setDiscValue(Number(e.target.value))}
                            />
                          </div>
                        )}
                      </div>

                      {discType !== 'NONE' && (
                        <div className="fld">
                          <label>Discount reason</label>
                          <input
                            type="text"
                            placeholder="e.g. Sibling concession, staff ward…"
                            value={discReason}
                            onChange={(e) => setDiscReason(e.target.value)}
                          />
                        </div>
                      )}

                      {discType !== 'NONE' && (
                        <div className="fld">
                          <label>Discount applies to</label>
                          <select
                            value={discFeeKey}
                            onChange={(e) => {
                              setDiscFeeKey(e.target.value);
                              setDiscPeriod('');
                            }}
                          >
                            <option value="">All fees</option>
                            {feeOptions.map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {discType !== 'NONE' && discFeeKey && periodOptions.length > 0 && (
                        <div className="fld">
                          <label>Discount period</label>
                          <select value={discPeriod} onChange={(e) => setDiscPeriod(e.target.value)}>
                            <option value="">Split equally</option>
                            {periodOptions.map((p) => (
                              <option key={p.index} value={p.index}>
                                {p.label} · {formatMoney(p.amount)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {invoicedIds.has(studentId) && (
                        <div className="alloc-note">This student already has an invoice — this creates another.</div>
                      )}
                    </>
                  ) : (
                    <div className="state">
                      {feeScope === 'TRANSPORT'
                        ? 'No transport is assigned to this student.'
                        : 'No academic fees are configured for this standard.'}
                    </div>
                  )}
                </>
              )}
              {studentId && (fees?.all ?? 0) === 0 && !preview.loading && (
                <div className="state">
                  No fees configured for {sel?.className ?? 'this standard'} — set them under Structure-Standard
                  Mappings.
                </div>
              )}
            </div>

            {/* RIGHT — period-based payment allocation */}
            <div className="ai-right">
              {(split.data?.rows.length ?? 0) > 0 ? (
                <>
                  <h4 className="std-sec" style={{ marginTop: 0, marginBottom: 8 }}>
                    Period-based payment allocation
                  </h4>
                  <div className="pba-scroll">
                    <div className="pba-grid">
                      {allocGroups.map((g) => (
                        <div className="pba-group" key={g.feeName}>
                          <div className="pba-title">{g.feeName}</div>
                          <div className="pba-note">
                            <Icon name="info" size={13} />
                            Amount is allocated to periods from oldest to newest.
                          </div>
                          <div className="card-t" style={{ overflowX: 'auto' }}>
                            <table>
                              <thead>
                                <tr>
                                  <th>Period</th>
                                  <th className="num">Amount</th>
                                  <th className="num">Discount</th>
                                  <th className="num">Payable</th>
                                  <th>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {g.rows.map((r, i) => {
                                  const disc = periodDiscount(g.feeKey, i, g.rows.length);
                                  const payable = Math.max(0, r.amount - disc);
                                  return (
                                    <tr key={i}>
                                      <td>
                                        <span className="fs-chip">{r.period}</span>
                                      </td>
                                      <td className="num">{formatMoney(r.amount)}</td>
                                      <td className={`num${disc > 0 ? '' : ' muted'}`}>
                                        {disc > 0 ? `−${formatMoney(disc)}` : formatMoney(0)}
                                      </td>
                                      <td className="num">{formatMoney(payable)}</td>
                                      <td>
                                        <span className="tag due">
                                          <i />
                                          Pending
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="ai-empty">
                  Pick a student and fee type to see the period-based allocation.
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mf">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn grn" disabled={!canCreate} onClick={create}>
            <Icon name="plus" size={15} />
            {busy ? 'Creating…' : 'Create invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}

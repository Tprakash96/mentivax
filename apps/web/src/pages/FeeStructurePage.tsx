import { useEffect, useState } from 'react';
import { paiseToRupees, rupeesToPaise, type FeePeriod, type PricingMode } from '@mentivax/core';
import type { FeeStructureRow } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

const DURATIONS: { value: FeePeriod; label: string }[] = [
  { value: 'DUE_DATE', label: 'Due date' },
  { value: 'MONTHLY', label: 'Month' },
  { value: 'TERM', label: 'Term' },
  { value: 'ONE_TIME', label: 'Once in year' },
];

// Count options offered as dropdowns per duration.
const TERM_COUNTS = [1, 2, 3];
const MONTH_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const PRICING: { value: PricingMode; label: string }[] = [
  { value: 'COMMON', label: 'Common' },
  { value: 'SPLIT', label: 'Split (new/old)' },
];

const isoDay = (v?: string | null) => (v ?? '').slice(0, 10);
const todayIso = () => new Date().toISOString().slice(0, 10);

export function FeeStructurePage() {
  const { api } = useApi();
  const toast = useToast();
  const classes = useAsync(() => api.classes.list(), []);
  const [classId, setClassId] = useState<string | null>(null);

  useEffect(() => {
    if (!classId && classes.data?.[0]) setClassId(classes.data[0].id);
  }, [classes.data, classId]);

  const rows = useAsync(
    () => (classId ? api.feeStructure.get(classId) : Promise.resolve([])),
    [classId],
  );

  const [draft, setDraft] = useState<FeeStructureRow[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(rows.data ?? []), [rows.data]);

  const setAmount = (feeTypeId: string, field: 'flatAmount' | 'newAmount' | 'oldAmount', rupees: number) => {
    setDraft((d) =>
      d.map((r) => (r.feeTypeId === feeTypeId ? { ...r, [field]: rupeesToPaise(rupees) } : r)),
    );
  };

  const setPeriod = (feeTypeId: string, period: FeePeriod) => {
    setDraft((d) =>
      d.map((r) => {
        if (r.feeTypeId !== feeTypeId) return r;
        const periodCount =
          period === 'TERM'
            ? Math.min(3, Math.max(1, r.periodCount))
            : period === 'MONTHLY'
              ? Math.max(1, r.periodCount)
              : 1; // ONE_TIME / DUE_DATE
        const dueDate = period === 'DUE_DATE' ? isoDay(r.dueDate) || todayIso() : null;
        return { ...r, period, periodCount, dueDate };
      }),
    );
  };

  const setDueDate = (feeTypeId: string, dueDate: string) => {
    setDraft((d) => d.map((r) => (r.feeTypeId === feeTypeId ? { ...r, dueDate } : r)));
  };

  const setName = (feeTypeId: string, name: string) => {
    setDraft((d) => d.map((r) => (r.feeTypeId === feeTypeId ? { ...r, name } : r)));
  };

  const setPeriodCount = (feeTypeId: string, count: number) => {
    setDraft((d) =>
      d.map((r) =>
        r.feeTypeId === feeTypeId ? { ...r, periodCount: Math.min(12, Math.max(1, count || 1)) } : r,
      ),
    );
  };

  const setPricing = (feeTypeId: string, pricingMode: PricingMode) => {
    setDraft((d) => d.map((r) => (r.feeTypeId === feeTypeId ? { ...r, pricingMode } : r)));
  };

  const save = async () => {
    if (!classId) return;
    setSaving(true);
    try {
      // Period + pricing live on the fee type (school-wide). Persist only the
      // rows whose plan actually changed.
      const original = new Map((rows.data ?? []).map((r) => [r.feeTypeId, r]));
      const changedTypes = draft.filter((r) => {
        const o = original.get(r.feeTypeId);
        return (
          o &&
          (o.name !== r.name ||
            o.period !== r.period ||
            o.pricingMode !== r.pricingMode ||
            o.periodCount !== r.periodCount ||
            isoDay(o.dueDate) !== isoDay(r.dueDate))
        );
      });
      await Promise.all(
        changedTypes.map((r) =>
          api.feeTypes.update(r.feeTypeId, {
            name: r.name.trim(),
            period: r.period,
            pricingMode: r.pricingMode,
            periodCount: r.periodCount,
            dueDate: r.period === 'DUE_DATE' ? isoDay(r.dueDate) : undefined,
          }),
        ),
      );

      // Amounts live on the per-class fee structure.
      await api.feeStructure.update({
        classId,
        entries: draft.map((r) => ({
          feeTypeId: r.feeTypeId,
          flatAmount: r.flatAmount,
          newAmount: r.newAmount,
          oldAmount: r.oldAmount,
        })),
      });
      rows.reload();
      toast(
        changedTypes.length > 0
          ? 'Saved — plan changes apply to this fee across all classes'
          : 'Fee structure saved — batches will use these amounts',
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h4>Fee structure</h4>
          <div className="ph" style={{ margin: 0 }}>
            Set fees once per class. <b>Split</b> plans price new vs old students differently;{' '}
            <b>common</b> plans use one price for all.
          </div>
        </div>
        <div className="sp" style={{ flex: 1 }} />
        <button className="btn grn" disabled={saving} onClick={save}>
          <Icon name="save" size={15} />
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <div className="fs-layout">
        <div className="classlist">
          {(classes.data ?? []).map((c) => (
            <button
              key={c.id}
              className={`cli${classId === c.id ? ' on' : ''}`}
              onClick={() => setClassId(c.id)}
            >
              {c.name}
              <span className="n">{c.studentCount ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="card-t">
          <table className="fs-tbl">
            <thead>
              <tr>
                <th>Fee</th>
                <th>Duration</th>
                <th>Pricing</th>
                <th className="num">New / All</th>
                <th className="num">Old</th>
              </tr>
            </thead>
            <tbody>
              {draft.map((r) => {
                const split = r.pricingMode === 'SPLIT';
                return (
                  <tr key={r.feeTypeId}>
                    <td>
                      <div className="fs-fee">
                        <input
                          className="fs-name"
                          type="text"
                          value={r.name}
                          placeholder="Fee name"
                          onChange={(e) => setName(r.feeTypeId, e.target.value)}
                        />
                        {r.optIn && <span className="muted fs-optin">opt-in</span>}
                      </div>
                    </td>
                    <td>
                      <div className="fs-plan">
                        <select
                          className="fs-sel"
                          value={r.period}
                          onChange={(e) => setPeriod(r.feeTypeId, e.target.value as FeePeriod)}
                        >
                          {DURATIONS.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>

                        {r.period === 'DUE_DATE' && (
                          <input
                            className="fs-date"
                            type="date"
                            value={isoDay(r.dueDate)}
                            onChange={(e) => setDueDate(r.feeTypeId, e.target.value)}
                          />
                        )}

                        {(r.period === 'TERM' || r.period === 'MONTHLY') && (
                          <>
                            <span className="fs-x">×</span>
                            <select
                              className="fs-sel fs-count"
                              value={r.periodCount}
                              onChange={(e) => setPeriodCount(r.feeTypeId, Number(e.target.value))}
                            >
                              {(r.period === 'TERM' ? TERM_COUNTS : MONTH_COUNTS).map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                      </div>
                    </td>
                    <td>
                      <select
                        className="fs-sel"
                        value={r.pricingMode}
                        onChange={(e) => setPricing(r.feeTypeId, e.target.value as PricingMode)}
                      >
                        {PRICING.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        value={paiseToRupees(split ? r.newAmount : r.flatAmount)}
                        onChange={(e) =>
                          setAmount(r.feeTypeId, split ? 'newAmount' : 'flatAmount', Number(e.target.value))
                        }
                      />
                    </td>
                    <td className="num">
                      {split ? (
                        <input
                          type="number"
                          value={paiseToRupees(r.oldAmount)}
                          onChange={(e) => setAmount(r.feeTypeId, 'oldAmount', Number(e.target.value))}
                        />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.loading && <div className="state">Loading fee structure…</div>}
          {rows.error && <div className="state err">{rows.error}</div>}
        </div>
      </div>
    </>
  );
}

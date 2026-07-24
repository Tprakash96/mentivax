import { useEffect, useState } from 'react';
import { paiseToRupees, rupeesToPaise } from '@mentivax/core';
import type { FeeStructureRow } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

const PERIOD_LABEL: Record<string, string> = {
  ONE_TIME: 'One-time',
  TERM: 'Term',
  MONTHLY: 'Monthly',
};

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

  const save = async () => {
    if (!classId) return;
    setSaving(true);
    try {
      await api.feeStructure.update({
        classId,
        entries: draft.map((r) => ({
          feeTypeId: r.feeTypeId,
          flatAmount: r.flatAmount,
          newAmount: r.newAmount,
          oldAmount: r.oldAmount,
        })),
      });
      toast('Fee structure saved — batches will use these amounts');
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
                <th>Fee / plan</th>
                <th>Period</th>
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
                      <b style={{ fontWeight: 600 }}>{r.name}</b>
                      {r.optIn && <span className="muted"> · opt-in</span>}
                    </td>
                    <td>
                      <span className="chip-period">
                        {PERIOD_LABEL[r.period]}
                        {r.periodCount > 1 ? ` × ${r.periodCount}` : ''}
                      </span>
                    </td>
                    <td>
                      <span className="cls">{split ? 'Split (new/old)' : 'Common'}</span>
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

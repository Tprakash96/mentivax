import { useEffect, useState } from 'react';
import { paiseToRupees, rupeesToPaise, type FeePeriod } from '@mentivax/core';
import type { FeeStructureRow, TransportRoute } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { UnsavedGuard } from '../components/UnsavedGuard';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

const durationLabel = (period: FeePeriod, count: number, dueDate?: string | null) => {
  if (period === 'ONE_TIME') return 'One time';
  if (period === 'DUE_DATE') return (dueDate ?? '').slice(0, 10) || 'Due date';
  if (period === 'TERM') return `${count} term${count > 1 ? 's' : ''}`;
  return `${count} month${count > 1 ? 's' : ''}`;
};

export function MappingsPage() {
  const { hasModule } = useApi();
  const [tab, setTab] = useState<'academic' | 'transport'>('academic');
  const transportOn = hasModule('transport');

  return (
    <>
      <div className="tabs">
        <button className={`tab${tab === 'academic' ? ' on' : ''}`} onClick={() => setTab('academic')}>
          Academic
        </button>
        {transportOn && (
          <button className={`tab${tab === 'transport' ? ' on' : ''}`} onClick={() => setTab('transport')}>
            Transport
          </button>
        )}
      </div>
      {tab === 'academic' || !transportOn ? <AcademicMapping /> : <TransportMapping />}
    </>
  );
}

// ─── Academic: amount per fee, per standard (new/old split) ─────────────────
function AcademicMapping() {
  const { api } = useApi();
  const toast = useToast();
  const classes = useAsync(() => api.classes.list(), []);
  const [classId, setClassId] = useState<string | null>(null);
  useEffect(() => {
    if (!classId && classes.data?.[0]) setClassId(classes.data[0].id);
  }, [classes.data, classId]);

  const rows = useAsync(() => (classId ? api.feeStructure.get(classId) : Promise.resolve([])), [classId]);
  const [amounts, setAmounts] = useState<FeeStructureRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setAmounts(rows.data ?? []);
    setDirty(false);
  }, [rows.data]);

  const setAmount = (id: string, field: 'flatAmount' | 'newAmount' | 'oldAmount', rupees: number) => {
    setAmounts((d) => d.map((r) => (r.feeTypeId === id ? { ...r, [field]: rupeesToPaise(rupees) } : r)));
    setDirty(true);
  };

  const save = async () => {
    if (!classId) return;
    setSaving(true);
    try {
      await api.feeStructure.update({
        classId,
        entries: amounts.map((r) => ({ feeTypeId: r.feeTypeId, flatAmount: r.flatAmount, newAmount: r.newAmount, oldAmount: r.oldAmount })),
      });
      setDirty(false);
      rows.reload();
      toast('Amounts saved — invoices will use these');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const list = classes.data ?? [];

  return (
    <>
      <UnsavedGuard dirty={dirty} onSave={save} />
      <div className="panel fs-head">
        <div>
          <h4>Academic fees per standard</h4>
          <div className="ph" style={{ margin: 0 }}>
            Pick a standard, then set what it pays for each fee. <b>Split</b> fees price new vs. old
            admissions. Add fees under <b>Fees Structure</b>.
          </div>
        </div>
        <div className="sp" style={{ flex: 1 }} />
        <button className="btn grn" disabled={!classId || saving} onClick={() => void save().catch(() => {})}>
          <Icon name="save" size={15} />
          {saving ? 'Saving…' : 'Save amounts'}
        </button>
      </div>

      <div className="fs-layout">
        <div className="classlist">
          {list.map((c) => (
            <button key={c.id} className={`cli${classId === c.id ? ' on' : ''}`} onClick={() => setClassId(c.id)}>
              {c.name}
              <span className="n">{c.studentCount ?? 0}</span>
            </button>
          ))}
          {list.length === 0 && <div className="muted" style={{ padding: 12, fontSize: 12.5 }}>No standards yet.</div>}
        </div>

        <div className="card-t" style={{ overflowX: 'auto' }}>
          {!classId ? (
            <div className="state">Create a standard first (Settings → Standards).</div>
          ) : amounts.length === 0 ? (
            <div className="state">No fee items yet — add them under Fees Structure.</div>
          ) : (
            <table className="fs-tbl">
              <colgroup>
                <col />
                <col style={{ width: 150 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 130 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Fee</th>
                  <th>Duration</th>
                  <th className="num">New / All</th>
                  <th className="num">Old</th>
                </tr>
              </thead>
              <tbody>
                {amounts.map((r) => {
                  const split = r.pricingMode === 'SPLIT';
                  const transport = r.pricingMode === 'STOP' || r.pricingMode === 'DISTANCE' || r.pricingMode === 'FLAT';
                  return (
                    <tr key={r.feeTypeId}>
                      <td><b>{r.name}</b></td>
                      <td><span className="fs-chip">{durationLabel(r.period, r.periodCount, r.dueDate)}</span></td>
                      {transport ? (
                        <td className="num muted" colSpan={2} style={{ textAlign: 'left' }}>
                          Priced by transport —{' '}
                          {r.pricingMode === 'STOP' ? 'the student’s stop fare' : r.pricingMode === 'DISTANCE' ? '₹/km × distance' : 'a flat fare'}
                          . Set under <b>Transport</b>.
                        </td>
                      ) : (
                        <>
                          <td className="num">
                            <input
                              type="number"
                              value={paiseToRupees(split ? r.newAmount : r.flatAmount)}
                              onChange={(e) => setAmount(r.feeTypeId, split ? 'newAmount' : 'flatAmount', Number(e.target.value))}
                            />
                          </td>
                          <td className="num">
                            {split ? (
                              <input type="number" value={paiseToRupees(r.oldAmount)} onChange={(e) => setAmount(r.feeTypeId, 'oldAmount', Number(e.target.value))} />
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {rows.loading && <div className="state">Loading…</div>}
          {rows.error && <div className="state err">{rows.error}</div>}
        </div>
      </div>
    </>
  );
}

// ─── Transport: both-way / one-way fare per stop, grouped by route ──────────
function TransportMapping() {
  const { api } = useApi();
  const toast = useToast();
  const routesA = useAsync(() => api.transport.routes.list(), []);
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setRoutes(routesA.data ?? []);
    setDirty(false);
  }, [routesA.data]);

  const setFare = (stopId: string, field: 'bothWayFare' | 'oneWayFare', rupees: number) => {
    setRoutes((rs) => rs.map((r) => ({ ...r, stops: r.stops.map((s) => (s.id === stopId ? { ...s, [field]: rupeesToPaise(rupees) } : s)) })));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const fares = routes.flatMap((r) => r.stops.map((s) => ({ stopId: s.id, bothWayFare: s.bothWayFare, oneWayFare: s.oneWayFare })));
      const updated = await api.transport.stops.saveFares({ fares });
      setDirty(false);
      setRoutes(updated);
      toast('Transport fares saved');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const hasStops = routes.some((r) => r.stops.length > 0);

  return (
    <>
      <UnsavedGuard dirty={dirty} onSave={save} />
      <div className="panel fs-head">
        <div>
          <h4>Transport fares per stop</h4>
          <div className="ph" style={{ margin: 0 }}>
            Set each stop’s <b>both-way</b> and <b>one-way</b> fare. Students taking morning- or
            evening-only are billed the one-way fare. Add routes/stops under <b>Fees Structure</b>.
          </div>
        </div>
        <div className="sp" style={{ flex: 1 }} />
        <button className="btn grn" disabled={!hasStops || saving} onClick={() => void save().catch(() => {})}>
          <Icon name="save" size={15} />
          {saving ? 'Saving…' : 'Save fares'}
        </button>
      </div>

      <div className="card-t" style={{ overflowX: 'auto' }}>
        {!hasStops ? (
          <div className="state">No stops yet — add routes and stops under Fees Structure → Transport.</div>
        ) : (
          <table className="fs-tbl">
            <colgroup>
              <col />
              <col style={{ width: 160 }} />
              <col style={{ width: 150 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Route · Stop</th>
                <th className="num">Both-way fare</th>
                <th className="num">One-way fare</th>
              </tr>
            </thead>
            <tbody>
              {routes.flatMap((route) =>
                route.stops.map((stop) => (
                  <tr key={stop.id}>
                    <td>
                      <b>{stop.name}</b>
                      <span className="fs-chip" style={{ marginLeft: 8 }}>{route.name} · {route.vehicleNumber}</span>
                    </td>
                    <td className="num">
                      <input type="number" value={paiseToRupees(stop.bothWayFare)} onChange={(e) => setFare(stop.id, 'bothWayFare', Number(e.target.value))} />
                    </td>
                    <td className="num">
                      <input type="number" value={paiseToRupees(stop.oneWayFare)} onChange={(e) => setFare(stop.id, 'oneWayFare', Number(e.target.value))} />
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        )}
        {routesA.loading && <div className="state">Loading…</div>}
        {routesA.error && <div className="state err">{routesA.error}</div>}
      </div>
    </>
  );
}

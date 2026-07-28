import { useEffect, useRef, useState } from 'react';
import { paiseToRupees, rupeesToPaise, type FeePeriod, type PricingMode } from '@mentivax/core';
import type { FeeType, Student, TransportRoute } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { StudentPicker } from '../components/StudentPicker';
import { UnsavedGuard } from '../components/UnsavedGuard';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

type ShiftValue = 'BOTH' | 'MORNING' | 'EVENING';
const SHIFTS: { value: ShiftValue; label: string }[] = [
  { value: 'BOTH', label: 'Both ways' },
  { value: 'MORNING', label: 'Morning' },
  { value: 'EVENING', label: 'Evening' },
];

const DURATIONS: { value: FeePeriod; label: string }[] = [
  { value: 'DUE_DATE', label: 'Due date' },
  { value: 'MONTHLY', label: 'Month' },
  { value: 'TERM', label: 'Term' },
  { value: 'ONE_TIME', label: 'One time' },
];
const TERM_COUNTS = [1, 2, 3];
const MONTH_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const PRICING: { value: PricingMode; label: string }[] = [
  { value: 'COMMON', label: 'Common' },
  { value: 'SPLIT', label: 'Split (new/old)' },
];
const isoDay = (v?: string | null) => (v ?? '').slice(0, 10);
const todayIso = () => new Date().toISOString().slice(0, 10);

type FeeItem = FeeType & { _new?: boolean };

export function FeesStructurePage() {
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
          <button
            className={`tab${tab === 'transport' ? ' on' : ''}`}
            onClick={() => setTab('transport')}
          >
            Transport
          </button>
        )}
      </div>
      {tab === 'academic' || !transportOn ? <AcademicFees /> : <TransportStructure />}
    </>
  );
}

// ─── Academic: fee items (name · duration · pricing) ────────────────────────
function AcademicFees() {
  const { api } = useApi();
  const toast = useToast();
  const feeTypes = useAsync(() => api.feeTypes.list(), []);
  const [items, setItems] = useState<FeeItem[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const tmp = useRef(0);

  useEffect(() => {
    setItems(feeTypes.data ?? []);
    setDeleted([]);
    setDirty(false);
  }, [feeTypes.data]);

  const patch = (id: string, p: Partial<FeeItem>) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
    setDirty(true);
  };

  const setPeriod = (id: string, period: FeePeriod) => {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const periodCount =
      period === 'TERM' ? Math.min(3, Math.max(1, it.periodCount)) : period === 'MONTHLY' ? Math.max(1, it.periodCount) : 1;
    patch(id, { period, periodCount, dueDate: period === 'DUE_DATE' ? isoDay(it.dueDate) || todayIso() : null });
  };

  const addItem = () => {
    setItems((xs) => [
      ...xs,
      { id: `tmp-${tmp.current++}`, key: '', name: '', description: null, period: 'ONE_TIME', pricingMode: 'COMMON', periodCount: 1, dueDate: null, rank: xs.length, _new: true },
    ]);
    setDirty(true);
  };

  const removeItem = (it: FeeItem) => {
    if (!it._new) setDeleted((d) => [...d, it.id]);
    setItems((xs) => xs.filter((x) => x.id !== it.id));
    setDirty(true);
  };

  const save = async () => {
    const named = items.filter((x) => x.name.trim());
    setSaving(true);
    try {
      await Promise.all(deleted.map((id) => api.feeTypes.remove(id)));
      const original = new Map((feeTypes.data ?? []).map((f) => [f.id, f]));
      await Promise.all(
        named.map((x) => {
          const body = {
            name: x.name.trim(),
            period: x.period,
            pricingMode: x.pricingMode,
            periodCount: x.periodCount,
            dueDate: x.period === 'DUE_DATE' ? isoDay(x.dueDate) : undefined,
          };
          if (x._new) return api.feeTypes.create(body);
          const o = original.get(x.id);
          const changed =
            o && (o.name !== x.name || o.period !== x.period || o.pricingMode !== x.pricingMode || o.periodCount !== x.periodCount || isoDay(o.dueDate) !== isoDay(x.dueDate));
          return changed ? api.feeTypes.update(x.id, body) : Promise.resolve();
        }),
      );
      setDirty(false);
      feeTypes.reload();
      toast('Fee items saved');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <UnsavedGuard dirty={dirty} onSave={save} />
      <div className="panel fs-head">
        <div>
          <h4>Academic fee items</h4>
          <div className="ph" style={{ margin: 0 }}>
            Define each fee once — its <b>name</b> and how often it’s charged. Set amounts per standard
            under <b>Structure-Standard Mappings</b>.
          </div>
        </div>
        <div className="sp" style={{ flex: 1 }} />
        <button className="btn grn" disabled={saving} onClick={() => void save().catch(() => {})}>
          <Icon name="save" size={15} />
          {saving ? 'Saving…' : 'Save fee items'}
        </button>
      </div>

      <div className="card-t" style={{ overflowX: 'auto' }}>
        <table className="fs-tbl">
          <colgroup>
            <col />
            <col style={{ width: 285 }} />
            <col style={{ width: 175 }} />
            <col style={{ width: 48 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Fee name</th>
              <th>Duration</th>
              <th>Pricing</th>
              <th className="num" />
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td>
                  <input className="fs-name" value={r.name} placeholder="e.g. Tuition Fee" onChange={(e) => patch(r.id, { name: e.target.value })} />
                </td>
                <td>
                  <div className="fs-plan">
                    <select className="fs-sel fs-dur" value={r.period} onChange={(e) => setPeriod(r.id, e.target.value as FeePeriod)}>
                      {DURATIONS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                    {r.period === 'DUE_DATE' && (
                      <input className="fs-date" type="date" value={isoDay(r.dueDate)} onChange={(e) => patch(r.id, { dueDate: e.target.value })} />
                    )}
                    {(r.period === 'TERM' || r.period === 'MONTHLY') && (
                      <>
                        <span className="fs-x">×</span>
                        <select className="fs-sel fs-count" value={r.periodCount} onChange={(e) => patch(r.id, { periodCount: Number(e.target.value) })}>
                          {(r.period === 'TERM' ? TERM_COUNTS : MONTH_COUNTS).map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                </td>
                <td>
                  <select className="fs-sel" value={r.pricingMode} onChange={(e) => patch(r.id, { pricingMode: e.target.value as PricingMode })}>
                    {PRICING.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </td>
                <td className="num">
                  <button className="fs-del" title="Remove fee" onClick={() => removeItem(r)}>
                    <Icon name="trash" size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="muted" style={{ padding: 18 }}>
                  No fees yet — add your first fee item below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div style={{ padding: '10px 14px' }}>
          <button className="fs-add" onClick={addItem}>
            <Icon name="plus" size={14} /> Add fee item
          </button>
        </div>
        {feeTypes.loading && <div className="state">Loading…</div>}
        {feeTypes.error && <div className="state err">{feeTypes.error}</div>}
      </div>
    </>
  );
}

// ─── Transport: 4 sub-tabs (vans · stops · student mapping · fares) ─────────
function TransportStructure() {
  const [sub, setSub] = useState<'vans' | 'stops' | 'mapping' | 'fees'>('vans');
  const TABS: { key: typeof sub; label: string }[] = [
    { key: 'vans', label: 'Van details' },
    { key: 'stops', label: 'Stop details' },
    { key: 'mapping', label: 'Van & students' },
    { key: 'fees', label: 'Fee structure' },
  ];
  return (
    <>
      <div className="subtabs">
        {TABS.map((t) => (
          <button key={t.key} className={`subtab${sub === t.key ? ' on' : ''}`} onClick={() => setSub(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {sub === 'vans' && <VanDetails />}
      {sub === 'stops' && <StopDetails />}
      {sub === 'mapping' && <VanStudentMapping />}
      {sub === 'fees' && <TransportFees />}
    </>
  );
}

/** Shared: load routes into local state with a mutation guard. */
function useRoutes() {
  const { api } = useApi();
  const toast = useToast();
  const routesA = useAsync(() => api.transport.routes.list(), []);
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  useEffect(() => setRoutes(routesA.data ?? []), [routesA.data]);
  const guard = async (fn: () => Promise<TransportRoute[]>) => {
    try {
      setRoutes(await fn());
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Action failed');
    }
  };
  return { api, routes, setRoutes, guard, loading: routesA.loading, error: routesA.error };
}

// 1 ─ Van details (the vehicles / routes) ───────────────────────────────────
function VanDetails() {
  const { api, routes, setRoutes, guard, error } = useRoutes();
  const [adding, setAdding] = useState(false);
  const [rName, setRName] = useState('');
  const [rVeh, setRVeh] = useState('');
  const [rType, setRType] = useState<'BUS' | 'VAN'>('VAN');

  const add = async () => {
    if (!rName.trim() || !rVeh.trim()) return setAdding(false);
    await guard(() => api.transport.routes.create({ name: rName.trim(), vehicleNumber: rVeh.trim(), vehicleType: rType }));
    setRName('');
    setRVeh('');
    setRType('VAN');
    setAdding(false);
  };

  return (
    <>
      <div className="panel fs-head">
        <div>
          <h4>Van details</h4>
          <div className="ph" style={{ margin: 0 }}>Each vehicle (bus / van) that runs a route.</div>
        </div>
        <div className="sp" style={{ flex: 1 }} />
        {!adding && (
          <button className="btn grn" onClick={() => setAdding(true)}>
            <Icon name="plus" size={15} /> Add van
          </button>
        )}
      </div>

      {adding && (
        <div className="panel" style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fld">
            <label>Van / route name</label>
            <input value={rName} autoFocus placeholder="e.g. North Route" onChange={(e) => setRName(e.target.value)} />
          </div>
          <div className="fld">
            <label>Vehicle number</label>
            <input value={rVeh} placeholder="e.g. TN-01-AB-1234" onChange={(e) => setRVeh(e.target.value)} />
          </div>
          <div className="fld">
            <label>Type</label>
            <select value={rType} onChange={(e) => setRType(e.target.value as 'BUS' | 'VAN')}>
              <option value="VAN">Van</option>
              <option value="BUS">Bus</option>
            </select>
          </div>
          <button className="btn grn" onClick={add}>Add</button>
          <button className="btn" onClick={() => { setAdding(false); setRName(''); setRVeh(''); }}>Cancel</button>
        </div>
      )}

      <div className="card-t" style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Van / route</th>
              <th>Vehicle number</th>
              <th>Type</th>
              <th className="num">Stops</th>
              <th className="num" />
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => (
              <tr key={r.id}>
                <td>
                  <input
                    className="fs-name"
                    style={{ maxWidth: 240 }}
                    value={r.name}
                    onChange={(e) => setRoutes((rs) => rs.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))}
                    onBlur={() => guard(() => api.transport.routes.update(r.id, { name: r.name.trim() }))}
                  />
                </td>
                <td>
                  <input
                    className="fs-name"
                    style={{ maxWidth: 180 }}
                    value={r.vehicleNumber}
                    onChange={(e) => setRoutes((rs) => rs.map((x) => (x.id === r.id ? { ...x, vehicleNumber: e.target.value } : x)))}
                    onBlur={() => guard(() => api.transport.routes.update(r.id, { vehicleNumber: r.vehicleNumber.trim() }))}
                  />
                </td>
                <td>
                  <select
                    className="fs-sel"
                    value={r.vehicleType}
                    onChange={(e) => guard(() => api.transport.routes.update(r.id, { vehicleType: e.target.value as 'BUS' | 'VAN' }))}
                  >
                    <option value="VAN">Van</option>
                    <option value="BUS">Bus</option>
                  </select>
                </td>
                <td className="num">{r.stops.length}</td>
                <td className="num">
                  <button className="fs-del" title="Delete van" onClick={() => guard(() => api.transport.routes.remove(r.id))}>
                    <Icon name="trash" size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {routes.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ padding: 18 }}>No vans yet — add your first van above.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {error && <div className="state err">{error}</div>}
    </>
  );
}

// 2 ─ Stop details (boarding points per van) ────────────────────────────────
function StopDetails() {
  const { api, routes, setRoutes, guard, error } = useRoutes();
  const [stopName, setStopName] = useState<Record<string, string>>({});

  const addStop = async (routeId: string) => {
    const name = (stopName[routeId] ?? '').trim();
    if (!name) return;
    await guard(() => api.transport.stops.create({ routeId, name, bothWayFare: 0, oneWayFare: 0 }));
    setStopName((s) => ({ ...s, [routeId]: '' }));
  };

  return (
    <>
      <div className="panel fs-head">
        <div>
          <h4>Stop details</h4>
          <div className="ph" style={{ margin: 0 }}>The boarding points on each van’s route.</div>
        </div>
      </div>

      {routes.map((route) => (
        <div key={route.id} className="panel" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <Icon name="bus" size={18} />
            <b>{route.name}</b>
            <span className="cls">{route.vehicleNumber}</span>
          </div>
          <div style={{ paddingLeft: 28 }}>
            {route.stops.map((stop) => (
              <div key={stop.id} className="stoprow">
                <input
                  className="fs-name"
                  style={{ maxWidth: 300 }}
                  value={stop.name}
                  onChange={(e) => setRoutes((rs) => rs.map((r) => (r.id === route.id ? { ...r, stops: r.stops.map((s) => (s.id === stop.id ? { ...s, name: e.target.value } : s)) } : r)))}
                  onBlur={() => guard(() => api.transport.stops.update(stop.id, { name: stop.name.trim() }))}
                />
                <button className="fs-del" title="Delete stop" onClick={() => guard(() => api.transport.stops.remove(stop.id))}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
            <div className="stoprow">
              <input
                className="fs-name"
                style={{ maxWidth: 300 }}
                placeholder="Add a stop…"
                value={stopName[route.id] ?? ''}
                onChange={(e) => setStopName((s) => ({ ...s, [route.id]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && addStop(route.id)}
              />
              <button className="fs-add" style={{ width: 'auto', padding: '0 12px' }} onClick={() => addStop(route.id)}>
                <Icon name="plus" size={13} /> Add stop
              </button>
            </div>
          </div>
        </div>
      ))}

      {routes.length === 0 && (
        <div className="card-t">
          <div className="state">Add vans first under “Van details”.</div>
        </div>
      )}
      {error && <div className="state err">{error}</div>}
    </>
  );
}

// 3 ─ Van & students mapping ────────────────────────────────────────────────
function VanStudentMapping() {
  const { api } = useApi();
  const toast = useToast();
  const routesA = useAsync(() => api.transport.routes.list(), []);
  const students = useAsync(() => api.students.list({}), []);
  const routes = routesA.data ?? [];

  const [vanId, setVanId] = useState('');
  useEffect(() => {
    if (routes.length && !routes.some((r) => r.id === vanId)) setVanId(routes[0]!.id);
  }, [routes, vanId]);
  const van = routes.find((r) => r.id === vanId);
  const stopIds = new Set((van?.stops ?? []).map((s) => s.id));
  const mapped = (students.data ?? []).filter((s) => s.transportStopId && stopIds.has(s.transportStopId));

  const [addStudentId, setAddStudentId] = useState('');
  const [addStopId, setAddStopId] = useState('');
  const [addShift, setAddShift] = useState<ShiftValue>('BOTH');
  useEffect(() => setAddStopId(van?.stops[0]?.id ?? ''), [vanId, van?.stops.length]);

  const stopName = (id: string | null) => van?.stops.find((s) => s.id === id)?.name ?? '—';

  const assign = async () => {
    if (!addStudentId || !addStopId) return;
    try {
      await api.students.assignTransport(addStudentId, { transportStopId: addStopId, transportShift: addShift });
      setAddStudentId('');
      students.reload();
      toast('Student mapped to van');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not map student');
    }
  };
  const unassign = async (s: Student) => {
    try {
      await api.students.assignTransport(s.id, { transportStopId: null, transportShift: null });
      students.reload();
      toast(`${s.name} removed from van`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not remove');
    }
  };

  return (
    <>
      <div className="panel fs-head">
        <div>
          <h4>Van &amp; students</h4>
          <div className="ph" style={{ margin: 0 }}>Map students to a van’s stop and shift.</div>
        </div>
        <div className="sp" style={{ flex: 1 }} />
        {routes.length > 0 && (
          <select className="fs-sel" value={vanId} onChange={(e) => setVanId(e.target.value)}>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        )}
      </div>

      {van && van.stops.length > 0 ? (
        <>
          <div className="panel" style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="fld" style={{ flex: 1, minWidth: 220 }}>
              <label>Student</label>
              <StudentPicker students={students.data ?? []} value={addStudentId} onChange={setAddStudentId} />
            </div>
            <div className="fld">
              <label>Stop</label>
              <select value={addStopId} onChange={(e) => setAddStopId(e.target.value)}>
                {van.stops.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label>Shift</label>
              <select value={addShift} onChange={(e) => setAddShift(e.target.value as ShiftValue)}>
                {SHIFTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <button className="btn grn" disabled={!addStudentId || !addStopId} onClick={assign}>
              <Icon name="plus" size={15} /> Add student
            </button>
          </div>

          <div className="card-t" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Stop</th>
                  <th>Shift</th>
                  <th className="num" />
                </tr>
              </thead>
              <tbody>
                {mapped.map((s) => (
                  <tr key={s.id}>
                    <td><b style={{ fontWeight: 600 }}>{s.name}</b></td>
                    <td><span className="cls">{s.className}</span></td>
                    <td>{stopName(s.transportStopId ?? null)}</td>
                    <td>{SHIFTS.find((x) => x.value === s.transportShift)?.label ?? '—'}</td>
                    <td className="num">
                      <button className="fs-del" title="Remove from van" onClick={() => unassign(s)}>
                        <Icon name="trash" size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
                {mapped.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted" style={{ padding: 18 }}>No students mapped to this van yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="card-t">
          <div className="state">
            {routes.length === 0 ? 'Add vans first under “Van details”.' : 'Add stops to this van first under “Stop details”.'}
          </div>
        </div>
      )}
    </>
  );
}

// 4 ─ Transport fee structure (per-stop fares) ──────────────────────────────
function TransportFees() {
  const { api, routes, setRoutes, error } = useRoutes();
  const toast = useToast();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const setFare = (routeId: string, stopId: string, field: 'bothWayFare' | 'oneWayFare', rupees: string) => {
    setRoutes((rs) =>
      rs.map((r) =>
        r.id === routeId
          ? { ...r, stops: r.stops.map((s) => (s.id === stopId ? { ...s, [field]: rupeesToPaise(Number(rupees) || 0) } : s)) }
          : r,
      ),
    );
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const fares = routes.flatMap((r) => r.stops.map((s) => ({ stopId: s.id, bothWayFare: s.bothWayFare, oneWayFare: s.oneWayFare })));
      setRoutes(await api.transport.stops.saveFares({ fares }));
      setDirty(false);
      toast('Transport fares saved');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <UnsavedGuard dirty={dirty} onSave={save} />
      <div className="panel fs-head">
        <div>
          <h4>Transport fee structure</h4>
          <div className="ph" style={{ margin: 0 }}>
            Both-way and one-way fare per stop (₹). One-way applies to morning/evening-only students.
          </div>
        </div>
        <div className="sp" style={{ flex: 1 }} />
        <button className="btn grn" disabled={saving} onClick={() => void save().catch(() => {})}>
          <Icon name="save" size={15} />
          {saving ? 'Saving…' : 'Save fares'}
        </button>
      </div>

      {routes.map((route) => (
        <div key={route.id} className="panel" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <Icon name="bus" size={18} />
            <b>{route.name}</b>
            <span className="cls">{route.vehicleNumber}</span>
          </div>
          <div className="card-t" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Stop</th>
                  <th className="num">Both-way (₹)</th>
                  <th className="num">One-way (₹)</th>
                </tr>
              </thead>
              <tbody>
                {route.stops.map((s) => (
                  <tr key={s.id}>
                    <td><b style={{ fontWeight: 600 }}>{s.name}</b></td>
                    <td className="num">
                      <input
                        className="fs-fare"
                        type="number"
                        min={0}
                        placeholder="0"
                        value={paiseToRupees(s.bothWayFare) || ''}
                        onChange={(e) => setFare(route.id, s.id, 'bothWayFare', e.target.value)}
                      />
                    </td>
                    <td className="num">
                      <input
                        className="fs-fare"
                        type="number"
                        min={0}
                        placeholder="0"
                        value={paiseToRupees(s.oneWayFare) || ''}
                        onChange={(e) => setFare(route.id, s.id, 'oneWayFare', e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
                {route.stops.length === 0 && (
                  <tr>
                    <td colSpan={3} className="muted" style={{ padding: 14 }}>No stops on this van.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {routes.length === 0 && (
        <div className="card-t">
          <div className="state">Add vans &amp; stops first.</div>
        </div>
      )}
      {error && <div className="state err">{error}</div>}
    </>
  );
}

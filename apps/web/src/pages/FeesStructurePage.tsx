import { useEffect, useRef, useState } from 'react';
import { formatMoney, paiseToRupees, rupeesToPaise, type FeePeriod, type PricingMode } from '@mentivax/core';
import type { FeeType, LandmarkFare, Student, TransportRoute } from '@mentivax/api-client';
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
const PRICING: { value: PricingMode; label: string; group: string }[] = [
  { value: 'COMMON', label: 'Common (same for all)', group: 'Academic' },
  { value: 'SPLIT', label: 'Split (new/old)', group: 'Academic' },
  { value: 'STOP', label: 'Transport · by stop', group: 'Transport' },
  { value: 'DISTANCE', label: 'Transport · by distance', group: 'Transport' },
  { value: 'FLAT', label: 'Transport · flat fare', group: 'Transport' },
];
const isTransportPricing = (m: PricingMode) => m === 'STOP' || m === 'DISTANCE' || m === 'FLAT';
const isoDay = (v?: string | null) => (v ?? '').slice(0, 10);
const todayIso = () => new Date().toISOString().slice(0, 10);

type FeeItem = FeeType & { _new?: boolean };

/**
 * Assign students to vehicles/stops. Vehicles, stops and fares are configured
 * in School Setup → Transport; this page is the day-to-day mapping in Fees.
 */
export function FeesStructurePage() {
  const { hasModule } = useApi();
  if (!hasModule('transport')) {
    return (
      <div className="success">
        <h2>Transport isn’t enabled</h2>
        <p>
          Enable the Transport module to assign students to vehicles. Vehicles, stops and fares are set
          up in <b>School Setup → Transport</b>.
        </p>
      </div>
    );
  }
  return <TransportStructure mode="mapping" />;
}

// ─── Academic: fee items (name · duration · pricing) ────────────────────────
export function AcademicFees() {
  const { api } = useApi();
  const toast = useToast();
  const feeTypes = useAsync(() => api.feeTypes.list(), []);
  const [items, setItems] = useState<FeeItem[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
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
      { id: `tmp-${tmp.current++}`, key: '', name: '', description: null, period: 'ONE_TIME', pricingMode: 'COMMON', periodCount: 1, dueDate: null, transportFlatAmount: 0, rank: xs.length, _new: true },
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
            transportFlatAmount: x.pricingMode === 'FLAT' ? x.transportFlatAmount : 0,
          };
          if (x._new) return api.feeTypes.create(body);
          const o = original.get(x.id);
          const changed =
            o &&
            (o.name !== x.name ||
              o.period !== x.period ||
              o.pricingMode !== x.pricingMode ||
              o.periodCount !== x.periodCount ||
              o.transportFlatAmount !== x.transportFlatAmount ||
              isoDay(o.dueDate) !== isoDay(x.dueDate));
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
          <h4>Fee items</h4>
          <div className="ph" style={{ margin: 0 }}>
            Define each fee once — its <b>name</b>, how often it’s charged, and how it’s priced. Academic
            fees get an amount per standard in <b>Fees → Fee structure</b>; <b>Transport</b> fees are priced
            by the student’s stop/distance (or a flat fare) from the Transport module.
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
            <col style={{ width: 118 }} />
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
                  <div className="fs-plan">
                    <select
                      className="fs-sel"
                      value={r.pricingMode}
                      onChange={(e) => patch(r.id, { pricingMode: e.target.value as PricingMode })}
                    >
                      {/* Only the fee's own category — an academic fee never offers
                          transport pricing (and vice versa). Change category in Edit. */}
                      {PRICING.filter((p) => p.group === (isTransportPricing(r.pricingMode) ? 'Transport' : 'Academic')).map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                    {r.pricingMode === 'FLAT' && (
                      <input
                        className="fs-date"
                        type="number"
                        min={0}
                        style={{ width: 110 }}
                        value={r.transportFlatAmount ? paiseToRupees(r.transportFlatAmount) : ''}
                        placeholder="₹ / month"
                        onChange={(e) => patch(r.id, { transportFlatAmount: rupeesToPaise(Number(e.target.value) || 0) })}
                      />
                    )}
                  </div>
                  {isTransportPricing(r.pricingMode) && r.pricingMode !== 'FLAT' && (
                    <div className="fs-hint">
                      Amount from Transport ({r.pricingMode === 'STOP' ? 'stop fares' : '₹/km × distance'})
                    </div>
                  )}
                </td>
                <td className="num">
                  <div className="rowacts">
                    <button className="btn sm grn" onClick={() => setEditId(r.id)}>
                      <Icon name="pencil" size={13} />
                      Edit
                    </button>
                    <button className="fs-del" title="Remove fee" onClick={() => removeItem(r)}>
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
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

      {editId && items.find((x) => x.id === editId) && (
        <AcademicFeeModal
          item={items.find((x) => x.id === editId)!}
          onClose={() => setEditId(null)}
          onSave={(fields) => {
            patch(editId, fields);
            setEditId(null);
          }}
        />
      )}
    </>
  );
}

/** Edit one academic fee item's name, duration, and pricing. */
function AcademicFeeModal({
  item,
  onClose,
  onSave,
}: {
  item: FeeItem;
  onClose: () => void;
  onSave: (fields: Partial<FeeItem>) => void;
}) {
  const [name, setName] = useState(item.name);
  const [period, setPeriod] = useState<FeePeriod>(item.period);
  const [count, setCount] = useState(item.periodCount);
  const [dueDate, setDueDate] = useState(isoDay(item.dueDate) || todayIso());
  const [pricingMode, setPricingMode] = useState<PricingMode>(item.pricingMode);

  const save = () => {
    const periodCount = period === 'TERM' ? Math.min(3, Math.max(1, count)) : period === 'MONTHLY' ? Math.max(1, count) : 1;
    onSave({
      name: name.trim() || item.name,
      period,
      periodCount,
      dueDate: period === 'DUE_DATE' ? dueDate || todayIso() : null,
      pricingMode,
    });
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: '94%' }}>
        <div className="mh">
          <div>
            <b>Edit fee item</b>
            <span>Name, how often it’s charged, and pricing.</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb">
          <div className="fld">
            <label>Fee name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tuition Fee" />
          </div>
          <div className="frow" style={{ gridTemplateColumns: period === 'TERM' || period === 'MONTHLY' ? '1fr 110px' : '1fr' }}>
            <div className="fld">
              <label>Duration</label>
              <select value={period} onChange={(e) => setPeriod(e.target.value as FeePeriod)}>
                {DURATIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            {(period === 'TERM' || period === 'MONTHLY') && (
              <div className="fld">
                <label>{period === 'TERM' ? 'Terms' : 'Months'}</label>
                <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                  {(period === 'TERM' ? TERM_COUNTS : MONTH_COUNTS).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {period === 'DUE_DATE' && (
            <div className="fld">
              <label>Due date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          )}
          <div className="fld">
            <label>Pricing</label>
            <select value={pricingMode} onChange={(e) => setPricingMode(e.target.value as PricingMode)}>
              <optgroup label="Academic">
                {PRICING.filter((p) => p.group === 'Academic').map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </optgroup>
              <optgroup label="Transport">
                {PRICING.filter((p) => p.group === 'Transport').map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </optgroup>
            </select>
            <span className="muted" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
              Pick <b>Transport</b> pricing to make this a transport fee head (priced from the Transport module).
            </span>
          </div>
          <div className="alloc-note">Changes apply on “Save fee items”.</div>
        </div>
        <div className="mf">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn grn" onClick={save}>Apply</button>
        </div>
      </div>
    </div>
  );
}

// ─── Transport: 4 sub-tabs (vans · stops · student mapping · fares) ─────────
/**
 * Transport UI in two modes:
 *  - `setup`   → vehicles, areas/stops and fares (configured in School Setup)
 *  - `mapping` → assign students to vehicles/stops (in Fees & collections)
 */
export function TransportStructure({ mode = 'setup' }: { mode?: 'setup' | 'mapping' }) {
  const [sub, setSub] = useState<'vans' | 'stops' | 'fees'>('vans');
  if (mode === 'mapping') return <VanStudentMapping />;
  const TABS: { key: typeof sub; label: string }[] = [
    { key: 'vans', label: 'Van details' },
    { key: 'stops', label: 'Area details' },
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
  const [rVid, setRVid] = useState('');
  const [rVeh, setRVeh] = useState('');
  const [rType, setRType] = useState<'BUS' | 'VAN'>('VAN');
  const [editVan, setEditVan] = useState<TransportRoute | null>(null);

  const add = async () => {
    const id = rVid.trim();
    const num = rVeh.trim();
    if (!id || !num) return setAdding(false);
    // "Vehicle ID" is stored as the route name; vehicle number is the reg. plate.
    await guard(() => api.transport.routes.create({ name: id, vehicleNumber: num, vehicleType: rType }));
    setRVid('');
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
            <label>Vehicle ID</label>
            <input value={rVid} autoFocus placeholder="e.g. VAN-01" onChange={(e) => setRVid(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          </div>
          <div className="fld">
            <label>Vehicle number</label>
            <input value={rVeh} placeholder="e.g. TN-01-AB-1234" onChange={(e) => setRVeh(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          </div>
          <div className="fld">
            <label>Type</label>
            <select value={rType} onChange={(e) => setRType(e.target.value as 'BUS' | 'VAN')}>
              <option value="VAN">Van</option>
              <option value="BUS">Bus</option>
            </select>
          </div>
          <button className="btn grn" onClick={add}>Add</button>
          <button className="btn" onClick={() => { setAdding(false); setRVid(''); setRVeh(''); }}>Cancel</button>
        </div>
      )}

      <div className="card-t" style={{ overflowX: 'auto' }}>
        <table className="van-tbl">
          <thead>
            <tr>
              <th style={{ width: 46 }} />
              <th style={{ width: 120 }}>Vehicle ID</th>
              <th>Vehicle number</th>
              <th style={{ width: 130 }}>Type</th>
              <th className="num" style={{ width: 90 }}>Areas</th>
              <th className="num" style={{ width: 120 }} />
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className={`van-ic${r.vehicleType === 'BUS' ? ' bus' : ''}`}>
                    <Icon name="bus" size={16} />
                  </span>
                </td>
                <td>
                  <input
                    className="cell-input"
                    style={{ maxWidth: 96 }}
                    value={r.name}
                    onChange={(e) => setRoutes((rs) => rs.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))}
                    onBlur={() => guard(() => api.transport.routes.update(r.id, { name: r.name.trim() }))}
                  />
                </td>
                <td>
                  <input
                    className="cell-input"
                    style={{ maxWidth: 220 }}
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
                <td className="num">
                  <span className="count-pill">{r.stops.length} {r.stops.length === 1 ? 'area' : 'areas'}</span>
                </td>
                <td className="num">
                  <div className="rowacts">
                    <button className="btn sm grn" onClick={() => setEditVan(r)}>
                      <Icon name="pencil" size={13} />
                      Edit
                    </button>
                    <button className="fs-del" title="Delete van" onClick={() => guard(() => api.transport.routes.remove(r.id))}>
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {routes.length === 0 && (
              <tr>
                <td colSpan={6} className="muted" style={{ padding: 22, textAlign: 'center' }}>No vans yet — add your first van above.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {error && <div className="state err">{error}</div>}

      {editVan && (
        <VanEditModal
          van={editVan}
          onClose={() => setEditVan(null)}
          onSave={async (patch) => {
            await guard(() => api.transport.routes.update(editVan.id, patch));
            setEditVan(null);
          }}
        />
      )}
    </>
  );
}

/** Edit a van's Vehicle ID, number, and type. */
function VanEditModal({
  van,
  onClose,
  onSave,
}: {
  van: TransportRoute;
  onClose: () => void;
  onSave: (patch: { name: string; vehicleNumber: string; vehicleType: 'BUS' | 'VAN' }) => Promise<void>;
}) {
  const [vid, setVid] = useState(van.name);
  const [num, setNum] = useState(van.vehicleNumber);
  const [type, setType] = useState<'BUS' | 'VAN'>(van.vehicleType);
  const [busy, setBusy] = useState(false);
  const valid = vid.trim().length > 0 && num.trim().length > 0;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await onSave({ name: vid.trim(), vehicleNumber: num.trim(), vehicleType: type });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, width: '94%' }}>
        <div className="mh">
          <div>
            <b>Edit van</b>
            <span>Vehicle ID, number, and type.</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb">
          <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="fld">
              <label>Vehicle ID</label>
              <input value={vid} onChange={(e) => setVid(e.target.value)} placeholder="e.g. VAN-01" />
            </div>
            <div className="fld">
              <label>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as 'BUS' | 'VAN')}>
                <option value="VAN">Van</option>
                <option value="BUS">Bus</option>
              </select>
            </div>
          </div>
          <div className="fld">
            <label>Vehicle number</label>
            <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="e.g. TN-01-AB-1234" />
          </div>
        </div>
        <div className="mf">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn grn" disabled={!valid || busy} onClick={save}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// 2 ─ Stop details (name · times · landmark · order · fares, per van) ────────
function StopDetails() {
  const { api, routes, setRoutes, guard, error } = useRoutes();
  const students = useAsync(() => api.students.list({}), []);
  const [stopName, setStopName] = useState<Record<string, string>>({});
  const [editArea, setEditArea] = useState<TransportRoute['stops'][number] | null>(null);
  const [vanId, setVanId] = useState('');
  useEffect(() => {
    if (routes.length && !routes.some((r) => r.id === vanId)) setVanId(routes[0]!.id);
  }, [routes, vanId]);

  const patchStop = (stopId: string, p: Partial<TransportRoute['stops'][number]>) =>
    setRoutes((rs) => rs.map((r) => ({ ...r, stops: r.stops.map((s) => (s.id === stopId ? { ...s, ...p } : s)) })));

  const saveLandmarks = (stopId: string, lms: LandmarkFare[]) =>
    guard(() =>
      api.transport.stops.update(stopId, {
        landmarks: lms.map((l) => ({ ...l, name: l.name.trim() })).filter((l) => l.name),
      }),
    );

  // How many students board at a given stop + landmark name.
  const lmCount = (stopId: string, name: string) =>
    (students.data ?? []).filter((s) => s.transportStopId === stopId && s.transportLandmark === name.trim()).length;

  const addStop = async (routeId: string) => {
    const name = (stopName[routeId] ?? '').trim();
    if (!name) return;
    await guard(() => api.transport.stops.create({ routeId, name, bothWayFare: 0, oneWayFare: 0 }));
    setStopName((s) => ({ ...s, [routeId]: '' }));
  };

  const moveStop = async (route: TransportRoute, idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    const a = route.stops[idx];
    const b = route.stops[j];
    if (!a || !b) return;
    await api.transport.stops.update(a.id, { rank: b.rank });
    await guard(() => api.transport.stops.update(b.id, { rank: a.rank }));
  };

  return (
    <>
      <div className="panel fs-head">
        <div>
          <h4>Area details</h4>
          <div className="ph" style={{ margin: 0 }}>
            Boarding areas per van — pickup / drop time, landmark, and order.
          </div>
        </div>
        <div className="sp" style={{ flex: 1 }} />
        {routes.length > 0 && (
          <select className="fs-sel van-select" value={vanId} onChange={(e) => setVanId(e.target.value)}>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>{r.name} · {r.vehicleNumber}</option>
            ))}
          </select>
        )}
      </div>

      {routes.filter((r) => r.id === vanId).map((route) => (
        <div key={route.id} className="panel" style={{ marginBottom: 14 }}>
          <div className="van-banner">
            <span className={`van-ic${route.vehicleType === 'BUS' ? ' bus' : ''}`}>
              <Icon name="bus" size={17} />
            </span>
            <div>
              <div className="van-banner-num">{route.vehicleNumber}</div>
              <div className="van-banner-sub">
                Vehicle ID {route.name} · {route.vehicleType === 'VAN' ? 'Van' : 'Bus'}
              </div>
            </div>
          </div>
          <div className="card-t" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 56 }}>Order</th>
                  <th>Area</th>
                  <th>Pickup</th>
                  <th>Drop</th>
                  <th>Landmarks (₹ set under Fee structure)</th>
                  <th className="num" />
                </tr>
              </thead>
              <tbody>
                {route.stops.map((stop, idx) => (
                  <tr key={stop.id}>
                    <td>
                      <div className="stop-ord">
                        <button disabled={idx === 0} title="Move up" onClick={() => moveStop(route, idx, -1)}>
                          <Icon name="chevron" size={13} style={{ transform: 'rotate(180deg)' }} />
                        </button>
                        <button disabled={idx === route.stops.length - 1} title="Move down" onClick={() => moveStop(route, idx, 1)}>
                          <Icon name="chevron" size={13} />
                        </button>
                      </div>
                    </td>
                    <td>
                      <input
                        className="fs-name"
                        style={{ maxWidth: 200 }}
                        value={stop.name}
                        onChange={(e) => patchStop(stop.id, { name: e.target.value })}
                        onBlur={() => guard(() => api.transport.stops.update(stop.id, { name: stop.name.trim() }))}
                      />
                    </td>
                    <td>
                      <input
                        className="fs-time"
                        type="time"
                        value={stop.pickupTime ?? ''}
                        onChange={(e) => {
                          const v = e.target.value || null;
                          patchStop(stop.id, { pickupTime: v });
                          guard(() => api.transport.stops.update(stop.id, { pickupTime: v }));
                          e.currentTarget.blur();
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="fs-time"
                        type="time"
                        value={stop.dropTime ?? ''}
                        onChange={(e) => {
                          const v = e.target.value || null;
                          patchStop(stop.id, { dropTime: v });
                          guard(() => api.transport.stops.update(stop.id, { dropTime: v }));
                          e.currentTarget.blur();
                        }}
                      />
                    </td>
                    <td>
                      <div className="lm-list">
                        {(stop.landmarks ?? []).map((lm, i) => (
                          <div className="lm-item" key={i}>
                            <input
                              className="fs-name"
                              style={{ maxWidth: 200 }}
                              placeholder="e.g. Vinayagar temple"
                              value={lm.name}
                              onChange={(e) =>
                                patchStop(stop.id, {
                                  landmarks: (stop.landmarks ?? []).map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)),
                                })
                              }
                              onBlur={() => saveLandmarks(stop.id, stop.landmarks ?? [])}
                            />
                            {lm.name.trim() !== '' && (
                              <span className="lm-count" title="Students at this landmark">
                                <Icon name="users" size={11} />
                                {lmCount(stop.id, lm.name)}
                              </span>
                            )}
                            <button
                              className="lm-x"
                              title="Remove landmark"
                              onClick={() => saveLandmarks(stop.id, (stop.landmarks ?? []).filter((_, xi) => xi !== i))}
                            >
                              <Icon name="x" size={12} />
                            </button>
                          </div>
                        ))}
                        <button
                          className="lm-add"
                          onClick={() =>
                            patchStop(stop.id, { landmarks: [...(stop.landmarks ?? []), { name: '', bothWayFare: 0, oneWayFare: 0 }] })
                          }
                        >
                          <Icon name="plus" size={12} /> Landmark
                        </button>
                      </div>
                    </td>
                    <td className="num">
                      <div className="rowacts">
                        <button className="btn sm grn" onClick={() => setEditArea(stop)}>
                          <Icon name="pencil" size={13} />
                          Edit
                        </button>
                        <button className="fs-del" title="Delete area" onClick={() => guard(() => api.transport.stops.remove(stop.id))}>
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {route.stops.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ padding: 14 }}>No areas yet — add one below.</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, padding: '10px 14px' }}>
              <input
                className="fs-name"
                style={{ maxWidth: 240 }}
                placeholder="Add an area…"
                value={stopName[route.id] ?? ''}
                onChange={(e) => setStopName((s) => ({ ...s, [route.id]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && addStop(route.id)}
              />
              <button className="fs-add" style={{ width: 'auto', padding: '0 12px' }} onClick={() => addStop(route.id)}>
                <Icon name="plus" size={13} /> Add area
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

      {editArea && (
        <AreaEditModal
          area={editArea}
          onClose={() => setEditArea(null)}
          onSave={async (patch) => {
            await guard(() => api.transport.stops.update(editArea.id, patch));
            setEditArea(null);
          }}
        />
      )}
    </>
  );
}

/** Edit an area's name, pickup/drop times, and landmarks. */
function AreaEditModal({
  area,
  onClose,
  onSave,
}: {
  area: TransportRoute['stops'][number];
  onClose: () => void;
  onSave: (patch: { name: string; pickupTime: string | null; dropTime: string | null; landmarks: LandmarkFare[] }) => Promise<void>;
}) {
  const [name, setName] = useState(area.name);
  const [pickup, setPickup] = useState(area.pickupTime ?? '');
  const [drop, setDrop] = useState(area.dropTime ?? '');
  const [landmarks, setLandmarks] = useState<LandmarkFare[]>(area.landmarks ?? []);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSave({
        name: name.trim(),
        pickupTime: pickup || null,
        dropTime: drop || null,
        landmarks: landmarks.map((l) => ({ ...l, name: l.name.trim() })).filter((l) => l.name),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, width: '94%' }}>
        <div className="mh">
          <div>
            <b>Edit area</b>
            <span>Name, pickup / drop times, and landmarks.</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb">
          <div className="fld">
            <label>Area name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Anthiyur" />
          </div>
          <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="fld">
              <label>Pickup time</label>
              <input type="time" value={pickup} onChange={(e) => setPickup(e.target.value)} />
            </div>
            <div className="fld">
              <label>Drop time</label>
              <input type="time" value={drop} onChange={(e) => setDrop(e.target.value)} />
            </div>
          </div>
          <div className="fld">
            <label>Landmarks</label>
            <div className="lm-list" style={{ gap: 7 }}>
              {landmarks.map((lm, i) => (
                <div className="lm-item" key={i} style={{ width: '100%' }}>
                  <input
                    className="fs-name"
                    style={{ flex: 1, maxWidth: 'none' }}
                    placeholder="e.g. Vinayagar temple"
                    value={lm.name}
                    onChange={(e) => setLandmarks((ls) => ls.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)))}
                  />
                  <button className="lm-x" title="Remove" onClick={() => setLandmarks((ls) => ls.filter((_, xi) => xi !== i))}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
              <button
                className="lm-add"
                onClick={() => setLandmarks((ls) => [...ls, { name: '', bothWayFare: 0, oneWayFare: 0 }])}
              >
                <Icon name="plus" size={12} /> Landmark
              </button>
            </div>
          </div>
          <div className="alloc-note">Landmark fares / distances are kept — set them under Fee structure.</div>
        </div>
        <div className="mf">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn grn" disabled={!name.trim() || busy} onClick={save}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
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

  const [editMap, setEditMap] = useState<Student | null>(null);
  const [addStudentId, setAddStudentId] = useState('');
  const [addStopId, setAddStopId] = useState('');
  const [addShift, setAddShift] = useState<ShiftValue>('BOTH');
  const [addLandmark, setAddLandmark] = useState('');
  const [pickerKey, setPickerKey] = useState(0);
  useEffect(() => setAddStopId(van?.stops[0]?.id ?? ''), [vanId, van?.stops.length]);
  useEffect(() => setAddLandmark(''), [addStopId]);
  const selectedStop = van?.stops.find((s) => s.id === addStopId);

  const stopName = (id: string | null) => van?.stops.find((s) => s.id === id)?.name ?? '—';

  const assign = async () => {
    if (!addStudentId || !addStopId) return;
    try {
      await api.students.assignTransport(addStudentId, {
        transportStopId: addStopId,
        transportShift: addShift,
        transportLandmark: addLandmark || null,
      });
      setAddStudentId('');
      setPickerKey((k) => k + 1); // remount the picker so its text field clears
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
          <div className="ph" style={{ margin: 0 }}>Map students to a van’s area and shift.</div>
        </div>
        <div className="sp" style={{ flex: 1 }} />
        {routes.length > 0 && (
          <select className="fs-sel van-select" value={vanId} onChange={(e) => setVanId(e.target.value)}>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>{r.name} · {r.vehicleNumber}</option>
            ))}
          </select>
        )}
      </div>

      {van && van.stops.length > 0 ? (
        <>
          <div className="panel" style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="fld" style={{ flex: 1, minWidth: 220 }}>
              <label>Student</label>
              <StudentPicker key={pickerKey} students={students.data ?? []} value={addStudentId} onChange={setAddStudentId} />
            </div>
            <div className="fld">
              <label>Area</label>
              <select value={addStopId} onChange={(e) => setAddStopId(e.target.value)}>
                {van.stops.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            {(selectedStop?.landmarks?.length ?? 0) > 0 && (
              <div className="fld">
                <label>Landmark</label>
                <select value={addLandmark} onChange={(e) => setAddLandmark(e.target.value)}>
                  <option value="">— none —</option>
                  {selectedStop!.landmarks.map((lm) => (
                    <option key={lm.name} value={lm.name}>{lm.name}</option>
                  ))}
                </select>
              </div>
            )}
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
                  <th>Area</th>
                  <th>Landmark</th>
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
                    <td>{s.transportLandmark || <span className="muted">—</span>}</td>
                    <td>{SHIFTS.find((x) => x.value === s.transportShift)?.label ?? '—'}</td>
                    <td className="num">
                      <div className="rowacts">
                        <button className="btn sm grn" onClick={() => setEditMap(s)}>
                          <Icon name="pencil" size={13} />
                          Edit
                        </button>
                        <button className="fs-del" title="Remove from van" onClick={() => unassign(s)}>
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {mapped.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ padding: 18 }}>No students mapped to this van yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="card-t">
          <div className="state">
            {routes.length === 0 ? 'Add vans first under “Van details”.' : 'Add areas to this van first under “Area details”.'}
          </div>
        </div>
      )}

      {editMap && van && (
        <MappingEditModal
          student={editMap}
          van={van}
          onClose={() => setEditMap(null)}
          onSave={async (patch) => {
            try {
              await api.students.assignTransport(editMap.id, patch);
              students.reload();
              toast(`${editMap.name} updated`);
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Could not update');
            }
            setEditMap(null);
          }}
        />
      )}
    </>
  );
}

/** Edit a mapped student's area, landmark, and shift within a van. */
function MappingEditModal({
  student,
  van,
  onClose,
  onSave,
}: {
  student: Student;
  van: TransportRoute;
  onClose: () => void;
  onSave: (patch: { transportStopId: string; transportShift: ShiftValue; transportLandmark: string | null }) => Promise<void>;
}) {
  const [stopId, setStopId] = useState(student.transportStopId ?? van.stops[0]?.id ?? '');
  const [landmark, setLandmark] = useState(student.transportLandmark ?? '');
  const [shift, setShift] = useState<ShiftValue>((student.transportShift as ShiftValue) ?? 'BOTH');
  const [busy, setBusy] = useState(false);

  const selectedStop = van.stops.find((s) => s.id === stopId);

  const save = async () => {
    if (!stopId) return;
    setBusy(true);
    try {
      await onSave({ transportStopId: stopId, transportShift: shift, transportLandmark: landmark || null });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, width: '94%' }}>
        <div className="mh">
          <div>
            <b>Edit mapping · {student.name}</b>
            <span>{van.name} · {van.vehicleNumber}</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb">
          <div className="fld">
            <label>Area</label>
            <select
              value={stopId}
              onChange={(e) => {
                setStopId(e.target.value);
                setLandmark('');
              }}
            >
              {van.stops.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {(selectedStop?.landmarks?.length ?? 0) > 0 && (
            <div className="fld">
              <label>Landmark</label>
              <select value={landmark} onChange={(e) => setLandmark(e.target.value)}>
                <option value="">— none —</option>
                {selectedStop!.landmarks.map((lm) => (
                  <option key={lm.name} value={lm.name}>{lm.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="fld">
            <label>Shift</label>
            <select value={shift} onChange={(e) => setShift(e.target.value as ShiftValue)}>
              {SHIFTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mf">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn grn" disabled={!stopId || busy} onClick={save}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// 4 ─ Transport fee structure (per-landmark, by stop or by distance) ────────
function TransportFees() {
  const { api, routes, setRoutes, guard, error } = useRoutes();
  const toast = useToast();
  const [vanId, setVanId] = useState('');
  useEffect(() => {
    if (routes.length && !routes.some((r) => r.id === vanId)) setVanId(routes[0]!.id);
  }, [routes, vanId]);

  // Org-wide fee basis + per-km rates (rupees in local state).
  const settingsA = useAsync(() => api.transport.settings.get(), []);
  const [basis, setBasis] = useState<'STOP' | 'DISTANCE'>('STOP');
  const [rateBoth, setRateBoth] = useState(0);
  const [rateOne, setRateOne] = useState(0);
  useEffect(() => {
    if (!settingsA.data) return;
    setBasis(settingsA.data.fareBasis);
    setRateBoth(paiseToRupees(settingsA.data.ratePerKmBoth));
    setRateOne(paiseToRupees(settingsA.data.ratePerKmOne));
  }, [settingsA.data]);

  const saveSettings = (next: { basis?: 'STOP' | 'DISTANCE'; rateBoth?: number; rateOne?: number }) => {
    api.transport.settings
      .update({
        fareBasis: next.basis ?? basis,
        ratePerKmBoth: rupeesToPaise(next.rateBoth ?? rateBoth),
        ratePerKmOne: rupeesToPaise(next.rateOne ?? rateOne),
      })
      .catch((e) => toast(e instanceof Error ? e.message : 'Could not save settings'));
  };

  const patchLandmark = (stopId: string, lmIdx: number, p: Partial<LandmarkFare>) =>
    setRoutes((rs) =>
      rs.map((r) => ({
        ...r,
        stops: r.stops.map((s) =>
          s.id === stopId ? { ...s, landmarks: s.landmarks.map((l, i) => (i === lmIdx ? { ...l, ...p } : l)) } : s,
        ),
      })),
    );
  const saveStopFares = (stopId: string, landmarks: LandmarkFare[]) =>
    guard(() => api.transport.stops.update(stopId, { landmarks }));

  const byDistance = basis === 'DISTANCE';
  const calc = (km: number | null | undefined, ratePaise: number) => Math.round((km ?? 0) * ratePaise);

  // Per-row Edit modal (name · distance · fares of one landmark).
  const [editLm, setEditLm] = useState<{ stopId: string; index: number } | null>(null);
  const editStop = editLm ? routes.flatMap((r) => r.stops).find((s) => s.id === editLm.stopId) : undefined;
  const editLandmark = editStop && editLm ? editStop.landmarks[editLm.index] : undefined;

  const saveLandmarkEdit = async (patch: Partial<LandmarkFare>) => {
    if (!editLm || !editStop) return;
    const landmarks = editStop.landmarks.map((l, i) => (i === editLm.index ? { ...l, ...patch } : l));
    await guard(() => api.transport.stops.update(editLm.stopId, { landmarks }));
    setEditLm(null);
  };

  return (
    <>
      <div className="panel fs-head">
        <div>
          <h4>Transport fee structure</h4>
          <div className="ph" style={{ margin: 0 }}>
            Fare per <b>landmark</b> (₹) — set a fixed fare per area, or derive it from distance.
          </div>
        </div>
        <div className="sp" style={{ flex: 1 }} />
        {routes.length > 0 && (
          <select className="fs-sel van-select" value={vanId} onChange={(e) => setVanId(e.target.value)}>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>{r.name} · {r.vehicleNumber}</option>
            ))}
          </select>
        )}
      </div>

      {/* Fee basis (applies to all vans) */}
      <div className="panel" style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="fld">
          <label>Fee basis</label>
          <select
            value={basis}
            onChange={(e) => {
              const b = e.target.value as 'STOP' | 'DISTANCE';
              setBasis(b);
              saveSettings({ basis: b });
            }}
          >
            <option value="STOP">By area — fixed fare per landmark</option>
            <option value="DISTANCE">By distance — ₹/km × distance</option>
          </select>
        </div>
        {byDistance && (
          <>
            <div className="fld">
              <label>Both-way rate (₹ / km)</label>
              <input
                type="number"
                min={0}
                placeholder="0"
                value={rateBoth || ''}
                onChange={(e) => setRateBoth(Number(e.target.value) || 0)}
                onBlur={() => saveSettings({})}
              />
            </div>
            <div className="fld">
              <label>One-way rate (₹ / km)</label>
              <input
                type="number"
                min={0}
                placeholder="0"
                value={rateOne || ''}
                onChange={(e) => setRateOne(Number(e.target.value) || 0)}
                onBlur={() => saveSettings({})}
              />
            </div>
          </>
        )}
      </div>

      {routes.filter((r) => r.id === vanId).map((route) => (
        <div key={route.id} className="panel" style={{ marginBottom: 14 }}>
          <div className="van-banner">
            <span className={`van-ic${route.vehicleType === 'BUS' ? ' bus' : ''}`}>
              <Icon name="bus" size={17} />
            </span>
            <div>
              <div className="van-banner-num">{route.vehicleNumber}</div>
              <div className="van-banner-sub">
                Vehicle ID {route.name} · {route.vehicleType === 'VAN' ? 'Van' : 'Bus'}
              </div>
            </div>
          </div>
          <div className="card-t" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Landmark</th>
                  {byDistance && <th className="num">Distance (km)</th>}
                  <th className="num">Both-way (₹)</th>
                  <th className="num">One-way (₹)</th>
                  <th className="num" style={{ width: 64 }} />
                </tr>
              </thead>
              <tbody>
                {route.stops.flatMap((stop) =>
                  stop.landmarks.length === 0
                    ? [
                        <tr key={stop.id}>
                          <td><b style={{ fontWeight: 600 }}>{stop.name}</b></td>
                          <td colSpan={byDistance ? 5 : 4} className="muted">Add landmarks under Area details.</td>
                        </tr>,
                      ]
                    : stop.landmarks.map((lm, i) => (
                        <tr key={`${stop.id}-${i}`}>
                          <td>{i === 0 ? <b style={{ fontWeight: 600 }}>{stop.name}</b> : ''}</td>
                          <td>{lm.name || <span className="muted">Unnamed</span>}</td>
                          {byDistance ? (
                            <>
                              <td className="num">
                                <input
                                  className="fs-fare"
                                  type="number"
                                  min={0}
                                  step={0.1}
                                  placeholder="0"
                                  value={lm.distanceKm || ''}
                                  onChange={(e) => patchLandmark(stop.id, i, { distanceKm: Number(e.target.value) || 0 })}
                                  onBlur={() => saveStopFares(stop.id, stop.landmarks)}
                                />
                              </td>
                              <td className="num">{formatMoney(calc(lm.distanceKm, rupeesToPaise(rateBoth)))}</td>
                              <td className="num">{formatMoney(calc(lm.distanceKm, rupeesToPaise(rateOne)))}</td>
                            </>
                          ) : (
                            <>
                              <td className="num">
                                <input
                                  className="fs-fare"
                                  type="number"
                                  min={0}
                                  placeholder="0"
                                  value={paiseToRupees(lm.bothWayFare) || ''}
                                  onChange={(e) => patchLandmark(stop.id, i, { bothWayFare: rupeesToPaise(Number(e.target.value) || 0) })}
                                  onBlur={() => saveStopFares(stop.id, stop.landmarks)}
                                />
                              </td>
                              <td className="num">
                                <input
                                  className="fs-fare"
                                  type="number"
                                  min={0}
                                  placeholder="0"
                                  value={paiseToRupees(lm.oneWayFare) || ''}
                                  onChange={(e) => patchLandmark(stop.id, i, { oneWayFare: rupeesToPaise(Number(e.target.value) || 0) })}
                                  onBlur={() => saveStopFares(stop.id, stop.landmarks)}
                                />
                              </td>
                            </>
                          )}
                          <td className="num">
                            <button
                              className="btn sm grn"
                              onClick={() => setEditLm({ stopId: stop.id, index: i })}
                            >
                              <Icon name="pencil" size={13} />
                              Edit
                            </button>
                          </td>
                        </tr>
                      )),
                )}
                {route.stops.length === 0 && (
                  <tr>
                    <td colSpan={byDistance ? 6 : 5} className="muted" style={{ padding: 14 }}>No areas on this van.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {routes.length === 0 && (
        <div className="card-t">
          <div className="state">Add vans &amp; areas first.</div>
        </div>
      )}
      {error && <div className="state err">{error}</div>}

      {editLandmark && editStop && (
        <LandmarkFeeModal
          landmark={editLandmark}
          areaName={editStop.name}
          byDistance={byDistance}
          rateBoth={rateBoth}
          rateOne={rateOne}
          onClose={() => setEditLm(null)}
          onSave={saveLandmarkEdit}
        />
      )}
    </>
  );
}

/** Edit one landmark's fee data (name · distance · both-way / one-way fares). */
function LandmarkFeeModal({
  landmark,
  areaName,
  byDistance,
  rateBoth,
  rateOne,
  onClose,
  onSave,
}: {
  landmark: LandmarkFare;
  areaName: string;
  byDistance: boolean;
  rateBoth: number;
  rateOne: number;
  onClose: () => void;
  onSave: (patch: Partial<LandmarkFare>) => Promise<void>;
}) {
  const [name, setName] = useState(landmark.name);
  const [distance, setDistance] = useState(landmark.distanceKm ?? 0);
  const [both, setBoth] = useState(paiseToRupees(landmark.bothWayFare));
  const [one, setOne] = useState(paiseToRupees(landmark.oneWayFare));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await onSave({
        name: name.trim() || landmark.name,
        distanceKm: distance || null,
        bothWayFare: rupeesToPaise(both),
        oneWayFare: rupeesToPaise(one),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: '94%' }}>
        <div className="mh">
          <div>
            <b>Edit landmark</b>
            <span>{areaName} · fee details</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb">
          <div className="fld">
            <label>Landmark name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="fld">
            <label>Distance (km)</label>
            <input
              type="number"
              min={0}
              step={0.1}
              placeholder="0"
              value={distance || ''}
              onChange={(e) => setDistance(Number(e.target.value) || 0)}
            />
          </div>
          {byDistance ? (
            <div className="alloc-sums" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="alloc-sum">
                <span>Both-way (auto)</span>
                <b>{formatMoney(Math.round(distance * rupeesToPaise(rateBoth)))}</b>
              </div>
              <div className="alloc-sum">
                <span>One-way (auto)</span>
                <b>{formatMoney(Math.round(distance * rupeesToPaise(rateOne)))}</b>
              </div>
            </div>
          ) : (
            <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="fld">
                <label>Both-way (₹)</label>
                <input type="number" min={0} placeholder="0" value={both || ''} onChange={(e) => setBoth(Number(e.target.value) || 0)} />
              </div>
              <div className="fld">
                <label>One-way (₹)</label>
                <input type="number" min={0} placeholder="0" value={one || ''} onChange={(e) => setOne(Number(e.target.value) || 0)} />
              </div>
            </div>
          )}
          {byDistance && (
            <div className="alloc-note">Fares are computed from distance × the per-km rate.</div>
          )}
        </div>
        <div className="mf">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn grn" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

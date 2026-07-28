import { useEffect, useState } from 'react';
import { formatMoney, rupeesToPaise, type DiscountType, type TransportShift } from '@mentivax/core';
import type { Student, SchoolClass } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { Pagination, usePager } from '../components/Pagination';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

const SHIFTS: { value: TransportShift; label: string }[] = [
  { value: 'BOTH', label: 'Both ways' },
  { value: 'MORNING', label: 'Morning only' },
  { value: 'EVENING', label: 'Evening only' },
];

const FILTERS = [
  { f: 'all', label: 'All' },
  { f: 'due', label: 'Pending' },
  { f: 'part', label: 'Partial' },
  { f: 'paid', label: 'Paid' },
];

const STATUS_TAG: Record<Student['status'], { cls: string; label: string }> = {
  paid: { cls: 'paid', label: 'Paid' },
  part: { cls: 'part', label: 'Partial' },
  due: { cls: 'due', label: 'Pending' },
};

export function StudentsPage() {
  const { api } = useApi();
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  // Class-wise view: one standard at a time (plus an "All classes" option).
  const classes = useAsync(() => api.classes.list(), []);
  const [classId, setClassId] = useState<string | 'all' | null>(null);
  useEffect(() => {
    if (classId === null && classes.data?.[0]) setClassId(classes.data[0].id);
  }, [classes.data, classId]);

  const { data, loading, error, reload } = useAsync(
    () =>
      api.students.list({
        classId: classId && classId !== 'all' ? classId : undefined,
        status: filter,
        search,
      }),
    [classId, filter, search],
  );
  const pager = usePager(data ?? []);
  const classList = classes.data ?? [];
  const totalStudents = classList.reduce((n, c) => n + (c.studentCount ?? 0), 0);

  return (
    <>
      <div className="tbar">
        <div className="search">
          <Icon name="search" />
          <input
            placeholder="Search name, parent, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="seg">
          {FILTERS.map((f) => (
            <button key={f.f} className={filter === f.f ? 'on' : ''} onClick={() => setFilter(f.f)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="sp" />
        <button className="btn" onClick={() => toast('Excel importer — drop your sheet, columns map themselves')}>
          <Icon name="import" size={15} />
          Import
        </button>
        <button className="btn grn" onClick={() => setAddOpen(true)}>
          <Icon name="plus" size={15} />
          Add student
        </button>
      </div>

      <div className="fs-layout">
        <div className="classlist">
          <button
            className={`cli${classId === 'all' ? ' on' : ''}`}
            onClick={() => setClassId('all')}
          >
            All classes
            <span className="n">{totalStudents}</span>
          </button>
          {classList.map((c) => (
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

        <div className="card-t" style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Class</th>
              <th className="num">Annual fee</th>
              <th className="num">Paid</th>
              <th className="num">Pending</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pager.pageItems.map((s) => {
              const tag = STATUS_TAG[s.status];
              return (
                <tr key={s.id}>
                  <td>
                    <div className="stu-cell">
                      <span className="av">{s.name[0]}</span>
                      <div className="sm">
                        <b>{s.name}</b>
                        <span>{s.parentName ?? s.phone ?? '—'}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="cls">{s.className}</span>
                  </td>
                  <td className="num">{formatMoney(s.annualFee)}</td>
                  <td className="num">{formatMoney(s.paid)}</td>
                  <td className={`num${s.pending > 0 ? ' pending-red' : ' muted'}`}>
                    {formatMoney(s.pending)}
                  </td>
                  <td>
                    <span className={`tag ${tag.cls}`}>
                      <i />
                      {tag.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading && <div className="state">Loading students…</div>}
        {error && <div className="state err">{error}</div>}
        {!loading && !error && (data?.length ?? 0) === 0 && (
          <div className="state">No students match this filter.</div>
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

      {addOpen && (
        <AddStudentModal
          onClose={() => setAddOpen(false)}
          onSaved={(name) => {
            setAddOpen(false);
            reload();
            toast(`${name} admitted — fee plan auto-assigned by class`);
          }}
        />
      )}
    </>
  );
}

function AddStudentModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const { api, hasModule } = useApi();
  const classes = useAsync(() => api.classes.list(), []);
  const transportOn = hasModule('transport');
  const routes = useAsync(() => (transportOn ? api.transport.routes.list() : Promise.resolve([])), []);
  const [name, setName] = useState('');
  const [classId, setClassId] = useState('');
  const [parentName, setParentName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isNewAdmission, setIsNewAdmission] = useState(true);
  const [transportStopId, setTransportStopId] = useState('');
  const [transportShift, setTransportShift] = useState<TransportShift>('BOTH');
  const [feeExempt, setFeeExempt] = useState(false);
  const [discType, setDiscType] = useState<DiscountType>('NONE');
  const [discValue, setDiscValue] = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const list: SchoolClass[] = classes.data ?? [];
  const valid = name.trim().length > 0 && classId.length > 0;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setErr(null);
    try {
      await api.students.create({
        name: name.trim(),
        classId,
        isNewAdmission,
        parentName: parentName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        transportStopId: transportStopId || undefined,
        transportShift: transportStopId ? transportShift : undefined,
        feeExempt,
        discountType: feeExempt ? 'NONE' : discType,
        discountValue: feeExempt
          ? 0
          : discType === 'PERCENT'
            ? Math.round(discValue * 100)
            : discType === 'FLAT'
              ? rupeesToPaise(discValue)
              : 0,
      });
      onSaved(name.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div>
            <b>Add student</b>
            <span>New admission — fee plan auto-assigned by class</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb">
          <div className="frow" style={{ gridTemplateColumns: '1fr 220px' }}>
            <div className="fld">
              <label>Student name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Aadithya A"
                autoFocus
              />
            </div>
            <div className="fld">
              <label>Class</label>
              <select value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Select a class…</option>
                {list.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="fld">
              <label>Parent / guardian (optional)</label>
              <input
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                placeholder="e.g. Ramesh Kumar"
              />
            </div>
            <div className="fld">
              <label>Phone (optional)</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 98765 43210"
              />
            </div>
          </div>
          <div className="fld">
            <label>Email (optional)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="parent@example.com"
            />
          </div>
          <div className="frow" style={{ gridTemplateColumns: '1fr' }}>
            <label className="chk">
              <input
                type="checkbox"
                checked={isNewAdmission}
                onChange={(e) => setIsNewAdmission(e.target.checked)}
              />
              New admission this year
            </label>
          </div>

          {transportOn && (routes.data ?? []).length > 0 && (
            <div className="frow" style={{ gridTemplateColumns: transportStopId ? '1fr 200px' : '1fr' }}>
              <div className="fld">
                <label>Transport stop (optional)</label>
                <select value={transportStopId} onChange={(e) => setTransportStopId(e.target.value)}>
                  <option value="">No transport</option>
                  {(routes.data ?? []).map((r) => (
                    <optgroup key={r.id} label={`${r.name} · ${r.vehicleNumber}`}>
                      {r.stops.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {transportStopId && (
                <div className="fld">
                  <label>Shift</label>
                  <select value={transportShift} onChange={(e) => setTransportShift(e.target.value as TransportShift)}>
                    {SHIFTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="frow" style={{ gridTemplateColumns: '1fr' }}>
            <label className="chk">
              <input type="checkbox" checked={feeExempt} onChange={(e) => setFeeExempt(e.target.checked)} />
              Fee exempt — don’t generate an invoice for this student
            </label>
          </div>
          {!feeExempt && (
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
                  <input type="number" value={discValue} onChange={(e) => setDiscValue(Number(e.target.value))} />
                </div>
              )}
            </div>
          )}
          {classes.error && <div className="state err">{classes.error}</div>}
          {err && <div className="state err">{err}</div>}
        </div>
        <div className="mf">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn grn" disabled={!valid || saving} onClick={save}>
            {saving ? 'Saving…' : 'Add student'}
          </button>
        </div>
      </div>
    </div>
  );
}

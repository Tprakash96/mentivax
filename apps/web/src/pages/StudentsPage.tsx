import { useState } from 'react';
import { formatMoney } from '@mentivax/core';
import type { Student, SchoolClass } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

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

  const { data, loading, error, reload } = useAsync(
    () => api.students.list({ status: filter, search }),
    [filter, search],
  );

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

      <div className="card-t">
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
            {(data ?? []).map((s) => {
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
  const { api } = useApi();
  const classes = useAsync(() => api.classes.list(), []);
  const [name, setName] = useState('');
  const [classId, setClassId] = useState('');
  const [parentName, setParentName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isNewAdmission, setIsNewAdmission] = useState(true);
  const [hasTransport, setHasTransport] = useState(false);
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
        hasTransport,
        parentName: parentName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
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
          <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="chk">
              <input
                type="checkbox"
                checked={isNewAdmission}
                onChange={(e) => setIsNewAdmission(e.target.checked)}
              />
              New admission this year
            </label>
            <label className="chk">
              <input
                type="checkbox"
                checked={hasTransport}
                onChange={(e) => setHasTransport(e.target.checked)}
              />
              Uses school transport
            </label>
          </div>
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

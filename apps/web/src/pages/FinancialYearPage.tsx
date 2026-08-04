import { useState } from 'react';
import type { FinancialYear } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

const fmt = (iso: string) => (iso ? iso.slice(0, 10) : '');

export function FinancialYearPage() {
  const { api } = useApi();
  const toast = useToast();
  const years = useAsync(() => api.financialYears.list(), []);
  const list = years.data ?? [];

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [activate, setActivate] = useState(true);
  const [editing, setEditing] = useState<FinancialYear | null>(null);

  const create = async () => {
    if (!label.trim() || !start || !end) {
      toast('Label, start and end are required');
      return;
    }
    try {
      await api.financialYears.create({ label: label.trim(), startDate: start, endDate: end, activate });
      setLabel(''); setStart(''); setEnd(''); setActivate(true); setAdding(false);
      years.reload();
      toast('Academic year created');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create year');
    }
  };

  const activateYear = async (id: string) => {
    try {
      await api.financialYears.activate(id);
      years.reload();
      toast('Active year switched — reload to refresh data');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not activate');
    }
  };

  return (
    <>
      <div className="panel fs-head">
        <div>
          <h4>Academic Year</h4>
          <div className="ph" style={{ margin: 0 }}>
            The <b>active</b> year scopes every standard, fee, student and invoice. Exactly one year is
            active at a time.
          </div>
        </div>
        <div className="sp" style={{ flex: 1 }} />
        {!adding && (
          <button className="btn grn" onClick={() => setAdding(true)}>
            <Icon name="plus" size={15} /> Add year
          </button>
        )}
      </div>

      {adding && (
        <div className="panel" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fld">
            <label>Label</label>
            <input value={label} autoFocus placeholder="e.g. 2027-28" onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="fld">
            <label>Start date</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="fld">
            <label>End date</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <label className="chk" style={{ marginBottom: 6 }}>
            <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} />
            Make active
          </label>
          <button className="btn grn" onClick={create}>Create</button>
          <button className="btn" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      )}

      <div className="card-t">
        <table className="fs-tbl">
          <colgroup>
            <col />
            <col style={{ width: 160 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 150 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Year</th>
              <th>Start</th>
              <th>End</th>
              <th className="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((y) => (
              <tr key={y.id}>
                <td>
                  <b>{y.label}</b>
                  {y.isActive && <span className="fs-chip" style={{ marginLeft: 8, background: 'var(--green-soft)', color: 'var(--green-ink)', borderColor: 'var(--green-line)' }}>Active</span>}
                </td>
                <td className="mono">{fmt(y.startDate)}</td>
                <td className="mono">{fmt(y.endDate)}</td>
                <td className="num">
                  <div className="rowacts">
                    <button className="btn sm grn" onClick={() => setEditing(y)}>
                      <Icon name="pencil" size={13} />
                      Edit
                    </button>
                    {y.isActive ? (
                      <span className="fs-chip" style={{ background: 'var(--green-soft)', color: 'var(--green-ink)', borderColor: 'var(--green-line)' }}>Current</span>
                    ) : (
                      <button className="btn sm" onClick={() => activateYear(y.id)}>Set active</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={4} className="muted" style={{ padding: 18 }}>
                  No years yet — add your first academic year above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {years.loading && <div className="state">Loading…</div>}
        {years.error && <div className="state err">{years.error}</div>}
      </div>

      {editing && (
        <EditYearModal
          year={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            years.reload();
            toast('Academic year updated');
          }}
        />
      )}
    </>
  );
}

/** Edit an academic year's label and date range. */
function EditYearModal({
  year,
  onClose,
  onSaved,
}: {
  year: FinancialYear;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { api } = useApi();
  const [label, setLabel] = useState(year.label);
  const [start, setStart] = useState(fmt(year.startDate));
  const [end, setEnd] = useState(fmt(year.endDate));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = label.trim() && start && end;
  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setErr(null);
    try {
      await api.financialYears.update(year.id, { label: label.trim(), startDate: start, endDate: end });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: '94%' }}>
        <div className="mh">
          <div>
            <b>Edit academic year</b>
            <span>{year.isActive ? 'This is the current active year' : 'Label and date range'}</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb">
          <div className="fld">
            <label>Label</label>
            <input value={label} autoFocus onChange={(e) => setLabel(e.target.value)} placeholder="e.g. 2027-28" />
          </div>
          <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="fld">
              <label>Start date</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="fld">
              <label>End date</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {err && <div className="state err">{err}</div>}
        </div>
        <div className="mf">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn grn" disabled={!valid || saving} onClick={save}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

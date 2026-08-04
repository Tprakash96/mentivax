import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DocumentType } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

/**
 * Documents — the school decides which document *types* it collects, marks each
 * Required or Optional, and sees the collection progress across all students.
 * (Collected = active students whose `documents[]` includes the type's name.)
 */
export function DocumentsPage() {
  const { api, can } = useApi();
  const navigate = useNavigate();
  const toast = useToast();
  const types = useAsync(() => api.documentTypes.list(), []);
  const students = useAsync(() => api.students.list({ enrollment: 'ACTIVE' }), []);
  const [name, setName] = useState('');
  const [required, setRequired] = useState(false);
  // The document type whose "missing students" drill-down is open (null = closed).
  const [missingOf, setMissingOf] = useState<DocumentType | null>(null);

  const roster = students.data ?? [];
  const total = roster.length;

  const missingStudents = useMemo(
    () => (missingOf ? roster.filter((s) => !s.documents.includes(missingOf.name)) : []),
    [missingOf, roster],
  );

  const rows = useMemo(
    () =>
      (types.data ?? []).map((t) => {
        const collected = roster.filter((s) => s.documents.includes(t.name)).length;
        const pct = total ? Math.round((collected / total) * 100) : 0;
        return { ...t, collected, pct, missing: total - collected };
      }),
    [types.data, roster, total],
  );

  const toggleRequired = async (t: DocumentType) => {
    await api.documentTypes.update(t.id, { required: !t.required });
    types.reload();
  };
  const add = async () => {
    if (!name.trim()) return;
    await api.documentTypes.create({ name: name.trim(), required });
    setName('');
    setRequired(false);
    toast('Document type added');
    types.reload();
  };
  const remove = async (t: DocumentType) => {
    await api.documentTypes.remove(t.id);
    toast(`${t.name} removed`);
    types.reload();
  };

  const barColor = (pct: number) => (pct >= 90 ? 'var(--success)' : pct >= 60 ? 'var(--blue)' : 'var(--amber-dot)');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Document checklist</h1>
          <div className="sub">
            Decide what this school requires. Mentivax does not fix the list — add Passport, Medical record or
            anything your board asks for.
          </div>
        </div>
      </div>

      <div className="card-t" style={{ overflowX: 'auto' }}>
        <table className="docs-tbl">
          <thead>
            <tr>
              <th>Document type</th>
              <th>Required</th>
              <th>Collected</th>
              <th className="num">Missing</th>
              {can('students:write') && <th className="num" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><b style={{ fontWeight: 600 }}>{r.name}</b></td>
                <td>
                  <button
                    className={`req-chip${r.required ? ' on' : ''}`}
                    disabled={!can('students:write')}
                    onClick={() => void toggleRequired(r)}
                  >
                    {r.required ? 'Required' : 'Optional'}
                  </button>
                </td>
                <td>
                  <div className="docs-collected">
                    <span className="docs-bar"><span style={{ width: `${r.pct}%`, background: barColor(r.pct) }} /></span>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.collected} of {total} · {r.pct}%</span>
                  </div>
                </td>
                <td className="num">
                  {r.missing === 0 ? (
                    <span className="pos" style={{ fontWeight: 600 }}>None</span>
                  ) : (
                    <button
                      className="miss-link mono"
                      style={{ color: r.required ? 'var(--red-fig)' : 'var(--ink-4)' }}
                      onClick={() => setMissingOf(r)}
                      title="Show the students missing this document"
                    >
                      {r.missing} student{r.missing === 1 ? '' : 's'}
                    </button>
                  )}
                </td>
                {can('students:write') && (
                  <td className="num">
                    <button className="btn sm" onClick={() => void remove(r)} title="Remove type"><Icon name="trash" size={12} /></button>
                  </td>
                )}
              </tr>
            ))}
            {can('students:write') && (
              <tr className="addrow">
                <td><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a document type…" onKeyDown={(e) => e.key === 'Enter' && add()} /></td>
                <td>
                  <button className={`req-chip${required ? ' on' : ''}`} onClick={() => setRequired((v) => !v)}>
                    {required ? 'Required' : 'Optional'}
                  </button>
                </td>
                <td colSpan={2} />
                <td className="num"><button className="btn grn sm" onClick={add} disabled={!name.trim()}>Add</button></td>
              </tr>
            )}
          </tbody>
        </table>
        {(types.loading || students.loading) && <div className="state">Loading…</div>}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        Marking a type <b>Required</b> puts it on every student profile. Collect files per student from their profile’s Documents tab.
      </p>

      {missingOf && (
        <div className="scrim" onClick={() => setMissingOf(null)}>
          <div className="modal" style={{ maxWidth: 540, width: '94%' }} onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <div>
                <b>Missing · {missingOf.name}</b>
                <span>{missingStudents.length} active student{missingStudents.length === 1 ? '' : 's'} still to collect</span>
              </div>
              <button className="x" onClick={() => setMissingOf(null)}><Icon name="x" /></button>
            </div>
            <div className="mb" style={{ maxHeight: '68vh', overflowY: 'auto', padding: 0 }}>
              <div className="card-t" style={{ border: 'none', boxShadow: 'none' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Class</th>
                      <th className="num" />
                    </tr>
                  </thead>
                  <tbody>
                    {missingStudents.map((s) => (
                      <tr
                        key={s.id}
                        className="miss-row"
                        onClick={() => { setMissingOf(null); navigate(`/students/${s.id}`); }}
                      >
                        <td>
                          <b style={{ fontWeight: 600 }}>{s.name}</b>
                          {s.admissionNo && <span className="mono" style={{ marginLeft: 6, fontSize: 11, color: 'var(--ink-4)' }}>{s.admissionNo}</span>}
                        </td>
                        <td style={{ color: 'var(--ink-2)' }}>{s.className}</td>
                        <td className="num"><Icon name="arrowRight" size={14} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {missingStudents.length === 0 && <div className="state">Everyone has this document.</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

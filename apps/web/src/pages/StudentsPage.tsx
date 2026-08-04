import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatMoney, type DiscountType, type TransportShift } from '@mentivax/core';
import type { Invoice, Student, SchoolClass } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { InvoiceBreakdown } from '../components/InvoiceBreakdown';
import { Pagination, usePager } from '../components/Pagination';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

const SHIFTS: { value: TransportShift; label: string }[] = [
  { value: 'BOTH', label: 'Both ways' },
  { value: 'MORNING', label: 'Morning only' },
  { value: 'EVENING', label: 'Evening only' },
];

// Lifecycle filters, matching the design (Active / Applicant / TC issued / All).
const FILTERS = [
  { f: 'ACTIVE', label: 'Active' },
  { f: 'APPLICANT', label: 'Applicant' },
  { f: 'TC_ISSUED', label: 'TC issued' },
  { f: '', label: 'All' },
];

const ENROLL_TAG: Record<Student['enrollment'], { cls: string; label: string }> = {
  ACTIVE: { cls: 'paid', label: 'Active' },
  APPLICANT: { cls: 'due', label: 'Applicant' },
  TC_ISSUED: { cls: 'old', label: 'TC issued' },
  ALUMNI: { cls: 'old', label: 'Alumni' },
};
const PROFILE_DOCS = ['Aadhaar', 'Birth certificate', 'Transfer certificate', 'Community certificate', 'Photo'];

export function StudentsPage() {
  const { api } = useApi();
  const navigate = useNavigate();
  const toast = useToast();
  const [filter, setFilter] = useState('ACTIVE');
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);

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
        enrollment: filter || undefined,
        search,
      }),
    [classId, filter, search],
  );
  const pager = usePager(data ?? []);
  const classList = classes.data ?? [];
  const totalStudents = classList.reduce((n, c) => n + (c.studentCount ?? 0), 0);

  // Configured document checklist — drives the Documents progress column.
  const docTypesA = useAsync(() => api.documentTypes.list(), []);
  const docNames = (docTypesA.data ?? []).map((t) => t.name);

  // Whole-roster figures for the stat strip (independent of the active filter).
  const roster = useAsync(() => api.students.list({}), []);
  const all = roster.data ?? [];
  const newAdmissions = all.filter((s) => s.isNewAdmission).length;
  const owing = all.filter((s) => s.pending > 0);
  const totalPending = owing.reduce((n, s) => n + s.pending, 0);
  const totalPaid = all.reduce((n, s) => n + s.paid, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>All students</h1>
          <div className="sub">Every child on the rolls, with their fee standing at a glance</div>
        </div>
      </div>

      <div className="acct-cards students-stats">
        <div className="acct-card">
          <div className="acct-label">Active students</div>
          <div className="acct-bal mono">{all.length}</div>
          <div className="acct-note">across {classList.length} classes</div>
        </div>
        <div className="acct-card">
          <div className="acct-label">Joined this year</div>
          <div className="acct-bal mono" style={{ color: 'var(--blue)' }}>{newAdmissions}</div>
          <div className="acct-note">new admissions</div>
        </div>
        <div className="acct-card">
          <div className="acct-label">Fee due</div>
          <div className="acct-bal mono neg">{formatMoney(totalPending)}</div>
          <div className="acct-note">{owing.length} student{owing.length === 1 ? '' : 's'} owing</div>
        </div>
        <div className="acct-card">
          <div className="acct-label">Collected</div>
          <div className="acct-bal mono pos">{formatMoney(totalPaid)}</div>
          <div className="acct-note">received this year</div>
        </div>
      </div>

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
        <button className="btn" onClick={() => setImportOpen(true)}>
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
              <th>Guardian</th>
              <th className="num">Fee due</th>
              <th className="num">Documents</th>
              <th>Status</th>
              <th className="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pager.pageItems.map((s) => {
              const tag = ENROLL_TAG[s.enrollment] ?? ENROLL_TAG.ACTIVE;
              const docs = docNames.length ? docNames : PROFILE_DOCS;
              const held = docs.filter((d) => s.documents.includes(d)).length;
              const pct = docs.length ? Math.round((held / docs.length) * 100) : 0;
              return (
                <tr key={s.id} className="click" onClick={() => navigate(`/students/${s.id}`)}>
                  <td>
                    <div className="stu-cell">
                      <span className="av">{s.name[0]}</span>
                      <div className="sm">
                        <b>
                          {s.name}
                          {s.isNewAdmission && <span className="new-badge">NEW</span>}
                        </b>
                        <span className="mono">{s.admissionNo || s.className}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="cls">{s.className}</span>
                  </td>
                  <td>
                    {s.parentName || s.phone ? (
                      <div className="guardian-cell">
                        <b>{s.parentName ?? '—'}</b>
                        {s.phone && <span className="mono">{s.phone}</span>}
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="num mono" style={{ color: s.pending > 0 ? 'var(--red-fig)' : 'var(--ink-6)', fontWeight: 600 }}>
                    {s.pending > 0 ? formatMoney(s.pending) : '—'}
                  </td>
                  <td className="num">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                      <span className="docbar"><span style={{ width: `${pct}%`, background: pct === 100 ? 'var(--success)' : 'var(--amber-dot)' }} /></span>
                      <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>{held}/{docs.length}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`tag ${tag.cls}`}>
                      <i />
                      {tag.label}
                    </span>
                  </td>
                  <td className="num" onClick={(e) => e.stopPropagation()}>
                    <button className="btn sm grn" onClick={() => setEditStudent(s)}>
                      <Icon name="pencil" size={13} />
                      Edit
                    </button>
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
            roster.reload();
            toast(`${name} admitted — fee plan auto-assigned by class`);
          }}
        />
      )}
      {editStudent && (
        <AddStudentModal
          editing={editStudent}
          onClose={() => setEditStudent(null)}
          onSaved={(name) => {
            setEditStudent(null);
            reload();
            roster.reload();
            toast(`${name} updated`);
          }}
        />
      )}
      {importOpen && (
        <ImportStudentsModal
          onClose={() => setImportOpen(false)}
          onDone={(n) => {
            setImportOpen(false);
            reload();
            roster.reload();
            classes.reload();
            toast(`${n} student${n === 1 ? '' : 's'} imported`);
          }}
        />
      )}
    </>
  );
}

/** Minimal CSV parser: handles quoted fields, commas and newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

interface ImportRow {
  name: string;
  className: string;
  parentName: string;
  phone: string;
  isNewAdmission: boolean;
  classId: string | null;
}

/** Bulk-import students from a CSV (name, class, guardian, phone, admission). */
function ImportStudentsModal({ onClose, onDone }: { onClose: () => void; onDone: (n: number) => void }) {
  const { api } = useApi();
  const classes = useAsync(() => api.classes.list(), []);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; failed: { name: string; error: string }[] } | null>(null);

  const classList = classes.data ?? [];
  const findClass = (name: string): string | null => {
    const n = name.trim().toLowerCase();
    return classList.find((c) => c.name.toLowerCase() === n)?.id ?? null;
  };

  const parse = (text: string) => {
    const grid = parseCsv(text);
    if (grid.length < 2) {
      setRows([]);
      return;
    }
    const header = grid[0]!.map((h) => h.trim().toLowerCase());
    const col = (...names: string[]) => {
      for (const n of names) {
        const i = header.findIndex((h) => h === n || h.includes(n));
        if (i >= 0) return i;
      }
      return -1;
    };
    const iName = col('name', 'student');
    const iClass = col('class', 'standard', 'std');
    const iParent = col('guardian', 'parent', 'father', 'mother');
    const iPhone = col('phone', 'mobile', 'contact');
    const iAdm = col('admission', 'new', 'type');
    const parsed: ImportRow[] = grid.slice(1).map((r) => {
      const className = (iClass >= 0 ? r[iClass] : '')?.trim() ?? '';
      const admRaw = (iAdm >= 0 ? r[iAdm] : '')?.trim().toLowerCase() ?? '';
      return {
        name: (iName >= 0 ? r[iName] : r[0])?.trim() ?? '',
        className,
        parentName: (iParent >= 0 ? r[iParent] : '')?.trim() ?? '',
        phone: (iPhone >= 0 ? r[iPhone] : '')?.trim() ?? '',
        isNewAdmission: admRaw === 'new' || admRaw === 'yes' || admRaw === 'true',
        classId: findClass(className),
      };
    }).filter((r) => r.name);
    setRows(parsed);
    setResult(null);
  };

  const onFile = (f: File) => {
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => parse(String(reader.result ?? ''));
    reader.readAsText(f);
  };

  const valid = rows.filter((r) => r.classId);
  const invalid = rows.filter((r) => !r.classId);

  const runImport = async () => {
    setImporting(true);
    const failed: { name: string; error: string }[] = [];
    let created = 0;
    for (const r of valid) {
      try {
        await api.students.create({
          name: r.name,
          classId: r.classId!,
          parentName: r.parentName || undefined,
          phone: r.phone || undefined,
          isNewAdmission: r.isNewAdmission,
        });
        created++;
      } catch (e) {
        failed.push({ name: r.name, error: e instanceof Error ? e.message : 'failed' });
      }
    }
    setImporting(false);
    setResult({ created, failed });
    if (failed.length === 0) onDone(created);
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680, width: '96%' }}>
        <div className="mh">
          <div>
            <b>Import students</b>
            <span>Upload a CSV — columns map themselves</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          <div className="import-drop">
            <input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            <label htmlFor="csv-file" className="import-tile">
              <span className="import-plus">+</span>
              <div>
                <b>{fileName || 'Choose a CSV file'}</b>
                <span>Expected columns: Name · Class · Guardian · Phone · Admission (new/old)</span>
              </div>
            </label>
          </div>

          {rows.length > 0 && (
            <>
              <div className="import-summary">
                <span className="pos">{valid.length} ready</span>
                {invalid.length > 0 && <span className="neg">{invalid.length} need a matching class</span>}
              </div>
              <div className="card-t" style={{ maxHeight: 260, overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr><th>Name</th><th>Class</th><th>Guardian</th><th>Phone</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td><b style={{ fontWeight: 600 }}>{r.name}</b>{r.isNewAdmission && <span className="new-badge">NEW</span>}</td>
                        <td>{r.className || '—'}</td>
                        <td style={{ color: 'var(--ink-3)' }}>{r.parentName || '—'}</td>
                        <td className="mono" style={{ fontSize: 12 }}>{r.phone || '—'}</td>
                        <td>
                          {r.classId ? (
                            <span className="tag paid"><i />Ready</span>
                          ) : (
                            <span className="tag due"><i />No class “{r.className}”</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {result && (
            <div className={`state ${result.failed.length ? 'err' : ''}`} style={{ marginTop: 12 }}>
              Imported {result.created}.{result.failed.length > 0 && ` ${result.failed.length} failed: ${result.failed.map((f) => f.name).join(', ')}.`}
            </div>
          )}
        </div>
        <div className="mf">
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn grn" disabled={valid.length === 0 || importing} onClick={runImport}>
            {importing ? 'Importing…' : `Import ${valid.length} student${valid.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const ADM_TYPES: { value: 'NEW' | 'TRANSFER' | 'READMISSION'; label: string }[] = [
  { value: 'NEW', label: 'New' },
  { value: 'TRANSFER', label: 'Transfer' },
  { value: 'READMISSION', label: 'Re-admission' },
];
const RELATIONS = ['Father', 'Mother', 'Guardian', 'Grandparent', 'Sibling'];
/** Documents a school collects — kept in sync with the Documents page. */
const STUDENT_DOCS = ['Aadhaar', 'Birth certificate', 'Transfer certificate', 'Community certificate', 'Photo'];

function AddStudentModal({
  onClose,
  onSaved,
  editing,
}: {
  onClose: () => void;
  onSaved: (name: string) => void;
  editing?: Student | null;
}) {
  const { api, hasModule } = useApi();
  const navigate = useNavigate();
  const classes = useAsync(() => api.classes.list(), []);
  const transportOn = hasModule('transport');
  const routes = useAsync(() => (transportOn ? api.transport.routes.list() : Promise.resolve([])), []);

  const [step, setStep] = useState(1);
  // After a manual admission we preview the auto-generated invoice before closing.
  const [preview, setPreview] = useState<Invoice | null>(null);
  // Step 1 — student
  const [name, setName] = useState(editing?.name ?? '');
  const [admissionNo, setAdmissionNo] = useState(editing?.admissionNo ?? '');
  const [dob, setDob] = useState(editing?.dateOfBirth ?? '');
  const [classId, setClassId] = useState(editing?.classId ?? '');
  const [admType, setAdmType] = useState<'NEW' | 'TRANSFER' | 'READMISSION'>(editing?.admissionType ?? 'NEW');
  const [emisNo, setEmisNo] = useState(editing?.emisNo ?? '');
  const [penNo, setPenNo] = useState(editing?.penNo ?? '');
  const [aadhaar, setAadhaar] = useState(editing?.aadhaar ?? '');
  const [enrollment, setEnrollment] = useState<Student['enrollment']>(editing?.enrollment ?? 'ACTIVE');
  // Step 2 — guardian
  const [parentName, setParentName] = useState(editing?.parentName ?? '');
  const [guardianRelation, setGuardianRelation] = useState(editing?.guardianRelation || 'Father');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [email, setEmail] = useState('');
  // Step 3 — transport & fee adjustments
  const [documents, setDocuments] = useState<string[]>(editing?.documents ?? []);
  const [transportStopId, setTransportStopId] = useState(editing?.transportStopId ?? '');
  const [transportLandmark, setTransportLandmark] = useState(editing?.transportLandmark ?? '');
  const [transportShift, setTransportShift] = useState<TransportShift>(editing?.transportShift ?? 'BOTH');
  const [feeExempt, setFeeExempt] = useState(editing?.feeExempt ?? false);
  // Concessions are the reusable discounts defined in School Setup → Discounts.
  const concessions = useAsync(() => api.setup.discounts.list().catch(() => []), []);
  const feeTypesA = useAsync(() => api.feeTypes.list().catch(() => []), []);
  const feeNameOf = (key: string) => (feeTypesA.data ?? []).find((f) => f.key === key)?.name ?? key;
  const docTypesA = useAsync(() => api.documentTypes.list(), []);
  const docChecklist = (docTypesA.data ?? []).map((t) => t.name);
  const [applicable, setApplicable] = useState((editing?.discountType ?? 'NONE') !== 'NONE');
  const [concessionId, setConcessionId] = useState('');

  const rules = concessions.data ?? [];
  // On edit, a discount that doesn't match a defined rule is shown as "current".
  const currentRule =
    editing && editing.discountType !== 'NONE' && !rules.some((r) => r.kind === editing.discountType && r.value === editing.discountValue)
      ? { id: '__current', name: 'Current concession', kind: editing.discountType as 'PERCENT' | 'FLAT', value: editing.discountValue, appliesTo: '', rank: -1 }
      : null;
  const options = currentRule ? [currentRule, ...rules] : rules;
  const selectedRule = options.find((o) => o.id === concessionId) ?? null;

  // Preselect the matching concession when editing (once rules have loaded).
  useEffect(() => {
    if (!editing || concessionId || editing.discountType === 'NONE') return;
    const match = rules.find((r) => r.kind === editing.discountType && r.value === editing.discountValue);
    setConcessionId(match ? match.id : currentRule ? '__current' : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concessions.data]);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const list: SchoolClass[] = classes.data ?? [];
  const valid = name.trim().length > 0 && classId.length > 0;
  // The selected stop's pickup points — transport fares live on these.
  const stopLandmarks =
    (routes.data ?? []).flatMap((r) => r.stops).find((s) => s.id === transportStopId)?.landmarks ?? [];

  const discountType: DiscountType = feeExempt || !applicable || !selectedRule ? 'NONE' : selectedRule.kind;
  const discountValue = discountType === 'NONE' ? 0 : selectedRule!.value;
  // The concession's `appliesTo` scopes the discount to one fee head ("" = whole invoice).
  const discountFeeKey = discountType === 'NONE' ? '' : (selectedRule?.appliesTo ?? '');
  const fmtRule = (r: { kind: string; value: number }) => (r.kind === 'PERCENT' ? `${r.value / 100}%` : formatMoney(r.value));

  const STEPS = ['Student', 'Guardian', 'Transport & documents'];

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setErr(null);
    const common = {
      admissionNo: admissionNo.trim() || undefined,
      admissionType: admType,
      isNewAdmission: admType === 'NEW',
      dateOfBirth: dob || undefined,
      emisNo: emisNo.trim() || undefined,
      penNo: penNo.trim() || undefined,
      aadhaar: aadhaar.trim() || undefined,
      guardianRelation: guardianRelation || undefined,
      documents,
    };
    try {
      if (editing) {
        await api.students.update(editing.id, {
          name: name.trim(),
          classId,
          ...common,
          enrollmentStatus: enrollment,
          parentName: parentName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || undefined,
          transportStopId: transportStopId || null,
          transportShift: transportStopId ? transportShift : null,
          transportLandmark: transportStopId ? (transportLandmark || null) : null,
          feeExempt,
          discountType,
          discountValue,
          discountFeeKey,
        });
      } else {
        const created = await api.students.create({
          name: name.trim(),
          classId,
          ...common,
          parentName: parentName.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          transportStopId: transportStopId || undefined,
          transportShift: transportStopId ? transportShift : undefined,
          transportLandmark: transportStopId ? (transportLandmark || undefined) : undefined,
          feeExempt,
          discountType,
          discountValue,
          discountFeeKey,
        });
        // Auto-generated invoice — preview it before closing (unless exempt).
        try {
          const invs = await api.invoices.list();
          const mine = invs
            .filter((i) => i.studentId === created.id)
            .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
          if (mine[0]) {
            const full = await api.invoices.get(mine[0].id);
            setPreview(full);
            setSaving(false);
            return;
          }
        } catch {
          /* fall through to close */
        }
      }
      onSaved(name.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  // Post-admission: review the generated invoice before closing.
  if (preview) {
    const done = () => onSaved(name.trim());
    return (
      <div className="scrim" onClick={done}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, width: '94%' }}>
          <div className="mh">
            <div>
              <b>{name.trim()} admitted</b>
              <span>Review the invoice generated from the class fee structure</span>
            </div>
            <button className="x" onClick={done}><Icon name="x" /></button>
          </div>
          <div className="mb" style={{ maxHeight: '66vh', overflowY: 'auto' }}>
            <div className="inv-meta" style={{ marginBottom: 4 }}>
              <span className="mono" style={{ fontWeight: 600 }}>{preview.number}</span>
              <span className="cls">{preview.className}</span>
            </div>
            <InvoiceBreakdown invoice={preview} />
            <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
              Amounts follow the class fee structure. To change this student’s charges, edit the invoice in Fees &amp; collections.
            </p>
          </div>
          <div className="mf">
            <button className="btn" onClick={done}>Done</button>
            <div className="sp" style={{ flex: 1 }} />
            <button className="btn grn" onClick={() => navigate(`/invoices?edit=${preview.id}`)}>
              Edit invoice in Fees →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 860, width: '96%' }}>
        <div className="mh">
          <div className="adm-head">
            <b>{editing ? 'Edit student' : 'New admission'}</b>
            <span>Three steps · the student is on the roll and in the fee run at the end of it</span>
          </div>
          <div className="adm-steps">
            {STEPS.map((label, i) => {
              const n = i + 1;
              return (
                <button
                  key={label}
                  className={`adm-step${step === n ? ' on' : ''}${step > n ? ' done' : ''}`}
                  onClick={() => setStep(n)}
                >
                  <span className="adm-num">{n}</span>
                  {label}
                </button>
              );
            })}
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        <div className="mb" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
          {step === 1 && (
            <>
              <div className="frow" style={{ gridTemplateColumns: '1fr 200px' }}>
                <div className="fld">
                  <label>Student name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name as on certificate" autoFocus />
                </div>
                <div className="fld">
                  <label>Admission no</label>
                  <input className="mono" value={admissionNo} onChange={(e) => setAdmissionNo(e.target.value)} placeholder="e.g. MVX1104" />
                </div>
              </div>
              <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="fld">
                  <label>Date of birth</label>
                  <input type="date" value={dob ?? ''} onChange={(e) => setDob(e.target.value)} />
                </div>
                <div className="fld">
                  <label>Class &amp; section</label>
                  <select value={classId} onChange={(e) => setClassId(e.target.value)}>
                    <option value="">Select a class…</option>
                    {list.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="frow" style={{ gridTemplateColumns: editing ? '1fr 220px' : '1fr' }}>
                <div className="fld">
                  <label>Admission type</label>
                  <div className="chiprow">
                    {ADM_TYPES.map((a) => (
                      <button key={a.value} className={`fchip${admType === a.value ? ' on' : ''}`} onClick={() => setAdmType(a.value)}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
                {editing && (
                  <div className="fld">
                    <label>Student status</label>
                    <select value={enrollment} onChange={(e) => setEnrollment(e.target.value as Student['enrollment'])}>
                      <option value="ACTIVE">Active</option>
                      <option value="APPLICANT">Applicant</option>
                      <option value="TC_ISSUED">TC issued</option>
                      <option value="ALUMNI">Alumni (left)</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="adm-idhead">Identifiers this school collects</div>
              <div className="frow" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <div className="fld"><label>EMIS number</label><input className="mono" value={emisNo} onChange={(e) => setEmisNo(e.target.value)} placeholder="33xxxxxxxxxx" /></div>
                <div className="fld"><label>PEN / APAAR</label><input className="mono" value={penNo} onChange={(e) => setPenNo(e.target.value)} placeholder="optional" /></div>
                <div className="fld"><label>Aadhaar</label><input className="mono" value={aadhaar} onChange={(e) => setAadhaar(e.target.value)} placeholder="XXXX XXXX XXXX" /></div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="frow" style={{ gridTemplateColumns: '1fr 180px' }}>
                <div className="fld"><label>Guardian name</label><input value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="e.g. Ramesh Kumar" /></div>
                <div className="fld">
                  <label>Relationship</label>
                  <select value={guardianRelation} onChange={(e) => setGuardianRelation(e.target.value)}>
                    {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="fld"><label>Mobile</label><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" /></div>
                <div className="fld"><label>Email (optional)</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@example.com" /></div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              {transportOn && (routes.data ?? []).length > 0 ? (
                <>
                  <div className="frow" style={{ gridTemplateColumns: transportStopId ? '1fr 200px' : '1fr' }}>
                    <div className="fld">
                      <label>Transport area (optional)</label>
                      <select
                        value={transportStopId}
                        onChange={(e) => { setTransportStopId(e.target.value); setTransportLandmark(''); }}
                      >
                        <option value="">No transport</option>
                        {(routes.data ?? []).map((r) => (
                          <optgroup key={r.id} label={`${r.name} · ${r.vehicleNumber}`}>
                            {r.stops.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    {transportStopId && (
                      <div className="fld">
                        <label>Shift</label>
                        <select value={transportShift} onChange={(e) => setTransportShift(e.target.value as TransportShift)}>
                          {SHIFTS.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
                        </select>
                      </div>
                    )}
                  </div>
                  {transportStopId && stopLandmarks.length > 0 && (
                    <div className="fld">
                      <label>Pickup point <span style={{ color: 'var(--red-fig)' }}>· sets the transport fee</span></label>
                      <select value={transportLandmark} onChange={(e) => setTransportLandmark(e.target.value)}>
                        <option value="">Select a pickup point…</option>
                        {stopLandmarks.map((l) => (
                          <option key={l.name} value={l.name}>
                            {l.name}
                            {l.bothWayFare > 0 ? ` — ${formatMoney(l.bothWayFare)}` : ''}
                          </option>
                        ))}
                      </select>
                      {transportStopId && !transportLandmark && (
                        <span className="muted" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                          Pick a point, or no transport fee is charged.
                        </span>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="muted" style={{ fontSize: 12.5 }}>Transport isn’t enabled — assign a vehicle later from Fees → Transport.</div>
              )}

              <div className="fld" style={{ marginTop: 12 }}>
                <label>Documents collected <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>· optional</span></label>
                <div className="chiprow">
                  {(docChecklist.length ? docChecklist : STUDENT_DOCS).map((d) => {
                    const have = documents.includes(d);
                    return (
                      <button
                        key={d}
                        className={`fchip${have ? ' on' : ''}`}
                        onClick={() => setDocuments((xs) => (have ? xs.filter((x) => x !== d) : [...xs, d]))}
                      >
                        {d} {have ? '✓' : ''}
                      </button>
                    );
                  })}
                </div>
                <span className="muted" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                  Tick what you have now — the rest can be collected later from the Documents page.
                </span>
              </div>

              <label className="chk" style={{ marginTop: 12 }}>
                <input type="checkbox" checked={feeExempt} onChange={(e) => setFeeExempt(e.target.checked)} />
                Fee exempt — don’t generate an invoice for this student
              </label>
              {!feeExempt && (
                <>
                  <div className="fld">
                    <label>Concession applicable?</label>
                    <div className="chiprow">
                      <button className={`fchip${!applicable ? ' on' : ''}`} onClick={() => { setApplicable(false); setConcessionId(''); }}>No</button>
                      <button className={`fchip${applicable ? ' on' : ''}`} onClick={() => setApplicable(true)}>Yes</button>
                    </div>
                  </div>
                  {applicable && (
                    options.length > 0 ? (
                      <div className="fld">
                        <label>Which concession?</label>
                        <select value={concessionId} onChange={(e) => setConcessionId(e.target.value)}>
                          <option value="">Select a concession…</option>
                          {options.map((o) => (
                            <option key={o.id} value={o.id}>{o.name} — {fmtRule(o)}</option>
                          ))}
                        </select>
                        {selectedRule && (
                          <span className="muted" style={{ fontSize: 11.5, marginTop: 4, display: 'block' }}>
                            Applies −{fmtRule(selectedRule)} to{' '}
                            <b>{selectedRule.appliesTo ? feeNameOf(selectedRule.appliesTo) : 'the whole invoice'}</b>. Defined in School Setup → Discounts.
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="muted" style={{ fontSize: 12.5 }}>
                        No concessions defined yet. Add them in <b>School Setup → Discounts</b>, then pick one here.
                      </div>
                    )
                  )}
                </>
              )}
            </>
          )}
          {classes.error && <div className="state err">{classes.error}</div>}
          {err && <div className="state err">{err}</div>}
        </div>

        <div className="mf">
          {step > 1 ? (
            <button className="btn" onClick={() => setStep(step - 1)}>Back</button>
          ) : (
            <button className="btn" onClick={onClose}>Cancel</button>
          )}
          <div className="sp" style={{ flex: 1 }} />
          <span className="muted" style={{ fontSize: 11.5, marginRight: 10 }}>You can change any of this later from the profile.</span>
          {step < 3 ? (
            <button className="btn grn" disabled={step === 1 && !valid} onClick={() => setStep(step + 1)}>Continue</button>
          ) : (
            <button className="btn grn" disabled={!valid || saving} onClick={save}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Admit student'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

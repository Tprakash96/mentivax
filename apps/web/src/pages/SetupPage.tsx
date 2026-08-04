import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatMoney, paiseToRupees, rupeesToPaise } from '@mentivax/core';
import type { SchoolClass, SetupOverview, Subject } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AcademicFees, TransportStructure } from './FeesStructurePage';

type StepId =
  | 'profile' | 'year' | 'classes' | 'subjects' | 'staff'
  | 'calendar' | 'fees' | 'transport' | 'discounts' | 'accounts';

const STEPS: { id: StepId; label: string; sub: string; must: boolean }[] = [
  { id: 'profile', label: 'School profile', sub: 'Name, board, contact', must: true },
  { id: 'year', label: 'Academic year', sub: 'The current session', must: true },
  { id: 'classes', label: 'Classes & sections', sub: 'What you run', must: true },
  { id: 'subjects', label: 'Subjects & mapping', sub: 'Per class', must: true },
  { id: 'staff', label: 'Teachers & class teachers', sub: 'Who runs each class', must: true },
  { id: 'calendar', label: 'Holidays & calendar', sub: 'Days off', must: false },
  { id: 'fees', label: 'Fee heads', sub: 'What you charge', must: true },
  { id: 'transport', label: 'Transport', sub: 'Vehicles & stops', must: false },
  { id: 'discounts', label: 'Discounts', sub: 'Concessions', must: false },
  { id: 'accounts', label: 'Accounts & approvals', sub: 'Bookkeeping rules', must: false },
];

const BOARDS = ['CBSE', 'State board', 'ICSE', 'IB'];
const HOLIDAY_KINDS = ['State holiday', 'National holiday', 'Vacation', 'School holiday'];

export function SetupPage() {
  const { api } = useApi();
  const navigate = useNavigate();
  const [step, setStep] = useState<StepId>('profile');
  const overview = useAsync(() => api.setup.overview(), []);
  const ov = overview.data;

  const doneOf = (id: StepId): boolean => {
    if (!ov) return false;
    if (id in ov) return (ov as unknown as Record<string, boolean>)[id] === true;
    return false; // optional steps: no required indicator
  };

  const idx = STEPS.findIndex((s) => s.id === step);
  const prev = idx > 0 ? STEPS[idx - 1] : null;
  const next = idx < STEPS.length - 1 ? STEPS[idx + 1] : null;
  const cur = STEPS[idx]!;

  const pct = ov ? Math.round((ov.doneMusts / ov.totalMusts) * 100) : 0;
  const reload = () => overview.reload();

  return (
    <div className="setup-app">
      <aside className="setup-rail">
        <button className="setup-back" onClick={() => navigate('/home')}>
          <span className="setup-back-arrow">←</span>
          All features
        </button>
        <div className="setup-progress">
          <div className="setup-progress-h">
            <span>Setup</span>
            <b className="mono">{ov ? `${ov.doneMusts}/${ov.totalMusts}` : '—'}</b>
          </div>
          <div className="setup-bar"><span style={{ width: `${pct}%` }} /></div>
          <div className="setup-progress-note">
            {ov && ov.doneMusts === ov.totalMusts
              ? 'Everything essential is set. The school can run.'
              : 'Finish the required steps to go live.'}
          </div>
        </div>
        <nav className="setup-steps">
          {STEPS.map((s) => {
            const done = doneOf(s.id);
            const need = s.must && !done;
            return (
              <button key={s.id} className={`setup-step${step === s.id ? ' on' : ''}`} onClick={() => setStep(s.id)}>
                <span className={`setup-dot${done ? ' done' : ''}${step === s.id ? ' cur' : ''}`}>
                  {done ? '✓' : ''}
                </span>
                <span className="setup-step-t">
                  <b>{s.label}</b>
                  <span>{s.sub}</span>
                </span>
                {need && <span className="setup-req" title="Required before go-live" />}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="setup-canvas">
        <div className="setup-wrap">
        <div className="setup-head">
          <div>
            <h2>{cur.label}</h2>
            {cur.must && <span className="setup-must">Required</span>}
          </div>
          <div className="setup-nav">
            {prev && (
              <button className="btn" onClick={() => setStep(prev.id)}>
                <Icon name="arrowLeft" size={14} />
                {prev.label}
              </button>
            )}
            {next && (
              <button className="btn grn" onClick={() => setStep(next.id)}>
                {next.label}
                <Icon name="arrowRight" size={14} />
              </button>
            )}
          </div>
        </div>

        {step === 'profile' && <ProfileStep onSaved={reload} />}
        {step === 'year' && <YearStep onChanged={reload} />}
        {step === 'classes' && <ClassesStep onChanged={reload} />}
        {step === 'subjects' && <SubjectsStep onChanged={reload} />}
        {step === 'staff' && <StaffStep onChanged={reload} />}
        {step === 'calendar' && <CalendarStep />}
        {step === 'fees' && <FeesStep onChanged={reload} />}
        {step === 'transport' && <TransportStep />}
        {step === 'discounts' && <DiscountsStep />}
        {step === 'accounts' && <AccountsStep />}
        </div>
      </main>
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="setup-card">
      {title && <h4 className="section">{title}</h4>}
      {children}
    </div>
  );
}

/* ---- 1. Profile ---- */
function ProfileStep({ onSaved }: { onSaved: () => void }) {
  const { api } = useApi();
  const toast = useToast();
  const p = useAsync(() => api.setup.profile.get(), []);
  const d = p.data;
  const [saving, setSaving] = useState(false);

  if (!d) return <div className="state">Loading…</div>;

  const save = async (field: string, value: string) => {
    setSaving(true);
    await api.setup.profile.update({ [field]: value });
    setSaving(false);
    p.reload();
    onSaved();
  };

  return (
    <Card title="Identity printed on receipts, invoices and certificates">
      <div className="frow" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <Field label="School name" defaultValue={d.name} onSave={(v) => save('name', v)} />
        <Field label="Short code" defaultValue={d.shortCode} onSave={(v) => save('shortCode', v)} />
      </div>
      <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Field label="Affiliation / recognition no." defaultValue={d.affiliation} onSave={(v) => save('affiliation', v)} />
        <Field label="Principal" defaultValue={d.principalName} onSave={(v) => save('principalName', v)} />
      </div>
      <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Field label="Phone" defaultValue={d.phone} onSave={(v) => save('phone', v)} />
        <Field label="Email" defaultValue={d.email} onSave={(v) => save('email', v)} />
      </div>
      <div className="fld">
        <label>Board</label>
        <div className="chiprow">
          {BOARDS.map((b) => (
            <button key={b} className={`fchip${d.board === b ? ' on' : ''}`} onClick={() => void save('board', b)}>{b}</button>
          ))}
        </div>
      </div>
      <div className="fld">
        <label>Address</label>
        <textarea defaultValue={d.address} rows={2} onBlur={(e) => void save('address', e.target.value)} placeholder="Full address" />
      </div>
      {saving && <div className="muted" style={{ fontSize: 12 }}>Saving…</div>}
      <p className="setup-hint" onClick={() => toast('Profile autosaves as you edit each field')}>Every field autosaves when you click away.</p>
    </Card>
  );
}

function Field({ label, defaultValue, onSave }: { label: string; defaultValue: string; onSave: (v: string) => void }) {
  return (
    <div className="fld">
      <label>{label}</label>
      <input defaultValue={defaultValue} onBlur={(e) => { if (e.target.value !== defaultValue) onSave(e.target.value); }} />
    </div>
  );
}

/* ---- 2. Academic year ---- */
function YearStep({ onChanged }: { onChanged: () => void }) {
  const { api } = useApi();
  const toast = useToast();
  const years = useAsync(() => api.financialYears.list(), []);
  const list = years.data ?? [];

  const activate = async (id: string) => {
    await api.financialYears.activate(id);
    toast('Current year set');
    years.reload();
    onChanged();
  };

  return (
    <Card title="Exactly one year is Current — invoices and payroll run against it">
      <div className="card-t" style={{ border: 'none', boxShadow: 'none' }}>
        <table>
          <thead><tr><th>Year</th><th>Starts</th><th>Ends</th><th className="num">State</th></tr></thead>
          <tbody>
            {list.map((y) => (
              <tr key={y.id}>
                <td><b style={{ fontWeight: 600 }}>{y.label}</b></td>
                <td className="mono" style={{ fontSize: 12.5 }}>{y.startDate.slice(0, 10)}</td>
                <td className="mono" style={{ fontSize: 12.5 }}>{y.endDate.slice(0, 10)}</td>
                <td className="num">
                  {y.isActive ? (
                    <span className="tag paid"><i />Current</span>
                  ) : (
                    <button className="btn sm" onClick={() => void activate(y.id)}>Make current</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link className="setup-link" to="/academic-year">Add or edit years →</Link>
    </Card>
  );
}

/* ---- 3. Classes & sections ---- */
function ClassesStep({ onChanged }: { onChanged: () => void }) {
  const { api } = useApi();
  const toast = useToast();
  const classes = useAsync(() => api.classes.list(), []);
  const [newClass, setNewClass] = useState('');
  const list = classes.data ?? [];

  const addClass = async () => {
    if (!newClass.trim()) return;
    await api.classes.create({ name: newClass.trim() });
    setNewClass('');
    classes.reload();
    onChanged();
  };
  const setSections = async (c: SchoolClass, sections: string[]) => {
    await api.classes.update(c.id, { sections });
    classes.reload();
    onChanged();
  };
  const addSection = (c: SchoolClass) => {
    const nextLetter = String.fromCharCode(65 + c.sections.length);
    void setSections(c, [...c.sections, nextLetter]);
  };
  const removeSection = (c: SchoolClass, s: string) => {
    if (c.sections.length <= 1) return;
    void setSections(c, c.sections.filter((x) => x !== s));
  };
  const removeClass = async (c: SchoolClass) => {
    try {
      await api.classes.remove(c.id);
      toast(`${c.name} removed`);
      classes.reload();
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not remove');
    }
  };

  return (
    <Card title="Every class needs at least one section">
      <div className="setup-classlist">
        {list.map((c) => (
          <div key={c.id} className="setup-classrow">
            <b>{c.name}</b>
            <div className="chiprow" style={{ flex: 1 }}>
              {c.sections.map((s) => (
                <span key={s} className="sec-chip">
                  {s}
                  {c.sections.length > 1 && <button onClick={() => removeSection(c, s)}>×</button>}
                </span>
              ))}
              <button className="sec-add" onClick={() => addSection(c)}>+ section</button>
            </div>
            <button className="btn sm" onClick={() => void removeClass(c)} title="Remove class"><Icon name="trash" size={13} /></button>
          </div>
        ))}
      </div>
      <div className="addbar">
        <input value={newClass} onChange={(e) => setNewClass(e.target.value)} placeholder="Add a class, e.g. 6 STD" onKeyDown={(e) => e.key === 'Enter' && addClass()} />
        <button className="btn grn" onClick={addClass} disabled={!newClass.trim()}>Add class</button>
      </div>
    </Card>
  );
}

/* ---- 4. Subjects & mapping ---- */
function SubjectsStep({ onChanged }: { onChanged: () => void }) {
  const { api } = useApi();
  const subjects = useAsync(() => api.setup.subjects.list(), []);
  const classes = useAsync(() => api.classes.list(), []);
  const [newSubject, setNewSubject] = useState('');
  const subs = subjects.data ?? [];
  const cls = classes.data ?? [];

  const add = async () => {
    if (!newSubject.trim()) return;
    await api.setup.subjects.create({ name: newSubject.trim(), classIds: cls.map((c) => c.id) });
    setNewSubject('');
    subjects.reload();
    onChanged();
  };
  const toggle = async (s: Subject, classId: string) => {
    const has = s.classIds.includes(classId);
    await api.setup.subjects.update(s.id, {
      classIds: has ? s.classIds.filter((x) => x !== classId) : [...s.classIds, classId],
    });
    subjects.reload();
  };
  const remove = async (s: Subject) => {
    await api.setup.subjects.remove(s.id);
    subjects.reload();
    onChanged();
  };

  return (
    <Card title="Tick which classes each subject is taught in">
      <div className="addbar" style={{ marginBottom: 14 }}>
        <input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Add a subject, e.g. Maths" onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn grn" onClick={add} disabled={!newSubject.trim()}>Add subject</button>
      </div>
      {subs.length === 0 && <div className="state">No subjects yet.</div>}
      {subs.length > 0 && cls.length > 0 && (
        <div className="card-t" style={{ overflowX: 'auto' }}>
          <table className="subj-grid">
            <thead>
              <tr>
                <th className="subj-name">Subject</th>
                {cls.map((c) => <th key={c.id} className="subj-col">{c.name}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id}>
                  <td className="subj-name"><b style={{ fontWeight: 600 }}>{s.name}</b></td>
                  {cls.map((c) => {
                    const on = s.classIds.includes(c.id);
                    return (
                      <td key={c.id} className="subj-cell">
                        <button className={`tickbox${on ? ' on' : ''}`} onClick={() => void toggle(s, c.id)}>{on ? '✓' : ''}</button>
                      </td>
                    );
                  })}
                  <td><button className="btn sm" onClick={() => void remove(s)}><Icon name="trash" size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ---- 5. Teachers & class teachers ---- */
function StaffStep({ onChanged }: { onChanged: () => void }) {
  const { api, hasModule } = useApi();
  const toast = useToast();
  const teachers = useAsync(() => (hasModule('staff') ? api.staff.list({ role: 'TEACHER' }) : Promise.resolve([])), []);
  const classes = useAsync(() => api.classes.list(), []);
  const list = classes.data ?? [];
  const staff = teachers.data ?? [];
  const unassigned = list.filter((c) => !c.classTeacherId).length;

  const assign = async (classId: string, teacherId: string) => {
    await api.classes.update(classId, { classTeacherId: teacherId || null });
    toast(teacherId ? 'Class teacher assigned' : 'Class teacher cleared');
    classes.reload();
    onChanged();
  };

  if (!hasModule('staff')) {
    return <Card title="Teachers & class teachers"><div className="state">Enable the Staff & Payroll module to manage teachers.</div></Card>;
  }

  return (
    <Card title="Give every class a class teacher">
      {unassigned > 0 && (
        <div className="appr-note" style={{ color: 'var(--amber)' }}>
          {unassigned} class{unassigned === 1 ? '' : 'es'} without a class teacher.
        </div>
      )}
      <div className="card-t" style={{ border: 'none', boxShadow: 'none' }}>
        <table>
          <thead><tr><th>Class</th><th>Class teacher</th></tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td><b style={{ fontWeight: 600 }}>{c.name}</b> <span className="muted" style={{ fontSize: 11.5 }}>· {c.sections.join(', ')}</span></td>
                <td>
                  <select className="minisel" value={c.classTeacherId ?? ''} onChange={(e) => void assign(c.id, e.target.value)}>
                    <option value="">Not assigned</option>
                    {staff.map((tch) => <option key={tch.id} value={tch.id}>{tch.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link className="setup-link" to="/staff">Manage teachers in Staff →</Link>
    </Card>
  );
}

/* ---- 6. Holidays ---- */
function CalendarStep() {
  const { api } = useApi();
  const toast = useToast();
  const holidays = useAsync(() => api.setup.holidays.list(), []);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [kind, setKind] = useState('School holiday');
  const list = holidays.data ?? [];

  const add = async () => {
    if (!name.trim() || !date) return;
    await api.setup.holidays.create({ name: name.trim(), date, kind: kind as never });
    setName('');
    setDate('');
    toast('Holiday added');
    holidays.reload();
  };
  const remove = async (id: string) => {
    await api.setup.holidays.remove(id);
    holidays.reload();
  };

  return (
    <Card title="Holidays and vacations for the current year">
      <div className="frow" style={{ gridTemplateColumns: '2fr 1fr 1fr auto', alignItems: 'end' }}>
        <div className="fld"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pongal" /></div>
        <div className="fld"><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="fld"><label>Kind</label><select value={kind} onChange={(e) => setKind(e.target.value)}>{HOLIDAY_KINDS.map((k) => <option key={k}>{k}</option>)}</select></div>
        <button className="btn grn" onClick={add} disabled={!name.trim() || !date}>Add</button>
      </div>
      <div className="card-t" style={{ border: 'none', boxShadow: 'none', marginTop: 12 }}>
        <table>
          <thead><tr><th>Holiday</th><th>Date</th><th>Kind</th><th className="num" /></tr></thead>
          <tbody>
            {list.map((h) => (
              <tr key={h.id}>
                <td><b style={{ fontWeight: 600 }}>{h.name}</b></td>
                <td className="mono" style={{ fontSize: 12.5 }}>{h.date.split('-').reverse().join('/')}</td>
                <td><span className="cls">{h.kind}</span></td>
                <td className="num"><button className="btn sm" onClick={() => void remove(h.id)}><Icon name="trash" size={12} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div className="state">No holidays added.</div>}
      </div>
    </Card>
  );
}

/* ---- 7. Fee heads ---- */
function FeesStep({ onChanged }: { onChanged: () => void }) {
  void onChanged;
  return (
    <Card title="Define each fee once — its name and how often it's charged">
      <p className="muted" style={{ fontSize: 12.5, marginTop: -4, lineHeight: 1.5 }}>
        This is the school-wide structure. The <b>amount</b> charged for each fee is set per class by your
        accounts staff under <Link className="setup-link" to="/mappings" style={{ display: 'inline' }}>Fees → Fee structure</Link>.
      </p>
      <AcademicFees />
    </Card>
  );
}

/* ---- 8. Transport ---- */
function TransportStep() {
  const { hasModule } = useApi();
  if (!hasModule('transport')) {
    return (
      <Card title="Transport">
        <div className="state">Enable the Transport module to configure vehicles, stops and fares.</div>
        <Link className="setup-link" to="/modules">Go to Modules →</Link>
      </Card>
    );
  }
  return (
    <Card title="Vehicles, areas and fares — assign students to them in Fees → Transport">
      <TransportStructure mode="setup" />
    </Card>
  );
}

/* ---- 9. Discounts ---- */
function DiscountsStep() {
  const { api } = useApi();
  const toast = useToast();
  const rules = useAsync(() => api.setup.discounts.list(), []);
  const fees = useAsync(() => api.feeTypes.list(), []);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'PERCENT' | 'FLAT'>('PERCENT');
  const [value, setValue] = useState('');
  const [appliesTo, setAppliesTo] = useState('');
  const list = rules.data ?? [];
  const feeList = fees.data ?? [];
  const feeName = (key: string) => feeList.find((f) => f.key === key)?.name ?? 'Whole invoice';

  const add = async () => {
    const v = Number(value) || 0;
    if (!name.trim() || v <= 0) return;
    await api.setup.discounts.create({
      name: name.trim(),
      kind,
      // PERCENT stored as basis points (10% → 1000); FLAT as paise.
      value: kind === 'PERCENT' ? Math.round(v * 100) : rupeesToPaise(v),
      appliesTo: appliesTo || undefined,
    });
    setName('');
    setValue('');
    setAppliesTo('');
    toast('Concession added');
    rules.reload();
  };
  const remove = async (id: string) => {
    await api.setup.discounts.remove(id);
    rules.reload();
  };

  return (
    <Card title="Concessions — reusable discounts you can apply while billing">
      <div className="card-t" style={{ border: 'none', boxShadow: 'none' }}>
        <table>
          <thead>
            <tr><th>Name</th><th>Type</th><th className="num">Value</th><th>Applies to</th><th className="num" /></tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td><b style={{ fontWeight: 600 }}>{r.name}</b></td>
                <td><span className="cls">{r.kind === 'PERCENT' ? 'Percentage' : 'Flat'}</span></td>
                <td className="num mono">{r.kind === 'PERCENT' ? `${r.value / 100}%` : formatMoney(r.value)}</td>
                <td>{r.appliesTo ? feeName(r.appliesTo) : 'Whole invoice'}</td>
                <td className="num"><button className="btn sm" onClick={() => void remove(r.id)}><Icon name="trash" size={12} /></button></td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={5} className="muted" style={{ padding: 16 }}>No concessions yet — add one below.</td></tr>
            )}
            <tr className="addrow">
              <td><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Staff ward" /></td>
              <td>
                <select value={kind} onChange={(e) => setKind(e.target.value as 'PERCENT' | 'FLAT')}>
                  <option value="PERCENT">Percentage</option>
                  <option value="FLAT">Flat (₹)</option>
                </select>
              </td>
              <td className="num">
                <input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === 'PERCENT' ? '%' : '₹'} />
              </td>
              <td>
                <select value={appliesTo} onChange={(e) => setAppliesTo(e.target.value)}>
                  <option value="">Whole invoice</option>
                  {feeList.map((f) => (
                    <option key={f.key} value={f.key}>{f.name}</option>
                  ))}
                </select>
              </td>
              <td className="num"><button className="btn grn sm" onClick={add} disabled={!name.trim() || !(Number(value) > 0)}>Add</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 11.5 }}>
        Concessions are reusable presets. Apply one to a student on their profile or during an invoice run.
      </p>
    </Card>
  );
}

/* ---- 10. Accounts & approvals + payroll defaults ---- */
function AccountsStep() {
  const { api, can } = useApi();
  const toast = useToast();
  const acct = useAsync(() => api.expenses.settings.get(), []);
  const pay = useAsync(() => api.staff.settings.get(), []);
  const a = acct.data;
  const p = pay.data;

  const saveAcct = async (patch: Partial<NonNullable<typeof a>>) => {
    if (!a) return;
    await api.expenses.settings.update({ ...a, ...patch });
    toast('Accounts settings saved');
    acct.reload();
  };
  const savePay = async (patch: Partial<NonNullable<typeof p>>) => {
    if (!p) return;
    await api.staff.settings.update({ ...p, ...patch });
    toast('Payroll settings saved');
    pay.reload();
  };

  return (
    <>
      <Card title="Bookkeeping rules — read by Expenses & accounts">
        {!a && <div className="state">Loading…</div>}
        {a && (
          <>
            <div className="toggle-row">
              <div>
                <b>Expense approvals</b>
                <span>Expenses above the limit wait for sign-off before they post.</span>
              </div>
              <Toggle on={a.approvalsOn} disabled={!can('expenses:manage')} onChange={(v) => saveAcct({ approvalsOn: v })} />
            </div>
            {a.approvalsOn && (
              <div className="fld" style={{ maxWidth: 220 }}>
                <label>Approval limit (₹)</label>
                <input type="number" min={0} defaultValue={paiseToRupees(a.approvalLimit)} disabled={!can('expenses:manage')}
                  onBlur={(e) => saveAcct({ approvalLimit: rupeesToPaise(Number(e.target.value) || 0) })} />
              </div>
            )}
            <div className="toggle-row">
              <div>
                <b>Categories &amp; budgets</b>
                <span>File entries under categories with budgets. When off, reports group by payee.</span>
              </div>
              <Toggle on={a.categoriesOn} disabled={!can('expenses:manage')} onChange={(v) => saveAcct({ categoriesOn: v })} />
            </div>
            <div className="toggle-row locked-row">
              <div>
                <b>Description on every entry</b>
                <span>Always on — every entry carries an optional free-text note.</span>
              </div>
              <span className="tag paid"><i />Always on</span>
            </div>
          </>
        )}
      </Card>

      <Card title="Payroll defaults — read by Staff & payroll">
        {!p && <div className="state">Loading…</div>}
        {p && (
          <>
            <div className="frow" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <NumField label="DA (% of basic)" value={p.daPercent} disabled={!can('payroll:run')} onSave={(v) => savePay({ daPercent: v })} />
              <NumField label="HRA (% of basic)" value={p.hraPercent} disabled={!can('payroll:run')} onSave={(v) => savePay({ hraPercent: v })} />
              <NumField label="PF (% of basic)" value={p.pfPercent} disabled={!can('payroll:run')} onSave={(v) => savePay({ pfPercent: v })} />
            </div>
            <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="fld">
                <label>Professional tax (₹/month)</label>
                <input type="number" min={0} defaultValue={paiseToRupees(p.ptMonthly)} disabled={!can('payroll:run')}
                  onBlur={(e) => savePay({ ptMonthly: rupeesToPaise(Number(e.target.value) || 0) })} />
              </div>
              <div className="fld">
                <label>Conveyance (₹/month)</label>
                <input type="number" min={0} defaultValue={paiseToRupees(p.conveyance)} disabled={!can('payroll:run')}
                  onBlur={(e) => savePay({ conveyance: rupeesToPaise(Number(e.target.value) || 0) })} />
              </div>
            </div>
            <div className="toggle-row">
              <div>
                <b>Post salaries to accounts</b>
                <span>Each salary payment books an expense under “Salaries”.</span>
              </div>
              <Toggle on={p.postToAccounts} disabled={!can('payroll:run')} onChange={(v) => savePay({ postToAccounts: v })} />
            </div>
            <p className="muted" style={{ fontSize: 12 }}>Take-home = {formatMoney(0)} base + DA + HRA + conveyance − statutory. Per-person PF/ESI/PT switches stay on each staff record.</p>
          </>
        )}
      </Card>
    </>
  );
}

function NumField({ label, value, disabled, onSave }: { label: string; value: number; disabled?: boolean; onSave: (v: number) => void }) {
  return (
    <div className="fld">
      <label>{label}</label>
      <input type="number" min={0} defaultValue={value} disabled={disabled} onBlur={(e) => { const v = Number(e.target.value); if (v !== value) onSave(v); }} />
    </div>
  );
}

function Toggle({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`toggle${on ? ' on' : ''}`} disabled={disabled} onClick={() => onChange(!on)} aria-pressed={on}>
      <span className="toggle-knob" />
    </button>
  );
}

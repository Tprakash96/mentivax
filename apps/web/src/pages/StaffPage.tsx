import { useMemo, useState } from 'react';
import {
  computePayslip,
  formatMoney,
  paiseToRupees,
  rupeesToPaise,
  type ExpenseMode,
  type PayrollSettings,
  type StaffRoleKey,
} from '@mentivax/core';
import type { Employee, Payslip } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

type Tab = 'register' | 'attendance' | 'leave' | 'payroll' | 'payslips' | 'exits';

const ROLES: { key: StaffRoleKey; label: string }[] = [
  { key: 'TEACHER', label: 'Teacher' },
  { key: 'TRANSPORT', label: 'Transport' },
  { key: 'OFFICE', label: 'Office' },
  { key: 'SUPPORT', label: 'Support' },
  { key: 'MANAGEMENT', label: 'Management' },
  { key: 'VISITING', label: 'Part-time' },
];
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.key, r.label]));
const ROLE_CLASS: Record<StaffRoleKey, string> = {
  MANAGEMENT: 'r-mgmt',
  TEACHER: 'r-teach',
  TRANSPORT: 'r-trans',
  OFFICE: 'r-office',
  SUPPORT: 'r-support',
  VISITING: 'r-visit',
};
const PAY_MODES: ExpenseMode[] = ['BANK', 'CASH', 'UPI', 'CHEQUE'];
const MODE_LABEL: Record<ExpenseMode, string> = { BANK: 'Bank', CASH: 'Cash', UPI: 'UPI', CHEQUE: 'Cheque' };

const thisMonth = () => new Date().toISOString().slice(0, 7);
const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y!, mo! - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
};
const initials = (n: string) =>
  n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export function StaffPage() {
  const { api, can } = useApi();
  const [tab, setTab] = useState<Tab>('register');
  const settings = useAsync(() => api.staff.settings.get(), []);
  const s = settings.data;

  const TABS: { key: Tab; label: string; show: boolean }[] = [
    { key: 'register', label: 'Staff register', show: true },
    { key: 'attendance', label: 'Attendance', show: true },
    { key: 'leave', label: 'Leave', show: true },
    { key: 'payroll', label: 'Pay staff', show: can('payroll:read') },
    { key: 'payslips', label: 'Payslips', show: can('payroll:read') },
    { key: 'exits', label: 'Exits', show: true },
  ];

  return (
    <>
      <div className="subtabs">
        {TABS.filter((t) => t.show).map((t) => (
          <button key={t.key} className={`subtab${tab === t.key ? ' on' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {!s && <div className="state">Loading…</div>}
      {s && tab === 'register' && <Register settings={s} />}
      {s && tab === 'attendance' && <Attendance />}
      {s && tab === 'leave' && <Leave />}
      {s && tab === 'payroll' && <PayStaff settings={s} />}
      {s && tab === 'payslips' && <Payslips />}
      {s && tab === 'exits' && <Exits />}
    </>
  );
}

function RoleChipTag({ role }: { role: StaffRoleKey }) {
  return <span className={`rolechip ${ROLE_CLASS[role]}`}>{ROLE_LABEL[role]}</span>;
}

/* ============================== Register ============================== */

function Register({ settings }: { settings: PayrollSettings }) {
  const { api, can } = useApi();
  const [role, setRole] = useState<'' | StaffRoleKey>('');
  const [search, setSearch] = useState('');
  const [hire, setHire] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);

  const summary = useAsync(() => api.staff.summary(), []);
  const list = useAsync(
    () => api.staff.list({ role: role || undefined, search: search || undefined }),
    [role, search],
  );
  const sum = summary.data;
  const rows = list.data ?? [];

  const reload = () => {
    summary.reload();
    list.reload();
  };

  return (
    <>
      <div className="acct-cards">
        <div className="acct-card">
          <div className="acct-label">On the rolls</div>
          <div className="acct-bal mono">{sum?.headcount ?? 0}</div>
          <div className="acct-note">{sum?.teacherCount ?? 0} teachers · {sum?.transportCount ?? 0} transport</div>
        </div>
        <div className="acct-card">
          <div className="acct-label">Monthly salary bill</div>
          <div className="acct-bal mono">{formatMoney(sum?.monthlyBill ?? 0)}</div>
          <div className="acct-note">take-home across active staff</div>
        </div>
        <div className="acct-card">
          <div className="acct-label">Paid this month</div>
          <div className="acct-bal mono pos">{formatMoney(sum?.paidThisMonth ?? 0)}</div>
          <div className="acct-note">{monthLabel(thisMonth())}</div>
        </div>
        <div className="acct-card">
          <div className="acct-label">Still to pay</div>
          <div className="acct-bal mono amb">{sum?.toPayCount ?? 0}</div>
          <div className="acct-note">people not yet paid</div>
        </div>
      </div>

      <div className="tbar">
        <div className="chiprow">
          <button className={`fchip${role === '' ? ' on' : ''}`} onClick={() => setRole('')}>
            Everyone
          </button>
          {ROLES.map((r) => (
            <button key={r.key} className={`fchip${role === r.key ? ' on' : ''}`} onClick={() => setRole(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="sp" />
        <div className="search">
          <Icon name="search" />
          <input placeholder="Name, code, phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {can('staff:write') && (
          <button className="btn grn" onClick={() => setHire(true)}>
            <Icon name="plus" size={15} />
            Hire someone
          </button>
        )}
      </div>

      <div className="card-t">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Designation</th>
              <th>Joined</th>
              <th className="num">Gross a month</th>
              <th className="num">Take home</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="click" onClick={() => setSelId(e.id)}>
                <td>
                  <div className="stu-cell">
                    <span className="av">{initials(e.name)}</span>
                    <span>
                      <b style={{ fontWeight: 600, display: 'block' }}>{e.name}</b>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>{e.code}</span>
                    </span>
                  </div>
                </td>
                <td><RoleChipTag role={e.role} /></td>
                <td style={{ color: 'var(--ink-2)' }}>{e.designation || '—'}</td>
                <td className="mono" style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{e.doj.split('-').reverse().join('/')}</td>
                <td className="num mono">{formatMoney(e.gross)}</td>
                <td className="num mono" style={{ fontWeight: 650 }}>{formatMoney(e.net)}</td>
                <td>
                  <span className={`tag ${e.paidThisMonth ? 'paid' : 'due'}`}>
                    <i />
                    {e.paidThisMonth ? 'Paid' : 'To pay'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.loading && <div className="state">Loading staff…</div>}
        {!list.loading && rows.length === 0 && <div className="state">No staff yet — hire someone to begin.</div>}
      </div>

      {hire && <HireModal onClose={() => setHire(false)} onSaved={(id) => { setHire(false); reload(); setSelId(id); }} />}
      {selId && (
        <StaffDrawer
          id={selId}
          settings={settings}
          onClose={() => setSelId(null)}
          onChanged={reload}
        />
      )}
    </>
  );
}

function HireModal({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const { api } = useApi();
  const toast = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<StaffRoleKey>('TEACHER');
  const [designation, setDesignation] = useState('');
  const [doj, setDoj] = useState(new Date().toISOString().slice(0, 10));
  const [basic, setBasic] = useState('');
  const [special, setSpecial] = useState('');
  const [licence, setLicence] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = name.trim() && Number(basic) > 0;
  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setErr(null);
    try {
      const e = await api.staff.hire({
        name: name.trim(),
        phone: phone.trim() || undefined,
        role,
        designation: designation.trim() || undefined,
        doj,
        basic: rupeesToPaise(Number(basic) || 0),
        special: rupeesToPaise(Number(special) || 0),
        licence: role === 'TRANSPORT' ? licence.trim() || undefined : undefined,
        vehicle: role === 'TRANSPORT' ? vehicle.trim() || undefined : undefined,
      });
      toast(`${e.name} added as ${e.code}`);
      onSaved(e.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, width: '94%' }}>
        <div className="mh">
          <div>
            <b>Hire someone</b>
            <span>Add a person to the rolls</span>
          </div>
          <button className="x" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="mb" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="fld"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></div>
            <div className="fld"><label>Phone</label><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile" /></div>
          </div>
          <div className="fld">
            <label>Category</label>
            <div className="chiprow">
              {ROLES.map((r) => (
                <button key={r.key} className={`fchip${role === r.key ? ' on' : ''}`} onClick={() => setRole(r.key)}>{r.label}</button>
              ))}
            </div>
          </div>
          <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="fld"><label>Designation</label><input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Senior teacher · Maths" /></div>
            <div className="fld"><label>Date of joining</label><input type="date" value={doj} onChange={(e) => setDoj(e.target.value)} /></div>
          </div>
          <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="fld"><label>Basic (₹/month)</label><input type="number" min={0} value={basic} onChange={(e) => setBasic(e.target.value)} placeholder="0" /></div>
            <div className="fld"><label>Special allowance (₹)</label><input type="number" min={0} value={special} onChange={(e) => setSpecial(e.target.value)} placeholder="0" /></div>
          </div>
          {role === 'TRANSPORT' && (
            <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="fld"><label>Licence no.</label><input value={licence} onChange={(e) => setLicence(e.target.value)} placeholder="DL number" /></div>
              <div className="fld"><label>Vehicle</label><input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="TN59 AB 4412" /></div>
            </div>
          )}
          {err && <div className="state err">{err}</div>}
        </div>
        <div className="mf">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn grn" disabled={!valid || saving} onClick={save}>{saving ? 'Saving…' : 'Add to rolls'}</button>
        </div>
      </div>
    </div>
  );
}

const DOC_SET = ['Aadhaar', 'PAN', 'Qualification', 'Experience', 'Police verification', 'Licence', 'Bank passbook'];

function StaffDrawer({
  id,
  settings,
  onClose,
  onChanged,
}: {
  id: string;
  settings: PayrollSettings;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { api, can } = useApi();
  const toast = useToast();
  const emp = useAsync(() => api.staff.get(id), [id]);
  const [payOpen, setPayOpen] = useState(false);
  const e = emp.data;

  const patch = async (data: Parameters<typeof api.staff.update>[1]) => {
    await api.staff.update(id, data);
    emp.reload();
    onChanged();
  };
  const toggle = (k: 'pfEnabled' | 'esiEnabled' | 'ptEnabled') => {
    if (!e) return;
    void patch({ [k]: !e[k] } as Parameters<typeof api.staff.update>[1]);
  };
  const raise = async () => {
    await api.staff.recordRaise(id, { delta: rupeesToPaise(1000), note: 'Salary revision' });
    toast('Raise of ₹1,000 recorded');
    emp.reload();
    onChanged();
  };
  const markExit = async () => {
    await api.staff.markExit(id, {});
    toast(`${e?.name} marked as leaving`);
    onChanged();
    onClose();
  };

  const slip = e ? computePayslip({ ...e }, 0, settings) : null;

  return (
    <div className="scrim" onClick={onClose}>
      <div className="drawer" onClick={(ev) => ev.stopPropagation()}>
        {!e && <div className="state">Loading…</div>}
        {e && (
          <>
            <div className="mh">
              <div className="stu-cell">
                <span className="av lg">{initials(e.name)}</span>
                <span>
                  <b style={{ fontWeight: 700, fontSize: 17 }}>{e.name}</b>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-4)' }}>
                    {e.designation || ROLE_LABEL[e.role]} · <span className="mono">{e.code}</span>
                  </span>
                </span>
              </div>
              <button className="x" onClick={onClose}><Icon name="x" /></button>
            </div>
            <div className="mb" style={{ maxHeight: '78vh', overflowY: 'auto' }}>
              <div className="facts">
                <div><span>Category</span><b>{ROLE_LABEL[e.role]}</b></div>
                <div><span>Phone</span><b className="mono">{e.phone || '—'}</b></div>
                <div><span>Joined</span><b className="mono">{e.doj.split('-').reverse().join('/')}</b></div>
                <div><span>Leave left</span><b>{e.clBalance} CL · {e.slBalance} SL · {e.elBalance} EL</b></div>
                <div><span>This month</span><b className={e.paidThisMonth ? 'pos' : ''}>{e.paidThisMonth ? `Paid · ${MODE_LABEL[e.paidMode ?? 'BANK']}` : 'Not paid'}</b></div>
                <div><span>Advance due</span><b>{e.advance ? formatMoney(e.advance) : '—'}</b></div>
              </div>

              {e.role === 'TRANSPORT' && (e.licence || e.vehicle) && (
                <div className="drawer-card">
                  <h4 className="section">Driving</h4>
                  <div className="facts">
                    <div><span>Licence</span><b className="mono">{e.licence || '—'}</b></div>
                    <div><span>Valid till</span><b className="mono">{e.licExp ? e.licExp.split('-').reverse().join('/') : '—'}</b></div>
                    <div><span>Vehicle</span><b className="mono">{e.vehicle || '—'}</b></div>
                    <div><span>Route</span><b>{e.route || '—'}</b></div>
                  </div>
                </div>
              )}

              <div className="drawer-card">
                <h4 className="section">Salary structure</h4>
                <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="fld">
                    <label>Basic (₹)</label>
                    <input
                      type="number"
                      defaultValue={paiseToRupees(e.basic)}
                      disabled={!can('staff:write')}
                      onBlur={(ev) => void patch({ basic: rupeesToPaise(Number(ev.target.value) || 0) })}
                    />
                  </div>
                  <div className="fld">
                    <label>Special (₹)</label>
                    <input
                      type="number"
                      defaultValue={paiseToRupees(e.special)}
                      disabled={!can('staff:write')}
                      onBlur={(ev) => void patch({ special: rupeesToPaise(Number(ev.target.value) || 0) })}
                    />
                  </div>
                </div>
                {slip && (
                  <div className="paylines">
                    <div><span>DA ({settings.daPercent}%)</span><b className="mono">{formatMoney(slip.da)}</b></div>
                    <div><span>HRA ({settings.hraPercent}%)</span><b className="mono">{formatMoney(slip.hra)}</b></div>
                    <div><span>Conveyance</span><b className="mono">{formatMoney(slip.conveyance)}</b></div>
                    <div className="pl-tot"><span>Gross</span><b className="mono">{formatMoney(slip.gross)}</b></div>
                    <div><span>Deductions</span><b className="mono neg">−{formatMoney(slip.total)}</b></div>
                    <div className="pl-net"><span>Take home</span><b className="mono">{formatMoney(slip.net)}</b></div>
                  </div>
                )}
              </div>

              {can('staff:write') && (
                <div className="drawer-card">
                  <h4 className="section">Statutory &amp; recoveries</h4>
                  <div className="chiprow">
                    <button className={`fchip${e.pfEnabled ? ' on' : ''}`} onClick={() => toggle('pfEnabled')}>PF {e.pfEnabled ? '✓' : ''}</button>
                    <button className={`fchip${e.esiEnabled ? ' on' : ''}`} onClick={() => toggle('esiEnabled')}>ESI {e.esiEnabled ? '✓' : ''}</button>
                    <button className={`fchip${e.ptEnabled ? ' on' : ''}`} onClick={() => toggle('ptEnabled')}>Professional tax {e.ptEnabled ? '✓' : ''}</button>
                    <button className={`fchip${e.tds > 0 ? ' on' : ''}`} onClick={() => void patch({ tds: e.tds > 0 ? 0 : rupeesToPaise(3000) })}>TDS {e.tds > 0 ? '✓' : ''}</button>
                  </div>
                </div>
              )}

              <div className="drawer-card">
                <div className="drawer-card-h">
                  <h4 className="section" style={{ margin: 0 }}>Increments</h4>
                  {can('staff:write') && <button className="btn sm" onClick={raise}>Record a raise</button>}
                </div>
                {e.increments.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>No raises recorded.</div>}
                {e.increments.map((inc, i) => (
                  <div key={i} className="inc-row">
                    <span className="mono">{inc.date.split('-').reverse().join('/')}</span>
                    <span>{inc.note}</span>
                    <b className="mono pos">+{formatMoney(inc.delta)}</b>
                  </div>
                ))}
              </div>

              <div className="drawer-card">
                <h4 className="section">Documents</h4>
                <div className="chiprow">
                  {DOC_SET.map((d) => {
                    const have = e.docs.includes(d);
                    return (
                      <button
                        key={d}
                        className={`fchip${have ? ' on' : ''}`}
                        disabled={!can('staff:write')}
                        onClick={() => void patch({ docs: have ? e.docs.filter((x) => x !== d) : [...e.docs, d] })}
                      >
                        {d} {have ? '✓' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="mf">
              {can('staff:write') && <button className="btn" onClick={markExit}>Mark exit</button>}
              <div style={{ flex: 1 }} />
              {can('payroll:run') && !e.paidThisMonth && (
                <button className="btn grn" onClick={() => setPayOpen(true)}>Pay for {monthLabel(thisMonth())}</button>
              )}
            </div>
          </>
        )}
        {payOpen && e && (
          <PayModal
            employeeId={e.id}
            month={thisMonth()}
            settings={settings}
            onClose={() => setPayOpen(false)}
            onPaid={() => { setPayOpen(false); emp.reload(); onChanged(); }}
          />
        )}
      </div>
    </div>
  );
}

/* ============================== Pay modal ============================== */

function PayModal({
  employeeId,
  month,
  settings,
  onClose,
  onPaid,
}: {
  employeeId: string;
  month: string;
  settings: PayrollSettings;
  onClose: () => void;
  onPaid: (slip: Payslip) => void;
}) {
  const { api } = useApi();
  const toast = useToast();
  const emp = useAsync(() => api.staff.get(employeeId), [employeeId]);
  const att = useAsync(() => api.staff.attendance(month), [month]);
  const e = emp.data;

  const attLop = useMemo(() => {
    const row = (att.data?.rows ?? []).find((r) => r.employeeId === employeeId);
    return row?.absent ?? 0;
  }, [att.data, employeeId]);
  const [lopDays, setLopDays] = useState<number | null>(null);
  const lop = lopDays ?? attLop;
  const [mode, setMode] = useState<ExpenseMode>('BANK');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const slip = e ? computePayslip({ ...e }, lop, settings) : null;

  const pay = async () => {
    setSaving(true);
    setErr(null);
    try {
      const result = await api.staff.pay({ employeeId, month, lopDays: lop, mode });
      toast(`${result.employeeName} paid · ${result.payslipNo}`);
      onPaid(result);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const dedLines = slip
    ? [
        ['LOP', slip.lop],
        ['PF', slip.pf],
        ['ESI', slip.esi],
        ['Professional tax', slip.pt],
        ['TDS', slip.tds],
        ['Advance', slip.advance],
      ].filter(([, v]) => (v as number) > 0)
    : [];

  return (
    <div className="scrim" onClick={onClose} style={{ zIndex: 90 }}>
      <div className="modal" onClick={(ev) => ev.stopPropagation()} style={{ maxWidth: 600, width: '94%' }}>
        <div className="mh">
          <div>
            <b>Pay {e?.name ?? 'staff'}</b>
            <span>{monthLabel(month)} · posts to Expenses under Salaries</span>
          </div>
          <button className="x" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="mb" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          <div className="fld">
            <label>Loss-of-pay days (from attendance: {attLop})</label>
            <input type="number" min={0} max={30} value={lop} onChange={(ev) => setLopDays(Number(ev.target.value) || 0)} />
          </div>
          {slip && (
            <div className="pay-two">
              <div className="pay-col">
                <h5>Earnings</h5>
                <div><span>Basic</span><b className="mono">{formatMoney(slip.basic)}</b></div>
                <div><span>DA</span><b className="mono">{formatMoney(slip.da)}</b></div>
                <div><span>HRA</span><b className="mono">{formatMoney(slip.hra)}</b></div>
                <div><span>Conveyance</span><b className="mono">{formatMoney(slip.conveyance)}</b></div>
                {slip.special > 0 && <div><span>Special</span><b className="mono">{formatMoney(slip.special)}</b></div>}
                <div className="pl-tot"><span>Gross</span><b className="mono">{formatMoney(slip.gross)}</b></div>
              </div>
              <div className="pay-col">
                <h5>Deductions</h5>
                {dedLines.length === 0 && <div><span>None</span><b className="mono">—</b></div>}
                {dedLines.map(([label, v]) => (
                  <div key={label as string}><span>{label}</span><b className="mono neg">−{formatMoney(v as number)}</b></div>
                ))}
                <div className="pl-tot"><span>Total</span><b className="mono neg">−{formatMoney(slip.total)}</b></div>
              </div>
            </div>
          )}
          <div className="fld">
            <label>Paid by</label>
            <div className="chiprow">
              {PAY_MODES.map((m) => (
                <button key={m} className={`fchip${mode === m ? ' on' : ''}`} onClick={() => setMode(m)}>{MODE_LABEL[m]}</button>
              ))}
            </div>
          </div>
          {slip && (
            <div className="net-band">
              <span>Net payable</span>
              <b className="mono">{formatMoney(slip.net)}</b>
            </div>
          )}
          {err && <div className="state err">{err}</div>}
        </div>
        <div className="mf">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn grn" disabled={saving} onClick={pay}>{saving ? 'Paying…' : 'Pay & issue payslip'}</button>
        </div>
      </div>
    </div>
  );
}

/* ============================== Attendance ============================== */

function Attendance() {
  const { api, can } = useApi();
  const [month, setMonth] = useState(thisMonth());
  const att = useAsync(() => api.staff.attendance(month), [month]);
  const data = att.data;
  const sundays = new Set(data?.sundays ?? []);

  const cycle = async (employeeId: string, days: string, dayIdx: number) => {
    if (!can('staff:attendance')) return;
    if (sundays.has(dayIdx + 1)) return; // holidays locked
    const cur = days[dayIdx] ?? 'P';
    const next = cur === 'P' ? 'A' : cur === 'A' ? 'L' : 'P';
    const updated = days.substring(0, dayIdx) + next + days.substring(dayIdx + 1);
    await api.staff.setAttendance({ employeeId, month, days: updated });
    att.reload();
  };

  const months = [0, 1, 2].map((back) => {
    const d = new Date();
    d.setMonth(d.getMonth() - back);
    return d.toISOString().slice(0, 7);
  });

  return (
    <>
      <div className="tbar">
        <div className="chiprow">
          {months.map((m) => (
            <button key={m} className={`fchip${month === m ? ' on' : ''}`} onClick={() => setMonth(m)}>{monthLabel(m)}</button>
          ))}
        </div>
        <div className="sp" />
        <div className="att-legend">
          <span><i className="d-p" />Present</span>
          <span><i className="d-a" />Absent</span>
          <span><i className="d-l" />Leave</span>
          <span><i className="d-h" />Holiday</span>
        </div>
      </div>
      <div className="card-t" style={{ overflowX: 'auto' }}>
        <table className="att-grid">
          <thead>
            <tr>
              <th className="att-name">Staff</th>
              {Array.from({ length: data?.dayCount ?? 0 }, (_, i) => (
                <th key={i} className={`att-day${sundays.has(i + 1) ? ' sun' : ''}`}>{i + 1}</th>
              ))}
              <th className="att-tally">P/A/L</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((r) => (
              <tr key={r.employeeId}>
                <td className="att-name">
                  <b style={{ fontWeight: 600 }}>{r.employeeName}</b>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)', display: 'block' }}>{r.code}</span>
                </td>
                {Array.from({ length: data?.dayCount ?? 0 }, (_, i) => {
                  const ch = r.days[i] ?? 'P';
                  return (
                    <td
                      key={i}
                      className={`att-cell c-${ch.toLowerCase()}${sundays.has(i + 1) ? ' locked' : ''}`}
                      onClick={() => void cycle(r.employeeId, r.days, i)}
                    >
                      {ch}
                    </td>
                  );
                })}
                <td className="att-tally mono">{r.present}/{r.absent}/{r.leave}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {att.loading && <div className="state">Loading attendance…</div>}
        {!att.loading && (data?.rows.length ?? 0) === 0 && <div className="state">No active staff.</div>}
      </div>
    </>
  );
}

/* ============================== Leave ============================== */

function Leave() {
  const { api, can } = useApi();
  const toast = useToast();
  const leave = useAsync(() => api.staff.leave.list(), []);
  const staff = useAsync(() => api.staff.list({}), []);
  const rows = leave.data ?? [];
  const pending = rows.filter((r) => r.status === 'PENDING');

  const decide = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    await api.staff.leave.decide(id, { status });
    toast(`Leave ${status.toLowerCase()}`);
    leave.reload();
  };

  return (
    <div className="leave-grid">
      <div>
        <h4 className="section">Pending requests</h4>
        <div className="appr-list">
          {pending.map((r) => (
            <div key={r.id} className="appr-item">
              <div style={{ minWidth: 0, flex: 1 }}>
                <b>{r.employeeName}</b>
                <div className="submeta">{r.type} · {r.days} day{r.days === 1 ? '' : 's'} · from {r.fromDate.split('-').reverse().join('/')}{r.reason ? ` · ${r.reason}` : ''}</div>
              </div>
              {can('staff:write') && (
                <div className="rowacts">
                  <button className="btn sm grn" onClick={() => void decide(r.id, 'APPROVED')}>Approve</button>
                  <button className="btn sm" onClick={() => void decide(r.id, 'REJECTED')}>Reject</button>
                </div>
              )}
            </div>
          ))}
          {pending.length === 0 && <div className="state">No pending requests.</div>}
        </div>
      </div>
      <div>
        <h4 className="section">Leave balances</h4>
        <div className="card-t">
          <table>
            <thead><tr><th>Staff</th><th className="num">CL</th><th className="num">SL</th><th className="num">EL</th></tr></thead>
            <tbody>
              {(staff.data ?? []).map((e) => (
                <tr key={e.id}>
                  <td><b style={{ fontWeight: 600 }}>{e.name}</b></td>
                  <td className={`num mono${e.clBalance === 0 ? ' neg' : ''}`}>{e.clBalance}</td>
                  <td className={`num mono${e.slBalance === 0 ? ' neg' : ''}`}>{e.slBalance}</td>
                  <td className={`num mono${e.elBalance === 0 ? ' neg' : ''}`}>{e.elBalance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ============================== Pay staff ============================== */

function PayStaff({ settings }: { settings: PayrollSettings }) {
  const { api, can } = useApi();
  const [month, setMonth] = useState(thisMonth());
  const [payId, setPayId] = useState<string | null>(null);
  const payroll = useAsync(() => api.staff.payroll(month), [month]);
  const data = payroll.data;

  const months = [0, 1, 2].map((back) => {
    const d = new Date();
    d.setMonth(d.getMonth() - back);
    return d.toISOString().slice(0, 7);
  });

  return (
    <>
      <div className="pay-header">
        <div className="chiprow">
          {months.map((m) => (
            <button key={m} className={`dchip${month === m ? ' on' : ''}`} onClick={() => setMonth(m)}>{monthLabel(m)}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div className="pay-header-fig">
          <span>Still to pay</span>
          <b className="mono">{formatMoney(data?.stillToPay ?? 0)}</b>
        </div>
        <div className="pay-header-fig">
          <span>Paid</span>
          <b className="mono pos">{formatMoney(data?.paid ?? 0)}</b>
        </div>
      </div>
      <div className="card-t">
        <table>
          <thead>
            <tr>
              <th>Staff</th><th>Category</th><th className="num">Gross</th><th className="num">LOP</th>
              <th className="num">Deductions</th><th className="num">Net payable</th><th className="num">Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((r) => (
              <tr key={r.employeeId}>
                <td><b style={{ fontWeight: 600 }}>{r.name}</b> <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>{r.code}</span></td>
                <td><RoleChipTag role={r.role} /></td>
                <td className="num mono">{formatMoney(r.gross)}</td>
                <td className="num mono neg">{r.lop ? `−${formatMoney(r.lop)}` : '—'}</td>
                <td className="num mono neg">−{formatMoney(r.deductions)}</td>
                <td className="num mono" style={{ fontWeight: 650 }}>{formatMoney(r.net)}</td>
                <td className="num">
                  {r.paid ? (
                    <span className="tag paid"><i />Paid · {MODE_LABEL[r.mode ?? 'BANK']}</span>
                  ) : can('payroll:run') ? (
                    <button className="btn sm grn" onClick={() => setPayId(r.employeeId)}>Pay now</button>
                  ) : (
                    <span className="tag due"><i />To pay</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {payroll.loading && <div className="state">Loading…</div>}
        {!payroll.loading && (data?.rows.length ?? 0) === 0 && <div className="state">No active staff to pay.</div>}
      </div>
      {payId && (
        <PayModal
          employeeId={payId}
          month={month}
          settings={settings}
          onClose={() => setPayId(null)}
          onPaid={() => { setPayId(null); payroll.reload(); }}
        />
      )}
    </>
  );
}

/* ============================== Payslips ============================== */

function Payslips() {
  const { api } = useApi();
  const slips = useAsync(() => api.staff.payslips(), []);
  const list = slips.data ?? [];
  const [sel, setSel] = useState<Payslip | null>(null);
  const active = sel ?? list[0] ?? null;

  return (
    <div className="slip-grid">
      <div className="card-t">
        <table>
          <thead><tr><th>Staff</th><th>Payslip</th><th>Month</th><th className="num">Net</th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className={`click${active?.id === p.id ? ' sel' : ''}`} onClick={() => setSel(p)}>
                <td><b style={{ fontWeight: 600 }}>{p.employeeName}</b></td>
                <td className="mono" style={{ fontSize: 12 }}>{p.payslipNo}</td>
                <td className="mono" style={{ fontSize: 12 }}>{monthLabel(p.month)}</td>
                <td className="num mono">{formatMoney(p.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!slips.loading && list.length === 0 && <div className="state">No payslips issued yet.</div>}
      </div>
      {active && <SlipPanel p={active} />}
    </div>
  );
}

function SlipPanel({ p }: { p: Payslip }) {
  return (
    <div className="slip-panel">
      <div className="slip-h">
        <div>
          <b>Payslip · {monthLabel(p.month)}</b>
          <span className="mono">{p.payslipNo}</span>
        </div>
        <button className="btn sm" onClick={() => window.print()}><Icon name="save" size={13} />Print</button>
      </div>
      <div className="slip-meta">
        <div><span>Name</span><b>{p.employeeName}</b></div>
        <div><span>Staff code</span><b className="mono">{p.code}</b></div>
        <div><span>Designation</span><b>{p.designation || '—'}</b></div>
        <div><span>Paid on</span><b className="mono">{p.paidAt.split('-').reverse().join('/')} · {MODE_LABEL[p.mode]}</b></div>
        <div><span>Payable days</span><b>{p.payableDays} of 30</b></div>
        <div><span>Bank</span><b>On file</b></div>
      </div>
      <div className="pay-two">
        <div className="pay-col">
          <h5>Earnings</h5>
          <div><span>Basic</span><b className="mono">{formatMoney(p.basic)}</b></div>
          <div><span>DA</span><b className="mono">{formatMoney(p.da)}</b></div>
          <div><span>HRA</span><b className="mono">{formatMoney(p.hra)}</b></div>
          <div><span>Conveyance</span><b className="mono">{formatMoney(p.conveyance)}</b></div>
          {p.special > 0 && <div><span>Special</span><b className="mono">{formatMoney(p.special)}</b></div>}
          <div className="pl-tot"><span>Gross</span><b className="mono">{formatMoney(p.gross)}</b></div>
        </div>
        <div className="pay-col">
          <h5>Deductions</h5>
          {p.lop > 0 && <div><span>LOP ({p.lopDays}d)</span><b className="mono">{formatMoney(p.lop)}</b></div>}
          {p.pf > 0 && <div><span>PF</span><b className="mono">{formatMoney(p.pf)}</b></div>}
          {p.esi > 0 && <div><span>ESI</span><b className="mono">{formatMoney(p.esi)}</b></div>}
          {p.pt > 0 && <div><span>Professional tax</span><b className="mono">{formatMoney(p.pt)}</b></div>}
          {p.tds > 0 && <div><span>TDS</span><b className="mono">{formatMoney(p.tds)}</b></div>}
          {p.advanceRecovered > 0 && <div><span>Advance</span><b className="mono">{formatMoney(p.advanceRecovered)}</b></div>}
          <div className="pl-tot"><span>Total</span><b className="mono">{formatMoney(p.deductionsTotal)}</b></div>
        </div>
      </div>
      <div className="net-band">
        <div>
          <span>Net pay</span>
          <div className="slip-words">{p.amountInWords}</div>
        </div>
        <b className="mono">{formatMoney(p.net)}</b>
      </div>
    </div>
  );
}

/* ============================== Exits ============================== */

function Exits() {
  const { api, can } = useApi();
  const toast = useToast();
  const exits = useAsync(() => api.staff.exits(), []);
  const rows = exits.data ?? [];

  const settle = async (employeeId: string) => {
    await api.staff.settle(employeeId, { mode: 'BANK' });
    toast('Settlement paid');
    exits.reload();
  };

  return (
    <div className="card-t">
      <table>
        <thead>
          <tr><th>Staff</th><th>Category</th><th>Last day</th><th>Reason</th><th className="num">Settlement</th><th className="num">Status</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.employeeId}>
              <td><b style={{ fontWeight: 600 }}>{r.name}</b> <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>{r.code}</span></td>
              <td><RoleChipTag role={r.role} /></td>
              <td className="mono" style={{ fontSize: 12.5 }}>{r.lastDay ? r.lastDay.split('-').reverse().join('/') : '—'}</td>
              <td style={{ color: 'var(--ink-2)' }}>{r.reason || '—'}</td>
              <td className="num mono">
                {r.settled ? '—' : formatMoney(r.amount)}
                {!r.settled && (
                  <div className="submeta">net {formatMoney(r.lastNet)} + EL {formatMoney(r.encashment)}{r.advance ? ` − adv ${formatMoney(r.advance)}` : ''}</div>
                )}
              </td>
              <td className="num">
                {r.settled ? (
                  <span className="tag paid"><i />Settled</span>
                ) : can('payroll:run') ? (
                  <button className="btn sm grn" onClick={() => void settle(r.employeeId)}>Settle now</button>
                ) : (
                  <span className="tag due"><i />Pending</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!exits.loading && rows.length === 0 && <div className="state">No exits recorded.</div>}
    </div>
  );
}

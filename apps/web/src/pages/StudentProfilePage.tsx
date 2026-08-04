import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { formatMoney } from '@mentivax/core';
import type { Student } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { DocumentUploader } from '../components/DocumentUploader';
import { InvoiceBreakdown } from '../components/InvoiceBreakdown';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

type Tab = 'overview' | 'fees' | 'transport' | 'documents';

const STATUS: Record<Student['enrollment'], { cls: string; label: string }> = {
  ACTIVE: { cls: 'paid', label: 'Active' },
  APPLICANT: { cls: 'due', label: 'Applicant' },
  TC_ISSUED: { cls: 'old', label: 'TC issued' },
  ALUMNI: { cls: 'old', label: 'Alumni' },
};
const initials = (n: string) => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const dmy = (iso?: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

export function StudentProfilePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { api, hasModule } = useApi();
  const student = useAsync(() => api.students.get(id), [id]);
  const [tab, setTab] = useState<Tab>('overview');
  const s = student.data;

  if (student.loading) return <div className="state">Loading…</div>;
  if (!s) return <div className="state err">Student not found.</div>;

  const st = STATUS[s.enrollment] ?? STATUS.ACTIVE;
  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'fees', label: 'Fees' },
    { key: 'transport', label: 'Transport' },
    { key: 'documents', label: 'Documents' },
  ];

  return (
    <div className="stu-profile">
      <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/students')}>
        <Icon name="arrowLeft" size={14} /> All students
      </button>

      <div className="prof-card">
        <div className="prof-head">
          <span className="prof-ava">{initials(s.name)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="prof-name">
              {s.name} <span className={`tag ${st.cls}`}><i />{st.label}</span>
            </div>
            <div className="prof-meta">
              <span className="mono">{s.admissionNo || '—'}</span> · {s.className}
              {s.dateOfBirth ? ` · born ${dmy(s.dateOfBirth)}` : ''}
            </div>
          </div>
          {hasModule('fees') && (
            <button className="btn grn" onClick={() => navigate('/invoices')}>Open in Fees →</button>
          )}
        </div>

        <div className="prof-snapshot">
          <div><span>Class</span><b>{s.className}</b></div>
          <div><span>Guardian</span><b>{s.parentName || '—'}</b><small>{s.phone || ''}</small></div>
          <div><span>Fee due</span><b style={{ color: s.pending > 0 ? 'var(--red-fig)' : 'var(--success-ink)' }}>{formatMoney(s.pending)}</b><small>this year</small></div>
          <div><span>Transport</span><b>{s.transportStopName ?? 'Walks'}</b></div>
          <div><span>Documents</span><b>{s.documents.length} on file</b></div>
        </div>

        <div className="prof-tabs">
          <div className="subtabs">
            {TABS.map((t) => (
              <button key={t.key} className={`subtab${tab === t.key ? ' on' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>
        </div>

        <div className="prof-body">
          {tab === 'overview' && <Overview s={s} />}
          {tab === 'fees' && <FeesTab studentId={s.id} pending={s.pending} paid={s.paid} annual={s.annualFee} />}
          {tab === 'transport' && <TransportTab s={s} />}
          {tab === 'documents' && <DocumentUploader studentId={s.id} />}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="prof-row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function Overview({ s }: { s: Student }) {
  const ADM = { NEW: 'New admission', TRANSFER: 'Transfer', READMISSION: 'Re-admission' } as const;
  return (
    <div className="prof-cols">
      <div>
        <h4 className="prof-eyebrow">Student record</h4>
        <Row label="Admission number" value={<span className="mono">{s.admissionNo || '—'}</span>} />
        <Row label="EMIS number" value={<span className="mono">{s.emisNo || '—'}</span>} />
        <Row label="PEN / APAAR" value={<span className="mono">{s.penNo || '—'}</span>} />
        <Row label="Aadhaar" value={<span className="mono">{s.aadhaar || '—'}</span>} />
        <Row label="Date of birth" value={dmy(s.dateOfBirth)} />
        <Row label="Admission type" value={ADM[s.admissionType]} />
        <Row label="Left the school" value={s.exitDate ? `${dmy(s.exitDate)}${s.exitReason ? ` · ${s.exitReason}` : ''}` : '—'} />
        <Row label="Student status" value={STATUS[s.enrollment]?.label ?? s.enrollment} />
      </div>
      <div>
        <h4 className="prof-eyebrow">Guardian</h4>
        <Row label="Name" value={s.parentName || '—'} />
        <Row label="Relationship" value={s.guardianRelation || '—'} />
        <Row label="Phone" value={<span className="mono">{s.phone || '—'}</span>} />
        <div className="prof-note">More detail (address, medical, siblings) can be added as the record grows.</div>
      </div>
    </div>
  );
}

function FeesTab({ studentId, pending, paid, annual }: { studentId: string; pending: number; paid: number; annual: number }) {
  const { api } = useApi();
  const invoices = useAsync(() => api.invoices.list(), []);
  const mine = (invoices.data ?? []).filter((i) => i.studentId === studentId);
  const details = useAsync(
    () => Promise.all(mine.map((i) => api.invoices.get(i.id))),
    [invoices.data?.length],
  );

  return (
    <>
      <div className="acct-cards" style={{ marginBottom: 14 }}>
        <div className="acct-card"><div className="acct-label">Invoiced</div><div className="acct-bal mono">{formatMoney(annual)}</div></div>
        <div className="acct-card"><div className="acct-label">Collected</div><div className="acct-bal mono pos">{formatMoney(paid)}</div></div>
        <div className="acct-card"><div className="acct-label">Pending</div><div className="acct-bal mono" style={{ color: pending > 0 ? 'var(--red-fig)' : 'var(--success-ink)' }}>{formatMoney(pending)}</div></div>
      </div>
      {(details.data ?? []).map((inv) => (
        <div key={inv.id} style={{ marginBottom: 16 }}>
          <div className="inv-meta" style={{ marginBottom: 4 }}>
            <span className="mono" style={{ fontWeight: 600 }}>{inv.number}</span>
            <span className="cls">{inv.className}</span>
          </div>
          <InvoiceBreakdown invoice={inv} />
        </div>
      ))}
      {!details.loading && mine.length === 0 && <div className="state">No invoices for this student yet.</div>}
    </>
  );
}

function TransportTab({ s }: { s: Student }) {
  if (!s.transportStopName) return <div className="state">This student walks to school — no transport assigned.</div>;
  const shift = s.transportShift === 'BOTH' ? 'Both ways' : s.transportShift === 'MORNING' ? 'Morning only' : 'Evening only';
  return (
    <div className="acct-cards">
      <div className="acct-card"><div className="acct-label">Route · Stop</div><div className="acct-bal" style={{ fontSize: 17 }}>{s.transportStopName}</div></div>
      {s.transportLandmark && <div className="acct-card"><div className="acct-label">Pickup point</div><div className="acct-bal" style={{ fontSize: 17 }}>{s.transportLandmark}</div></div>}
      <div className="acct-card"><div className="acct-label">Trips</div><div className="acct-bal" style={{ fontSize: 17 }}>{shift}</div></div>
    </div>
  );
}

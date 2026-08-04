import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

const dmy = (iso?: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

export function AlumniPage() {
  const { api } = useApi();
  const alumni = useAsync(() => api.students.list({ enrollment: 'ALUMNI' }), []);
  const list = alumni.data ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Alumni</h1>
          <div className="sub">Students who have left the school</div>
        </div>
      </div>

      <div className="acct-cards students-stats">
        <div className="acct-card">
          <div className="acct-label">Alumni on record</div>
          <div className="acct-bal mono">{list.length}</div>
          <div className="acct-note">past students</div>
        </div>
      </div>

      <div className="card-t" style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Last class</th>
              <th>Admission no</th>
              <th>Left on</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="stu-cell">
                    <span className="av">{s.name[0]}</span>
                    <b style={{ fontWeight: 600 }}>{s.name}</b>
                  </div>
                </td>
                <td><span className="cls">{s.className}</span></td>
                <td className="mono" style={{ fontSize: 12.5 }}>{s.admissionNo || '—'}</td>
                <td className="mono" style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{dmy(s.exitDate)}</td>
                <td style={{ color: 'var(--ink-3)' }}>{s.exitReason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {alumni.loading && <div className="state">Loading…</div>}
        {!alumni.loading && list.length === 0 && (
          <div className="state">No alumni yet — students appear here after a year rollover or when marked as left.</div>
        )}
      </div>
    </>
  );
}

import { useState } from 'react';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

export function YearRolloverPage() {
  const { api, can } = useApi();
  const toast = useToast();
  const preview = useAsync(() => api.students.rolloverPreview(), []);
  const [confirm, setConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const rows = preview.data ?? [];
  const totalPromote = rows.filter((r) => r.nextClassId).reduce((n, r) => n + r.count, 0);
  const totalGraduate = rows.filter((r) => !r.nextClassId).reduce((n, r) => n + r.count, 0);

  const run = async () => {
    setRunning(true);
    try {
      const res = await api.students.rollover();
      toast(`${res.promoted} promoted · ${res.graduated} graduated to alumni`);
      setConfirm(false);
      preview.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Rollover failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Year rollover</h1>
          <div className="sub">Promote every active student one standard up; the final standard graduates to alumni</div>
        </div>
        {can('students:write') && rows.length > 0 && (
          <button className="btn grn" onClick={() => setConfirm(true)} disabled={totalPromote + totalGraduate === 0}>
            <Icon name="arrowRight" size={15} />
            Promote {totalPromote + totalGraduate} students
          </button>
        )}
      </div>

      <div className="acct-cards students-stats">
        <div className="acct-card">
          <div className="acct-label">To be promoted</div>
          <div className="acct-bal mono" style={{ color: 'var(--blue)' }}>{totalPromote}</div>
          <div className="acct-note">move up one standard</div>
        </div>
        <div className="acct-card">
          <div className="acct-label">Graduating</div>
          <div className="acct-bal mono pos">{totalGraduate}</div>
          <div className="acct-note">become alumni</div>
        </div>
      </div>

      <div className="card-t">
        <table>
          <thead>
            <tr>
              <th>Standard</th>
              <th className="num">Students</th>
              <th>Moves to</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.classId}>
                <td><b style={{ fontWeight: 600 }}>{r.className}</b></td>
                <td className="num mono">{r.count}</td>
                <td>
                  {r.nextClassName ? (
                    <span><Icon name="arrowRight" size={13} /> {r.nextClassName}</span>
                  ) : (
                    <span className="tag paid"><i />Graduates → Alumni</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {preview.loading && <div className="state">Loading…</div>}
        {!preview.loading && rows.length === 0 && <div className="state">No standards configured — set them up in School Setup.</div>}
      </div>

      {confirm && (
        <div className="scrim" onClick={() => setConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: '94%' }}>
            <div className="mh">
              <div>
                <b>Promote all students?</b>
                <span>This moves everyone up a standard and cannot be undone in one click.</span>
              </div>
              <button className="x" onClick={() => setConfirm(false)}><Icon name="x" /></button>
            </div>
            <div className="mb">
              <div className="paylines">
                <div><span>Promoted one standard</span><b className="mono">{totalPromote}</b></div>
                <div><span>Graduated to alumni</span><b className="mono">{totalGraduate}</b></div>
              </div>
            </div>
            <div className="mf">
              <button className="btn" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="btn grn" disabled={running} onClick={run}>{running ? 'Promoting…' : 'Yes, promote all'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

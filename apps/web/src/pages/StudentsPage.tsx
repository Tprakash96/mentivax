import { useState } from 'react';
import { formatMoney } from '@mentivax/core';
import type { Student } from '@mentivax/api-client';
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

  const { data, loading, error } = useAsync(
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
        <button className="btn grn" onClick={() => toast('New admission — 4 fields, fee plan auto-assigned by class')}>
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
    </>
  );
}

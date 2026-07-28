import { useState } from 'react';
import type { SchoolClass } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

/** Standards (internally SchoolClass) — a compact row list; click a row for details. */
export function StandardsPage() {
  const { api } = useApi();
  const toast = useToast();
  const classes = useAsync(() => api.classes.list(), []);
  const list = classes.data ?? [];

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [detail, setDetail] = useState<SchoolClass | null>(null);

  const create = async () => {
    const name = newName.trim();
    if (!name) return setAdding(false);
    try {
      await api.classes.create({ name });
      setNewName('');
      setAdding(false);
      classes.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not add standard');
    }
  };

  const rename = async (c: SchoolClass) => {
    const name = renameVal.trim();
    setRenaming(null);
    if (!name || name === c.name) return;
    try {
      await api.classes.update(c.id, { name });
      classes.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not rename');
    }
  };

  const remove = async (c: SchoolClass) => {
    if (!confirm(`Delete "${c.name}"? Its fee amounts will be removed.`)) return;
    try {
      await api.classes.remove(c.id);
      classes.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not delete');
    }
  };

  return (
    <>
      <div className="tbar">
        <span className="muted" style={{ fontSize: 13 }}>
          {list.length} standard{list.length === 1 ? '' : 's'}
        </span>
        <div className="sp" />
        <button className="btn grn" onClick={() => setAdding(true)}>
          <Icon name="plus" size={15} />
          Add standard
        </button>
      </div>

      <div className="std-list">
        {list.map((c) =>
          renaming === c.id ? (
            <div className="std-row" key={c.id}>
              <input
                className="std-rowinput"
                autoFocus
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onBlur={() => rename(c)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') rename(c);
                  if (e.key === 'Escape') setRenaming(null);
                }}
              />
            </div>
          ) : (
            <div className="std-row click" key={c.id} onClick={() => setDetail(c)}>
              <b className="std-rname">{c.name}</b>
              <span className="std-rcount">
                {c.studentCount ?? 0} student{(c.studentCount ?? 0) === 1 ? '' : 's'}
              </span>
              <div className="std-racts">
                <button
                  title="Rename"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenaming(c.id);
                    setRenameVal(c.name);
                  }}
                >
                  <Icon name="pencil" size={14} />
                </button>
                <button
                  className="del"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(c);
                  }}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
              <Icon name="chevron" size={14} style={{ transform: 'rotate(-90deg)', color: 'var(--ink-3)' }} />
            </div>
          ),
        )}

        {adding && (
          <div className="std-row">
            <input
              className="std-rowinput"
              autoFocus
              placeholder="Standard name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={create}
              onKeyDown={(e) => {
                if (e.key === 'Enter') create();
                if (e.key === 'Escape') {
                  setAdding(false);
                  setNewName('');
                }
              }}
            />
          </div>
        )}

        {!adding && (
          <button className="std-addrow" onClick={() => setAdding(true)}>
            <Icon name="plus" size={14} /> Add standard
          </button>
        )}

        {classes.loading && <div className="state">Loading…</div>}
        {classes.error && <div className="state err">{classes.error}</div>}
      </div>

      {detail && <StandardDetailModal cls={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

/** Details of one standard: the students assigned to it. */
function StandardDetailModal({ cls, onClose }: { cls: SchoolClass; onClose: () => void }) {
  const { api } = useApi();
  const students = useAsync(() => api.students.list({ classId: cls.id }), [cls.id]);
  const roster = students.data ?? [];

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: '92%' }}>
        <div className="mh">
          <div>
            <b>{cls.name}</b>
            <span>
              {cls.studentCount ?? 0} student{(cls.studentCount ?? 0) === 1 ? '' : 's'}
            </span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb" style={{ maxHeight: '66vh', overflowY: 'auto' }}>
          {students.loading && <div className="state">Loading…</div>}
          {students.error && <div className="state err">{students.error}</div>}
          {!students.loading && roster.length === 0 && (
            <div className="muted" style={{ padding: '4px 0' }}>No students in this standard yet.</div>
          )}
          {roster.length > 0 && (
            <ol className="std-names">
              {roster.map((s) => (
                <li key={s.id}>{s.name}</li>
              ))}
            </ol>
          )}
        </div>
        <div className="mf">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

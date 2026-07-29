import { useMemo, useState } from 'react';
import { ApiError, type PermissionCatalog, type RoleView } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useToast } from '../components/Toast';

/**
 * Roles and their permission grants.
 *
 * Built-in roles are read-only: they are provisioned from the code catalog and
 * kept in sync as new permissions ship. Schools that need something different
 * create a custom role instead.
 */
export function RolesPage() {
  const { api, can, refreshSession } = useApi();
  const toast = useToast();
  const roles = useAsync(() => api.roles.list(), []);
  const catalog = useAsync(() => api.roles.permissions(), []);

  const [editing, setEditing] = useState<RoleView | null>(null);
  const [creating, setCreating] = useState(false);
  const canWrite = can('roles:write');

  if (roles.loading || catalog.loading) return <div className="muted">Loading roles…</div>;
  if (roles.error) return <div className="pending-red">{roles.error}</div>;

  const list = roles.data ?? [];

  return (
    <>
      <div className="tbar">
        <div className="muted">
          {list.length} roles · built-in roles update automatically as new features ship
        </div>
        <div style={{ flex: 1 }} />
        {canWrite && (
          <button className="btn grn" onClick={() => setCreating(true)}>
            <Icon name="plus" size={15} />
            NEW ROLE
          </button>
        )}
      </div>

      <div className="rolegrid">
        {list.map((r) => (
          <div key={r.id} className="rolecard">
            <div className="rolecard-h">
              <b>{r.name}</b>
              {r.isSystem ? (
                <span className="tag">Built-in</span>
              ) : (
                <span className="tag new">Custom</span>
              )}
            </div>
            <p className="rolecard-d">{r.description ?? 'No description.'}</p>
            <div className="rolecard-m">
              <span>
                <Icon name="lock" size={13} /> {r.permissions.length} permissions
              </span>
              <span>
                <Icon name="users" size={13} /> {r.memberCount}{' '}
                {r.memberCount === 1 ? 'member' : 'members'}
              </span>
            </div>
            <div className="rolecard-f">
              <button className="btn sm ghost" onClick={() => setEditing(r)}>
                {r.isSystem || !canWrite ? 'View permissions' : 'Edit'}
              </button>
              {canWrite && !r.isSystem && (
                <button
                  className="btn sm ghost"
                  title="Delete role"
                  onClick={async () => {
                    if (!confirm(`Delete the "${r.name}" role?`)) return;
                    try {
                      await api.roles.remove(r.id);
                      roles.reload();
                      toast('Role deleted');
                    } catch (e) {
                      toast(e instanceof ApiError ? e.message : 'Could not delete this role');
                    }
                  }}
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {(editing || creating) && catalog.data && (
        <RoleEditor
          role={editing}
          catalog={catalog.data}
          readOnly={!canWrite || (editing?.isSystem ?? false)}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onDone={async (message) => {
            setEditing(null);
            setCreating(false);
            roles.reload();
            // Editing a role you hold changes your own nav; re-read the session.
            await refreshSession();
            toast(message);
          }}
        />
      )}
    </>
  );
}

function RoleEditor({
  role,
  catalog,
  readOnly,
  onClose,
  onDone,
}: {
  role: RoleView | null;
  catalog: PermissionCatalog;
  readOnly: boolean;
  onClose: () => void;
  onDone: (message: string) => void | Promise<void>;
}) {
  const { api } = useApi();
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const total = useMemo(
    () => catalog.groups.reduce((n, g) => n + g.permissions.length, 0),
    [catalog],
  );

  const toggle = (key: string) => {
    if (readOnly) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleGroup = (keys: string[], on: boolean) => {
    if (readOnly) return;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  };

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      const permissions = [...selected];
      if (role) {
        await api.roles.update(role.id, { name, description, permissions });
        await onDone('Role updated');
      } else {
        await api.roles.create({ name, description, permissions });
        await onDone('Role created');
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save this role');
      setBusy(false);
    }
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" style={{ width: 'min(680px, 95vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div>
            <b>{role ? role.name : 'New role'}</b>
            <span>
              {readOnly
                ? 'Built-in roles are managed by Mentivax and cannot be edited.'
                : `${selected.size} of ${total} permissions selected`}
            </span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="mb">
          {!readOnly && (
            <div className="frow">
              <div className="fld">
                <label>Role name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Front Office"
                  autoFocus
                />
              </div>
              <div className="fld">
                <label>Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this role is for"
                />
              </div>
            </div>
          )}

          {catalog.groups.map((g) => {
            const keys = g.permissions.map((p) => p.key);
            const allOn = keys.every((k) => selected.has(k));
            return (
              <div key={g.group} className="permgroup">
                <div className="permgroup-h">
                  <b>{g.group}</b>
                  {!readOnly && (
                    <button className="linkbtn" onClick={() => toggleGroup(keys, !allOn)}>
                      {allOn ? 'Clear all' : 'Select all'}
                    </button>
                  )}
                </div>
                {g.permissions.map((p) => (
                  <label
                    key={p.key}
                    className={`permrow${selected.has(p.key) ? ' on' : ''}${readOnly ? ' ro' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(p.key)}
                      disabled={readOnly}
                      onChange={() => toggle(p.key)}
                    />
                    <span>
                      <b>{p.name}</b>
                      <em>{p.description}</em>
                    </span>
                  </label>
                ))}
              </div>
            );
          })}

          {catalog.unavailable.length > 0 && (
            <div className="note">
              {catalog.unavailable.length} further permissions belong to modules this school hasn’t
              enabled, so they’re hidden. Enable the module to grant them.
            </div>
          )}

          {err && <div className="auth-err">{err}</div>}
        </div>

        <div className="mf">
          <button className="btn ghost" onClick={onClose}>
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {!readOnly && (
            <button className="btn grn" disabled={busy || name.trim().length < 2} onClick={() => void submit()}>
              {busy ? 'Saving…' : role ? 'Save changes' : 'Create role'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

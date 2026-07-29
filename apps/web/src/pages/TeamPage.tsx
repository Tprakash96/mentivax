import { useState } from 'react';
import { ApiError, type Member, type RoleView } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useToast } from '../components/Toast';

/**
 * Staff accounts for the active school. Owners and admins add colleagues here
 * and choose which role each one holds.
 */
export function TeamPage() {
  const { api, can, refreshSession, session } = useApi();
  const toast = useToast();
  const members = useAsync(() => api.members.list(), []);
  const roles = useAsync(() => (can('roles:read') ? api.roles.list() : Promise.resolve([])), []);

  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<Member | null>(null);
  const canWrite = can('members:write');

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      members.reload();
      toast(ok);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Something went wrong');
    }
  }

  async function changeRole(m: Member, roleId: string) {
    if (roleId === m.roleId) return;
    await run(() => api.members.update(m.id, { roleId }), `${m.name} is now ${roleLabel(roles.data, roleId)}`);
    // Changing your own role changes your own permissions — reload the session
    // so the navigation reflects it immediately.
    if (m.userId === session?.user.id) await refreshSession();
  }

  if (members.loading) return <div className="muted">Loading team…</div>;
  if (members.error) return <div className="pending-red">{members.error}</div>;

  const rows = members.data ?? [];

  return (
    <>
      <div className="tbar">
        <div className="muted">
          {rows.length} {rows.length === 1 ? 'person' : 'people'} can access this school
        </div>
        <div style={{ flex: 1 }} />
        {canWrite && (
          <button className="btn grn" onClick={() => setAdding(true)}>
            <Icon name="plus" size={15} />
            ADD MEMBER
          </button>
        )}
      </div>

      <div className="card-t">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Last sign-in</th>
              <th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>
                  <b>{m.name}</b>
                  {m.isSelf && <span className="tag" style={{ marginLeft: 8 }}>You</span>}
                  {!m.isActive && <span className="inactive-tag">Deactivated</span>}
                </td>
                <td className="muted">{m.email}</td>
                <td>
                  {canWrite && !m.isSelf && roles.data?.length ? (
                    <select
                      className="team-role"
                      value={m.roleId}
                      onChange={(e) => void changeRole(m, e.target.value)}
                    >
                      {roles.data.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="tag">{m.roleName}</span>
                  )}
                </td>
                <td className="muted">
                  {m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleDateString() : 'Never'}
                </td>
                <td className="num">
                  {canWrite && !m.isSelf && (
                    <div className="rowacts">
                      <button
                        className="btn sm ghost"
                        title="Reset password"
                        onClick={() => setResetting(m)}
                      >
                        <Icon name="lock" size={14} />
                      </button>
                      <button
                        className="btn sm ghost"
                        title="Remove from school"
                        onClick={() => {
                          if (confirm(`Remove ${m.name} from this school? Their account stays active.`)) {
                            void run(() => api.members.remove(m.id), `${m.name} removed`);
                          }
                        }}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 30 }}>
                  Nobody here yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {adding && (
        <AddMemberModal
          roles={roles.data ?? []}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            members.reload();
            toast('Member added');
          }}
        />
      )}

      {resetting && (
        <ResetPasswordModal
          member={resetting}
          onClose={() => setResetting(null)}
          onDone={() => {
            setResetting(null);
            toast('Password reset');
          }}
        />
      )}
    </>
  );
}

const roleLabel = (roles: RoleView[] | null, id: string) =>
  roles?.find((r) => r.id === id)?.name ?? 'updated';

function AddMemberModal({
  roles,
  onClose,
  onDone,
}: {
  roles: RoleView[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { api } = useApi();
  // Default to the least privileged role so a mis-click can't over-grant.
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState(roles.find((r) => r.key === 'teacher')?.id ?? roles[0]?.id ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      await api.members.create({ name, email, password: password || undefined, roleId });
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not add this member');
      setBusy(false);
    }
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div>
            <b>Add a team member</b>
            <span>They will be able to sign in to this school right away.</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="mb">
          <div className="frow">
            <div className="fld">
              <label>Full name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="fld">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@school.edu"
              />
            </div>
          </div>
          <div className="frow">
            <div className="fld">
              <label>Initial password</label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <div className="fld">
              <label>Role</label>
              <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="note">
            Leave the password blank if this email already has a Mentivax account — it will be
            attached to this school instead of creating a second one.
          </div>
          {err && <div className="auth-err">{err}</div>}
        </div>
        <div className="mf">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn grn" disabled={busy || !name || !email || !roleId} onClick={() => void submit()}>
            {busy ? 'Adding…' : 'Add member'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordModal({
  member,
  onClose,
  onDone,
}: {
  member: Member;
  onClose: () => void;
  onDone: () => void;
}) {
  const { api } = useApi();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      await api.members.resetPassword(member.id, pw);
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not reset the password');
      setBusy(false);
    }
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" style={{ width: 'min(420px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div>
            <b>Reset password</b>
            <span>{member.name} will be signed out everywhere.</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="mb">
          <div className="fld">
            <label>New password</label>
            <input
              type="text"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="At least 8 characters"
              autoFocus
            />
          </div>
          {err && <div className="auth-err">{err}</div>}
        </div>
        <div className="mf">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn grn" disabled={busy || pw.length < 8} onClick={() => void submit()}>
            {busy ? 'Resetting…' : 'Reset password'}
          </button>
        </div>
      </div>
    </div>
  );
}

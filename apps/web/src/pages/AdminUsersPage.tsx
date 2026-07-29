import { useState } from 'react';
import { ApiError } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useToast } from '../components/Toast';

/**
 * Every account on the platform, across all tenants. Suspending here is a
 * platform-wide kill switch — it revokes live sessions as well as future
 * sign-ins, in every school the person belongs to.
 */
export function AdminUsersPage() {
  const { api, session } = useApi();
  const toast = useToast();
  const users = useAsync(() => api.admin.users.list(), []);
  const [search, setSearch] = useState('');

  if (users.loading) return <div className="muted">Loading users…</div>;
  if (users.error) return <div className="pending-red">{users.error}</div>;

  const term = search.trim().toLowerCase();
  const list = (users.data ?? []).filter(
    (u) => !term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term),
  );

  return (
    <>
      <div className="tbar">
        <div className="search">
          <Icon name="search" size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email…"
          />
        </div>
        <div style={{ flex: 1 }} />
        <div className="muted">{list.length} accounts</div>
      </div>

      <div className="card-t">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Schools</th>
              <th>Last sign-in</th>
              <th>Status</th>
              <th style={{ width: 70 }} />
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id}>
                <td>
                  <b>{u.name}</b>
                  {u.isPlatformAdmin && (
                    <span className="tag new" style={{ marginLeft: 8 }}>
                      Platform
                    </span>
                  )}
                </td>
                <td className="muted">{u.email}</td>
                <td>
                  <div className="modchips">
                    {u.organizations.map((o) => (
                      <span key={o.organizationId} className="fs-chip" title={`${o.roleName} at ${o.name}`}>
                        {o.shortCode} · {o.roleName}
                      </span>
                    ))}
                    {u.organizations.length === 0 && <span className="muted">None</span>}
                  </div>
                </td>
                <td className="muted">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}
                </td>
                <td>
                  {u.isActive ? (
                    <span className="tag paid">Active</span>
                  ) : (
                    <span className="tag due">Suspended</span>
                  )}
                </td>
                <td className="num">
                  {u.id !== session?.user.id && (
                    <button
                      className="btn sm ghost"
                      title={u.isActive ? 'Suspend account' : 'Restore account'}
                      onClick={async () => {
                        const next = !u.isActive;
                        if (!next && !confirm(`Suspend ${u.name}? They will be signed out everywhere.`))
                          return;
                        try {
                          await api.admin.users.setActive(u.id, next);
                          users.reload();
                          toast(next ? 'Account restored' : 'Account suspended');
                        } catch (e) {
                          toast(e instanceof ApiError ? e.message : 'Could not update this account');
                        }
                      }}
                    >
                      <Icon name={u.isActive ? 'ban' : 'check'} size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 30 }}>
                  No accounts match that search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

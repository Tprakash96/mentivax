import { useState } from 'react';
import { ApiError, type AdminOrgSummary, type ModuleView } from '@mentivax/api-client';
import { MODULES, MODULE_MAP } from '@mentivax/core';
import { Icon } from '../components/Icon';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useToast } from '../components/Toast';

/**
 * The SaaS-operator tenant list: every school on the platform, what each has
 * bought, and the form that provisions a new one.
 */
export function AdminOrganizationsPage() {
  const { api } = useApi();
  const toast = useToast();
  const orgs = useAsync(() => api.admin.organizations.list(), []);
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState<AdminOrgSummary | null>(null);

  if (orgs.loading) return <div className="muted">Loading organizations…</div>;
  if (orgs.error) return <div className="pending-red">{orgs.error}</div>;

  const list = orgs.data ?? [];

  return (
    <>
      <div className="tbar">
        <div className="muted">
          {list.length} {list.length === 1 ? 'school' : 'schools'} ·{' '}
          {list.reduce((n, o) => n + o.studentCount, 0)} students in total
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn grn" onClick={() => setCreating(true)}>
          <Icon name="plus" size={15} />
          NEW ORGANIZATION
        </button>
      </div>

      <div className="card-t">
        <table>
          <thead>
            <tr>
              <th>School</th>
              <th>Year</th>
              <th className="num">Students</th>
              <th className="num">Team</th>
              <th>Modules</th>
              <th>Status</th>
              <th style={{ width: 110 }} />
            </tr>
          </thead>
          <tbody>
            {list.map((o) => (
              <tr key={o.id}>
                <td>
                  <div className="stu-cell">
                    <span className="ob sm">{o.shortCode}</span>
                    <div>
                      <b>{o.name}</b>
                      <span className="muted">/{o.slug}</span>
                    </div>
                  </div>
                </td>
                <td className="muted">{o.activeYear ?? '—'}</td>
                <td className="num">{o.studentCount}</td>
                <td className="num">{o.memberCount}</td>
                <td>
                  <div className="modchips">
                    {o.modules
                      .filter((k) => !MODULE_MAP[k]?.core)
                      .map((k) => (
                        <span key={k} className="fs-chip">
                          {MODULE_MAP[k]?.name ?? k}
                        </span>
                      ))}
                    {o.modules.filter((k) => !MODULE_MAP[k]?.core).length === 0 && (
                      <span className="muted">Core only</span>
                    )}
                  </div>
                </td>
                <td>
                  {o.isActive ? (
                    <span className="tag paid">Active</span>
                  ) : (
                    <span className="tag due">Suspended</span>
                  )}
                </td>
                <td className="num">
                  <div className="rowacts">
                    <button className="btn sm ghost" onClick={() => setManaging(o)}>
                      Modules
                    </button>
                    <button
                      className="btn sm ghost"
                      title={o.isActive ? 'Suspend' : 'Restore'}
                      onClick={async () => {
                        const next = !o.isActive;
                        if (
                          !next &&
                          !confirm(`Suspend ${o.name}? Nobody there will be able to sign in.`)
                        )
                          return;
                        try {
                          await api.admin.organizations.update(o.id, { isActive: next });
                          orgs.reload();
                          toast(next ? 'Organization restored' : 'Organization suspended');
                        } catch (e) {
                          toast(e instanceof ApiError ? e.message : 'Could not update');
                        }
                      }}
                    >
                      <Icon name={o.isActive ? 'ban' : 'check'} size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 30 }}>
                  No schools yet. Create the first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <CreateOrgModal
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            orgs.reload();
            toast('Organization created');
          }}
        />
      )}

      {managing && (
        <OrgModulesModal
          org={managing}
          onClose={() => {
            setManaging(null);
            orgs.reload();
          }}
        />
      )}
    </>
  );
}

/** Provisioning form: school details, first owner, first year, modules. */
function CreateOrgModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { api } = useApi();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [shortCode, setShortCode] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [yearLabel, setYearLabel] = useState('2026-27');
  const [startDate, setStartDate] = useState('2026-06-01');
  const [endDate, setEndDate] = useState('2027-04-30');
  const [modules, setModules] = useState<Set<string>>(new Set(['fees']));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Derive the slug and badge from the name until the operator overrides them.
  function onName(v: string) {
    setName(v);
    if (!slugTouched) {
      setSlug(
        v
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, ''),
      );
    }
    if (!shortCode) {
      const initials = v
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('');
      if (initials) setShortCode(initials);
    }
  }

  function toggleModule(key: string) {
    setModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        // Drop anything that depended on it, so the request stays consistent.
        for (const m of MODULES) if (m.dependsOn.includes(key)) next.delete(m.key);
      } else {
        next.add(key);
        for (const dep of MODULE_MAP[key]?.dependsOn ?? []) {
          if (!MODULE_MAP[dep]?.core) next.add(dep);
        }
      }
      return next;
    });
  }

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      await api.admin.organizations.create({
        name,
        slug,
        shortCode,
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        modules: [...modules],
        owner: { name: ownerName, email: ownerEmail, password: ownerPassword },
        academicYear: { label: yearLabel, startDate, endDate },
      });
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not create this organization');
      setBusy(false);
    }
  }

  const valid =
    name.trim().length > 1 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) &&
    shortCode.trim().length > 0 &&
    ownerName.trim().length > 0 &&
    /.+@.+\..+/.test(ownerEmail) &&
    ownerPassword.length >= 8 &&
    yearLabel.trim().length > 0;

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" style={{ width: 'min(680px, 95vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div>
            <b>New organization</b>
            <span>Creates the school, its roles, its first academic year, and an owner login.</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="mb">
          <div className="panel" style={{ margin: 0 }}>
            <h4>School</h4>
            <div className="ph">How the school is identified across the platform.</div>
            <div className="frow">
              <div className="fld">
                <label>Name</label>
                <input value={name} onChange={(e) => onName(e.target.value)} autoFocus placeholder="Agaram Global School" />
              </div>
              <div className="fld">
                <label>Slug</label>
                <input
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value);
                  }}
                  placeholder="agaram-global"
                />
              </div>
              <div className="fld">
                <label>Badge</label>
                <input
                  value={shortCode}
                  maxLength={6}
                  onChange={(e) => setShortCode(e.target.value.toUpperCase())}
                  placeholder="AG"
                />
              </div>
            </div>
          </div>

          <div className="panel" style={{ margin: 0 }}>
            <h4>Owner account</h4>
            <div className="ph">
              The first login. If this email already exists, that account is attached instead.
            </div>
            <div className="frow">
              <div className="fld">
                <label>Full name</label>
                <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
              </div>
              <div className="fld">
                <label>Email</label>
                <input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
              </div>
              <div className="fld">
                <label>Password</label>
                <input
                  type="text"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  placeholder="Min 8 characters"
                />
              </div>
            </div>
          </div>

          <div className="panel" style={{ margin: 0 }}>
            <h4>First academic year</h4>
            <div className="ph">Fees and classes are scoped to a year, so one is required.</div>
            <div className="frow">
              <div className="fld">
                <label>Label</label>
                <input value={yearLabel} onChange={(e) => setYearLabel(e.target.value)} />
              </div>
              <div className="fld">
                <label>Starts</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="fld">
                <label>Ends</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="panel" style={{ margin: 0 }}>
            <h4>Modules</h4>
            <div className="ph">What this school is buying. Core modules are always included.</div>
            <div className="modpick">
              {MODULES.filter((m) => !m.core).map((m) => (
                <label key={m.key} className={`permrow${modules.has(m.key) ? ' on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={modules.has(m.key)}
                    onChange={() => toggleModule(m.key)}
                  />
                  <span>
                    <b>{m.name}</b>
                    <em>{m.description}</em>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {err && <div className="auth-err">{err}</div>}
        </div>

        <div className="mf">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn grn" disabled={busy || !valid} onClick={() => void submit()}>
            {busy ? 'Creating…' : 'Create organization'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Per-tenant module toggles, reusing the same dependency rules as the API. */
function OrgModulesModal({ org, onClose }: { org: AdminOrgSummary; onClose: () => void }) {
  const { api } = useApi();
  const toast = useToast();
  const [rows, setRows] = useState<ModuleView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const state = useAsync(() => api.admin.organizations.modules(org.id), [org.id]);
  const view = rows ?? state.data ?? [];

  async function toggle(m: ModuleView) {
    setBusy(m.key);
    try {
      const next = m.enabled
        ? await api.admin.organizations.disableModule(org.id, m.key)
        : await api.admin.organizations.enableModule(org.id, m.key);
      setRows(next);
      toast(m.enabled ? `${m.name} disabled` : `${m.name} enabled`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not change this module');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" style={{ width: 'min(620px, 95vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div>
            <b>{org.name}</b>
            <span>Plug modules in or out for this school.</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="mb">
          {state.loading && <div className="muted">Loading…</div>}
          {view.map((m) => (
            <div key={m.key} className={`fl${m.enabled ? '' : ' off'}`} style={{ gridTemplateColumns: '1fr auto' }}>
              <div>
                <b>{m.name}</b>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  {m.description}
                </div>
                {m.missingDependencies.length > 0 && !m.enabled && (
                  <div className="pending-red" style={{ fontSize: 11 }}>
                    Needs {m.missingDependencies.map((k) => MODULE_MAP[k]?.name ?? k).join(', ')}
                  </div>
                )}
              </div>
              {m.core ? (
                <span className="tag">Always on</span>
              ) : (
                <button
                  className={`btn sm ${m.enabled ? 'ghost' : 'grn'}`}
                  disabled={busy === m.key || (!m.enabled && m.missingDependencies.length > 0)}
                  onClick={() => void toggle(m)}
                >
                  {busy === m.key ? '…' : m.enabled ? 'Disable' : 'Enable'}
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="mf">
          <button className="btn ghost" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

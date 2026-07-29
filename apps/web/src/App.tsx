import { useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { brand } from '@mentivax/ui';
import { MODULE_MAP, PERMISSION_MAP } from '@mentivax/core';
import { Icon } from './components/Icon';
import { useApi } from './lib/api';
import { LoginPage } from './pages/LoginPage';
import { StudentsPage } from './pages/StudentsPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { BillingWizard } from './pages/BillingWizard';
import { PaymentsPage } from './pages/PaymentsPage';
import { FeesStructurePage } from './pages/FeesStructurePage';
import { StandardsPage } from './pages/StandardsPage';
import { MappingsPage } from './pages/MappingsPage';
import { FinancialYearPage } from './pages/FinancialYearPage';
import { MarketplacePage } from './pages/MarketplacePage';
import { AskReportsPage } from './pages/AskReportsPage';
import { TeamPage } from './pages/TeamPage';
import { RolesPage } from './pages/RolesPage';
import { AdminOrganizationsPage } from './pages/AdminOrganizationsPage';
import { AdminUsersPage } from './pages/AdminUsersPage';

/**
 * A nav entry. `module` gates on the org's entitlements, `permission` on the
 * member's role — an item shows only when both pass.
 */
interface NavItem {
  to: string;
  label: string;
  icon: string;
  module?: string;
  permission?: string;
}

const SETTINGS_NAV: NavItem[] = [
  { to: '/fees-structure', label: 'Fees Structure', icon: 'structure', module: 'fees', permission: 'fees:read' },
  { to: '/standards', label: 'Standards', icon: 'building', permission: 'classes:read' },
  { to: '/mappings', label: 'Structure-Standard Mappings', icon: 'link', module: 'fees', permission: 'fees:read' },
  { to: '/academic-year', label: 'Academic Year', icon: 'calendar', permission: 'settings:read' },
  { to: '/team', label: 'Team', icon: 'users', permission: 'members:read' },
  { to: '/roles', label: 'Roles & Permissions', icon: 'lock', permission: 'roles:read' },
];

const NAV: NavItem[] = [
  { to: '/ask-reports', label: 'Ask Reports', icon: 'sparkles' },
  { to: '/students', label: 'Students', icon: 'users', module: 'students', permission: 'students:read' },
  { to: '/invoices', label: 'Invoices', icon: 'invoice', module: 'fees', permission: 'invoices:read' },
  { to: '/payments', label: 'Payments', icon: 'card', module: 'fees', permission: 'payments:read' },
];

const TITLES: Record<string, { title: string; sub: string }> = {
  '/ask-reports': { title: 'Ask Reports', sub: 'Ask questions about your school in plain language' },
  '/students': { title: 'Students', sub: 'Roster · fee status per student' },
  '/invoices': { title: 'Invoices', sub: 'Issue and track fee invoices' },
  '/invoices/new': { title: 'New class billing', sub: 'Bill a whole class in one pass' },
  '/invoices/generate': { title: 'Add invoice', sub: 'Pick a standard, review discounts & exemptions, then bill' },
  '/payments': { title: 'Payments', sub: 'Record and reconcile collections' },
  '/fees-structure': { title: 'Fees Structure', sub: 'Define academic fees and transport routes' },
  '/standards': { title: 'Standards', sub: 'Create the classes your school runs' },
  '/mappings': { title: 'Structure-Standard Mappings', sub: 'Set fee amounts per standard and transport fares' },
  '/academic-year': { title: 'Academic Year', sub: 'Create years and set the active one' },
  '/modules': { title: 'Modules', sub: 'Plug features in or out for this school' },
  '/team': { title: 'Team', sub: 'Staff accounts that can access this school' },
  '/roles': { title: 'Roles & Permissions', sub: 'Control what each role is allowed to do' },
  '/admin/organizations': { title: 'Organizations', sub: 'Every school on the platform' },
  '/admin/users': { title: 'Platform Users', sub: 'All accounts across every tenant' },
};

/** Renders children only if the org has `module`; otherwise an upsell. */
function ModuleGate({ module, children }: { module: string; children: React.ReactNode }) {
  const { hasModule } = useApi();
  if (hasModule(module)) return <>{children}</>;
  return <Upsell module={module} />;
}

/**
 * Renders children only if the member's role grants `permission`.
 *
 * This is a UX affordance, not the security boundary — the API enforces the
 * same permission on every request regardless of what the client renders.
 */
function Can({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { can } = useApi();
  if (can(permission)) return <>{children}</>;
  return <Denied permission={permission} />;
}

/** Both gates, in the order a user would hit them: entitlement, then authority. */
function Gate({
  module,
  permission,
  children,
}: {
  module?: string;
  permission?: string;
  children: React.ReactNode;
}) {
  let node = <>{children}</>;
  if (permission) node = <Can permission={permission}>{node}</Can>;
  if (module) node = <ModuleGate module={module}>{node}</ModuleGate>;
  return node;
}

function Upsell({ module }: { module: string }) {
  const navigate = useNavigate();
  const { can } = useApi();
  const def = MODULE_MAP[module];
  return (
    <div className="success">
      <div className="badge" style={{ background: 'var(--blue-soft)', color: 'var(--blue)' }}>
        <Icon name="lock" size={30} />
      </div>
      <h2>{def?.name ?? module} isn’t enabled</h2>
      <p>{def?.description ?? 'This feature is available as an add-on module.'} Enable it to start using it.</p>
      {can('modules:manage') ? (
        <div className="acts">
          <button className="btn grn" onClick={() => navigate('/modules')}>
            Go to Modules
          </button>
        </div>
      ) : (
        <p className="muted">Ask an owner at your school to enable it.</p>
      )}
    </div>
  );
}

function Denied({ permission }: { permission: string }) {
  const def = PERMISSION_MAP[permission];
  const { roleName } = useApi();
  return (
    <div className="success">
      <div className="badge" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>
        <Icon name="ban" size={30} />
      </div>
      <h2>You don’t have access to this</h2>
      <p>
        This page needs the “{def?.name ?? permission}” permission
        {roleName ? `, which the ${roleName} role doesn’t include` : ''}. Ask an owner at your school
        to adjust your role.
      </p>
    </div>
  );
}

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light',
  );
  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('mentivax.theme', next);
    } catch {
      /* ignore */
    }
  };
  return { theme, toggle };
}

/** Sidebar footer: which school you're in, who you are, and how to leave. */
function OrgMenu() {
  const { currentOrg, orgs, setOrg, loading, session, logout, roleName } = useApi();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="orgmenu" ref={ref}>
      {open && (
        <div className="orgmenu-pop">
          {orgs.length > 1 && (
            <>
              <div className="orgmenu-sec">Switch school</div>
              {orgs.map((o) => (
                <button
                  key={o.id}
                  className={`orgmenu-item${o.id === currentOrg?.id ? ' on' : ''}`}
                  onClick={() => {
                    setOrg(o.id);
                    setOpen(false);
                  }}
                >
                  <span className="ob sm">{o.shortCode}</span>
                  <span>{o.name}</span>
                  {o.id === currentOrg?.id && <Icon name="check" size={14} />}
                </button>
              ))}
              <div className="orgmenu-div" />
            </>
          )}
          <div className="orgmenu-sec">{session?.user.email}</div>
          <button className="orgmenu-item" onClick={() => void logout()}>
            <Icon name="ban" size={14} />
            <span>Sign out</span>
          </button>
        </div>
      )}
      <button className="orgrow" onClick={() => setOpen((v) => !v)}>
        <span className="ob">{currentOrg?.shortCode ?? '—'}</span>
        <span className="om">
          <b>{currentOrg?.name ?? (loading ? 'Loading…' : 'No organization')}</b>
          <span>{roleName ?? 'Signed in'} · Switch</span>
        </span>
      </button>
    </div>
  );
}

export function App() {
  const { booting, isAuthenticated, isPlatformAdmin, hasModule, can } = useApi();
  const { pathname } = useLocation();
  const { theme, toggle: toggleTheme } = useTheme();
  const meta = TITLES[pathname] ?? TITLES[`/${pathname.split('/')[1]}`] ?? { title: 'Mentivax', sub: '' };

  // Restoring a stored session — showing the login form here would flash it at
  // users who are already signed in.
  if (booting) {
    return (
      <div className="auth">
        <div className="auth-boot">Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated) return <LoginPage />;

  const allowed = (n: NavItem) =>
    (!n.module || hasModule(n.module)) && (!n.permission || can(n.permission));

  const visibleNav = NAV.filter(allowed);
  const visibleSettings = SETTINGS_NAV.filter(allowed);

  return (
    <div className="app">
      <aside className="side">
        <div className="logo">
          <div className="mark">M</div>
          <div>
            <b>{brand.name}</b>
            <span>School ERP</span>
          </div>
        </div>
        <nav className="nav">
          {visibleNav.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nv${isActive ? ' on' : ''}`}>
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}

          {visibleSettings.length > 0 && <div className="sec">Settings</div>}
          {visibleSettings.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nv${isActive ? ' on' : ''}`}>
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}
          {can('modules:manage') && (
            <NavLink to="/modules" className={({ isActive }) => `nv${isActive ? ' on' : ''}`}>
              <Icon name="grid" />
              Modules
            </NavLink>
          )}

          {isPlatformAdmin && (
            <>
              <div className="sec">Platform</div>
              <NavLink
                to="/admin/organizations"
                className={({ isActive }) => `nv${isActive ? ' on' : ''}`}
              >
                <Icon name="building" />
                Organizations
              </NavLink>
              <NavLink to="/admin/users" className={({ isActive }) => `nv${isActive ? ' on' : ''}`}>
                <Icon name="users" />
                Platform Users
              </NavLink>
            </>
          )}
        </nav>
        <div className="foot">
          <OrgMenu />
        </div>
      </aside>

      <div className="main">
        <div className="mtop">
          <div>
            <h1>{meta.title}</h1>
            <div className="sub">{meta.sub}</div>
          </div>
          <div style={{ flex: 1 }} />
          <button
            className="themetog"
            onClick={toggleTheme}
            title={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
            aria-label="Toggle theme"
          >
            <Icon name={theme === 'light' ? 'moon' : 'sun'} size={17} />
          </button>
        </div>
        <div className="body">
          <div className="wrap">
            <Routes>
              <Route path="/" element={<Navigate to={isPlatformAdmin ? '/admin/organizations' : '/students'} replace />} />
              <Route path="/ask-reports" element={<AskReportsPage />} />
              <Route
                path="/students"
                element={<Gate module="students" permission="students:read"><StudentsPage /></Gate>}
              />
              <Route path="/invoices" element={<Gate module="fees" permission="invoices:read"><InvoicesPage /></Gate>} />
              <Route path="/invoices/new" element={<Gate module="fees" permission="invoices:write"><BillingWizard /></Gate>} />
              <Route path="/invoices/generate" element={<Navigate to="/invoices" replace />} />
              <Route path="/payments" element={<Gate module="fees" permission="payments:read"><PaymentsPage /></Gate>} />
              <Route path="/fees-structure" element={<Gate module="fees" permission="fees:read"><FeesStructurePage /></Gate>} />
              <Route path="/standards" element={<Gate permission="classes:read"><StandardsPage /></Gate>} />
              <Route path="/mappings" element={<Gate module="fees" permission="fees:read"><MappingsPage /></Gate>} />
              <Route path="/academic-year" element={<Gate permission="settings:read"><FinancialYearPage /></Gate>} />
              <Route path="/financial-year" element={<Navigate to="/academic-year" replace />} />
              <Route path="/fee-structure" element={<Navigate to="/mappings" replace />} />
              <Route path="/modules" element={<Gate permission="modules:manage"><MarketplacePage /></Gate>} />
              <Route path="/team" element={<Gate permission="members:read"><TeamPage /></Gate>} />
              <Route path="/roles" element={<Gate permission="roles:read"><RolesPage /></Gate>} />
              <Route
                path="/admin/organizations"
                element={isPlatformAdmin ? <AdminOrganizationsPage /> : <Denied permission="platform" />}
              />
              <Route
                path="/admin/users"
                element={isPlatformAdmin ? <AdminUsersPage /> : <Denied permission="platform" />}
              />
              <Route path="*" element={<Navigate to={isPlatformAdmin ? '/admin/organizations' : '/students'} replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </div>
  );
}

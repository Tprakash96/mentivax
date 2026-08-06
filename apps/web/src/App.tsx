import { Fragment, useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { brand } from '@mentivax/ui';
import { MODULE_MAP, PERMISSION_MAP } from '@mentivax/core';
import { Icon } from './components/Icon';
import { useApi } from './lib/api';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { StudentsPage } from './pages/StudentsPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { StudentProfilePage } from './pages/StudentProfilePage';
import { AlumniPage } from './pages/AlumniPage';
import { YearRolloverPage } from './pages/YearRolloverPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { BillingWizard } from './pages/BillingWizard';
import { PaymentsPage } from './pages/PaymentsPage';
import { CollectedPage } from './pages/CollectedPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { StaffPage } from './pages/StaffPage';
import { SetupPage } from './pages/SetupPage';
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
  /** Optional group heading shown above this item in the sidebar. */
  section?: string;
}

/**
 * Each module is its own workspace with a focused sidebar (per the handoff),
 * reached from the launcher. The sidebar shows only that module's links plus an
 * "All features" way back — never one global menu of everything.
 */
interface ModuleContext {
  key: string;
  /** 2-letter tile in the sidebar brand. */
  code: string;
  label: string;
  /** Pathname prefixes that belong to this workspace. */
  match: string[];
  items: NavItem[];
}

const CONTEXTS: ModuleContext[] = [
  {
    key: 'students',
    code: 'ST',
    label: 'Students',
    match: ['/students', '/documents', '/rollover', '/alumni'],
    items: [
      { to: '/students', label: 'All students', icon: 'users', section: 'Records', module: 'students', permission: 'students:read' },
      { to: '/documents', label: 'Documents', icon: 'save', section: 'Records', module: 'students', permission: 'students:read' },
      { to: '/rollover', label: 'Year rollover', icon: 'calendar', section: 'Lifecycle', module: 'students', permission: 'students:read' },
      { to: '/alumni', label: 'Alumni', icon: 'users', section: 'Lifecycle', module: 'students', permission: 'students:read' },
    ],
  },
  {
    key: 'fees',
    code: 'FE',
    label: 'Fees & collections',
    match: ['/invoices', '/payments', '/collected', '/fees-structure', '/mappings'],
    items: [
      { to: '/invoices', label: 'Invoices', icon: 'invoice', module: 'fees', permission: 'invoices:read' },
      { to: '/payments', label: 'Payments', icon: 'card', module: 'fees', permission: 'payments:read' },
      { to: '/mappings', label: 'Fee structure', icon: 'structure', module: 'fees', permission: 'fees:read' },
      { to: '/fees-structure', label: 'Transport', icon: 'bus', module: 'transport', permission: 'fees:read' },
    ],
  },
  {
    key: 'expenses',
    code: 'AC',
    label: 'Expenses & accounts',
    match: ['/expenses'],
    items: [{ to: '/expenses', label: 'Day book', icon: 'card', module: 'expenses', permission: 'expenses:read' }],
  },
  {
    key: 'staff',
    code: 'SF',
    label: 'Staff & payroll',
    match: ['/staff'],
    items: [{ to: '/staff', label: 'Register', icon: 'users', module: 'staff', permission: 'staff:read' }],
  },
  {
    key: 'reports',
    code: 'RE',
    label: 'Ask reports',
    match: ['/ask-reports'],
    items: [{ to: '/ask-reports', label: 'Ask reports', icon: 'sparkles' }],
  },
  {
    key: 'admin',
    code: 'AD',
    label: 'School admin',
    match: ['/team', '/roles', '/modules', '/academic-year'],
    items: [
      { to: '/academic-year', label: 'Academic year', icon: 'calendar', permission: 'settings:read' },
      { to: '/team', label: 'Team', icon: 'users', permission: 'members:read' },
      { to: '/roles', label: 'Roles & permissions', icon: 'lock', permission: 'roles:read' },
      { to: '/modules', label: 'Modules', icon: 'grid', permission: 'modules:manage' },
    ],
  },
  {
    key: 'platform',
    code: 'PL',
    label: 'Platform',
    match: ['/admin'],
    items: [
      { to: '/admin/organizations', label: 'Organizations', icon: 'building' },
      { to: '/admin/users', label: 'Platform users', icon: 'users' },
    ],
  },
];

function contextFor(pathname: string): ModuleContext {
  return (
    CONTEXTS.find((c) => c.match.some((m) => pathname === m || pathname.startsWith(`${m}/`))) ??
    CONTEXTS[0]!
  );
}

const TITLES: Record<string, { title: string; sub: string }> = {
  '/ask-reports': { title: 'Ask Reports', sub: 'Ask questions about your school in plain language' },
  '/students': { title: 'Students', sub: 'Roster · fee status per student' },
  '/documents': { title: 'Documents', sub: 'Files collected per student' },
  '/rollover': { title: 'Year rollover', sub: 'Promote students to the next standard' },
  '/alumni': { title: 'Alumni', sub: 'Students who have left the school' },
  '/invoices': { title: 'Invoices', sub: 'Issue and track fee invoices' },
  '/invoices/new': { title: 'New class billing', sub: 'Bill a whole class in one pass' },
  '/invoices/generate': { title: 'Add invoice', sub: 'Pick a standard, review discounts & exemptions, then bill' },
  '/payments': { title: 'Payments', sub: 'Record and reconcile collections' },
  '/collected': { title: 'Collected', sub: 'Payments received, by settlement status' },
  '/expenses': { title: 'Expenses & accounts', sub: 'Day book, approvals, statement and reports' },
  '/staff': { title: 'Staff & payroll', sub: 'Register, attendance, leave, payroll and payslips' },
  '/setup': { title: 'School Setup', sub: 'Configure your school step by step' },
  '/fees-structure': { title: 'Transport', sub: 'Assign students to vehicles and stops' },
  '/standards': { title: 'Standards', sub: 'Create the classes your school runs' },
  '/mappings': { title: 'Fee structure', sub: 'Set the amount charged per standard' },
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

/**
 * The launcher hub's top bar (the School Admin screen has no sidebar — the
 * module cards are the navigation). School identity on the left, theme + the
 * signed-in user menu on the right.
 */
function LauncherTopBar({ theme, onToggleTheme }: { theme: 'light' | 'dark'; onToggleTheme: () => void }) {
  const { currentOrg, orgs, setOrg, session, logout, roleName } = useApi();
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
    <header className="launcher-top">
      <div className="launcher-top-inner">
        <div className="launcher-brand">
          <div className="mark">{currentOrg?.shortCode ?? 'M'}</div>
          <div>
            <b>{currentOrg?.name ?? brand.name}</b>
            <span>{roleName ?? 'Signed in'}</span>
          </div>
        </div>
        <div className="launcher-sp" />
        <button
          className="themetog"
          onClick={onToggleTheme}
          title={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
          aria-label="Toggle theme"
        >
          <Icon name={theme === 'light' ? 'moon' : 'sun'} size={17} />
        </button>
        <div className="lt-user" ref={ref}>
          <button className="lt-user-btn" onClick={() => setOpen((v) => !v)}>
            <span className="lt-who">Signed in as</span>
            <b>{session?.user.name ?? session?.user.email}</b>
            <Icon name="chevron" size={13} />
          </button>
          {open && (
            <div className="lt-menu">
              {orgs.length > 1 && (
                <>
                  <div className="lt-menu-sec">Switch school</div>
                  {orgs.map((o) => (
                    <button
                      key={o.id}
                      className="lt-menu-item"
                      onClick={() => {
                        setOrg(o.id);
                        setOpen(false);
                      }}
                    >
                      <span className="ob sm">{o.shortCode}</span>
                      <span>{o.name}</span>
                    </button>
                  ))}
                  <div className="lt-menu-div" />
                </>
              )}
              <div className="lt-menu-sec">{session?.user.email}</div>
              <button className="lt-menu-item" onClick={() => void logout()}>
                <Icon name="ban" size={14} />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function App() {
  const { booting, isAuthenticated, isPlatformAdmin, hasModule, can, currentOrg } = useApi();
  const { pathname } = useLocation();
  const navigate = useNavigate();
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

  const ctx = contextFor(pathname);

  // The launcher hub is a standalone full-screen app — no app sidebar, just the
  // top bar; the module cards do the navigating.
  if (pathname === '/home') {
    return (
      <div className="launcher">
        <LauncherTopBar theme={theme} onToggleTheme={toggleTheme} />
        <main className="launcher-main">
          <div className="launcher-wrap">
            <HomePage />
          </div>
        </main>
      </div>
    );
  }

  // The setup wizard owns the whole screen: its own navy step rail replaces the
  // app sidebar entirely.
  if (pathname === '/setup') {
    return (
      <Gate permission="settings:read">
        <SetupPage />
      </Gate>
    );
  }

  return (
    <div className="app">
      <aside className="side">
        <button className="side-back" onClick={() => navigate('/home')}>
          <Icon name="arrowLeft" size={14} />
          All features
        </button>
        <div className="logo">
          <div className="mark">{ctx.code}</div>
          <div>
            <b>{ctx.label}</b>
            <span>{currentOrg?.shortCode ?? brand.name}</span>
          </div>
        </div>
        <nav className="nav">
          {ctx.items.filter(allowed).map((n, i, arr) => (
            <Fragment key={n.to}>
              {n.section && n.section !== arr[i - 1]?.section && <div className="sec">{n.section}</div>}
              <NavLink to={n.to} className={({ isActive }) => `nv${isActive ? ' on' : ''}`}>
                <Icon name={n.icon} />
                {n.label}
              </NavLink>
            </Fragment>
          ))}
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
              <Route path="/" element={<Navigate to={isPlatformAdmin ? '/admin/organizations' : '/home'} replace />} />
              <Route path="/home" element={<HomePage />} />
              <Route path="/ask-reports" element={<AskReportsPage />} />
              <Route
                path="/students"
                element={<Gate module="students" permission="students:read"><StudentsPage /></Gate>}
              />
              <Route path="/students/:id" element={<Gate module="students" permission="students:read"><StudentProfilePage /></Gate>} />
              <Route path="/documents" element={<Gate module="students" permission="students:read"><DocumentsPage /></Gate>} />
              <Route path="/rollover" element={<Gate module="students" permission="students:read"><YearRolloverPage /></Gate>} />
              <Route path="/alumni" element={<Gate module="students" permission="students:read"><AlumniPage /></Gate>} />
              <Route path="/invoices" element={<Gate module="fees" permission="invoices:read"><InvoicesPage /></Gate>} />
              <Route path="/invoices/new" element={<Gate module="fees" permission="invoices:write"><BillingWizard /></Gate>} />
              <Route path="/invoices/generate" element={<Navigate to="/invoices" replace />} />
              <Route path="/payments" element={<Gate module="fees" permission="payments:read"><PaymentsPage /></Gate>} />
              <Route path="/collected" element={<Gate module="fees" permission="payments:read"><CollectedPage /></Gate>} />
              <Route path="/expenses" element={<Gate module="expenses" permission="expenses:read"><ExpensesPage /></Gate>} />
              <Route path="/staff" element={<Gate module="staff" permission="staff:read"><StaffPage /></Gate>} />
              <Route path="/fees-structure" element={<Gate module="fees" permission="fees:read"><FeesStructurePage /></Gate>} />
              <Route path="/setup" element={<Gate permission="settings:read"><SetupPage /></Gate>} />
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
              <Route path="*" element={<Navigate to={isPlatformAdmin ? '/admin/organizations' : '/home'} replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </div>
  );
}

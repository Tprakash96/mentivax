import { useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { brand } from '@mentivax/ui';
import { MODULE_MAP } from '@mentivax/core';
import { Icon } from './components/Icon';
import { useApi } from './lib/api';
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

/** Settings nav items. `module` (optional) gates visibility. */
const SETTINGS_NAV: { to: string; label: string; icon: string; module?: string }[] = [
  { to: '/fees-structure', label: 'Fees Structure', icon: 'structure', module: 'fees' },
  { to: '/standards', label: 'Standards', icon: 'building' },
  { to: '/mappings', label: 'Structure-Standard Mappings', icon: 'link', module: 'fees' },
  { to: '/academic-year', label: 'Academic Year', icon: 'calendar' },
];

/** Nav items. `module` (optional) gates visibility; items without one always show. */
const NAV: { to: string; label: string; icon: string; module?: string }[] = [
  { to: '/ask-reports', label: 'Ask Reports', icon: 'sparkles' },
  { to: '/students', label: 'Students', icon: 'users', module: 'students' },
  { to: '/invoices', label: 'Invoices', icon: 'invoice', module: 'fees' },
  { to: '/payments', label: 'Payments', icon: 'card', module: 'fees' },
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
};

/** Renders children only if the org has `module`; otherwise an upsell. */
function ModuleGate({ module, children }: { module: string; children: React.ReactNode }) {
  const { hasModule } = useApi();
  if (hasModule(module)) return <>{children}</>;
  return <Upsell module={module} />;
}

function Upsell({ module }: { module: string }) {
  const navigate = useNavigate();
  const def = MODULE_MAP[module];
  return (
    <div className="success">
      <div className="badge" style={{ background: 'var(--blue-soft)', color: 'var(--blue)' }}>
        <Icon name="lock" size={30} />
      </div>
      <h2>{def?.name ?? module} isn’t enabled</h2>
      <p>{def?.description ?? 'This feature is available as an add-on module.'} Enable it to start using it.</p>
      <div className="acts">
        <button className="btn grn" onClick={() => navigate('/modules')}>
          Go to Modules
        </button>
      </div>
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

export function App() {
  const { currentOrg, loading, hasModule } = useApi();
  const { pathname } = useLocation();
  const { theme, toggle: toggleTheme } = useTheme();
  const meta = TITLES[pathname] ?? TITLES[`/${pathname.split('/')[1]}`] ?? { title: 'Mentivax', sub: '' };

  const visibleNav = NAV.filter((n) => !n.module || hasModule(n.module));

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
          <div className="sec">Settings</div>
          {SETTINGS_NAV.filter((n) => !n.module || hasModule(n.module)).map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nv${isActive ? ' on' : ''}`}>
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}
          <NavLink to="/modules" className={({ isActive }) => `nv${isActive ? ' on' : ''}`}>
            <Icon name="grid" />
            Modules
          </NavLink>
        </nav>
        <div className="foot">
          <button className="orgrow">
            <span className="ob">{currentOrg?.shortCode ?? '—'}</span>
            <span className="om">
              <b>{currentOrg?.name ?? (loading ? 'Loading…' : 'No organization')}</b>
              <span>2026–27 · Switch org</span>
            </span>
          </button>
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
              <Route path="/" element={<Navigate to="/students" replace />} />
              <Route path="/ask-reports" element={<AskReportsPage />} />
              <Route path="/students" element={<StudentsPage />} />
              <Route path="/invoices" element={<ModuleGate module="fees"><InvoicesPage /></ModuleGate>} />
              <Route path="/invoices/new" element={<ModuleGate module="fees"><BillingWizard /></ModuleGate>} />
              <Route path="/invoices/generate" element={<Navigate to="/invoices" replace />} />
              <Route path="/payments" element={<ModuleGate module="fees"><PaymentsPage /></ModuleGate>} />
              <Route path="/fees-structure" element={<ModuleGate module="fees"><FeesStructurePage /></ModuleGate>} />
              <Route path="/standards" element={<StandardsPage />} />
              <Route path="/mappings" element={<ModuleGate module="fees"><MappingsPage /></ModuleGate>} />
              <Route path="/academic-year" element={<FinancialYearPage />} />
              <Route path="/financial-year" element={<Navigate to="/academic-year" replace />} />
              <Route path="/fee-structure" element={<Navigate to="/mappings" replace />} />
              <Route path="/modules" element={<MarketplacePage />} />
              <Route path="*" element={<Navigate to="/students" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </div>
  );
}

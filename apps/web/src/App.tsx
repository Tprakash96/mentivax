import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { brand } from '@mentivax/ui';
import { MODULE_MAP } from '@mentivax/core';
import { Icon } from './components/Icon';
import { useApi } from './lib/api';
import { StudentsPage } from './pages/StudentsPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { BillingWizard } from './pages/BillingWizard';
import { PaymentsPage } from './pages/PaymentsPage';
import { FeeStructurePage } from './pages/FeeStructurePage';
import { MarketplacePage } from './pages/MarketplacePage';
import { AskReportsPage } from './pages/AskReportsPage';

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
  '/payments': { title: 'Payments', sub: 'Record and reconcile collections' },
  '/fee-structure': { title: 'Fee structure', sub: 'Configure once · used by every batch' },
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

export function App() {
  const { currentOrg, loading, hasModule } = useApi();
  const { pathname } = useLocation();
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
          {hasModule('fees') && (
            <NavLink to="/fee-structure" className={({ isActive }) => `nv${isActive ? ' on' : ''}`}>
              <Icon name="structure" />
              Fee structure
            </NavLink>
          )}
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
        </div>
        <div className="body">
          <div className="wrap">
            <Routes>
              <Route path="/" element={<Navigate to="/students" replace />} />
              <Route path="/ask-reports" element={<AskReportsPage />} />
              <Route path="/students" element={<StudentsPage />} />
              <Route path="/invoices" element={<ModuleGate module="fees"><InvoicesPage /></ModuleGate>} />
              <Route path="/invoices/new" element={<ModuleGate module="fees"><BillingWizard /></ModuleGate>} />
              <Route path="/payments" element={<ModuleGate module="fees"><PaymentsPage /></ModuleGate>} />
              <Route path="/fee-structure" element={<ModuleGate module="fees"><FeeStructurePage /></ModuleGate>} />
              <Route path="/modules" element={<MarketplacePage />} />
              <Route path="*" element={<Navigate to="/students" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </div>
  );
}

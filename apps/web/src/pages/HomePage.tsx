import { useNavigate } from 'react-router-dom';
import { formatMoney } from '@mentivax/core';
import { AskBar, type AskGlance } from '../components/AskBar';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

/** A launch card, resolved against the signed-in member's grants + modules. */
interface Launch {
  id: string;
  icon: string;
  title: string;
  to: string;
  module?: string;
  read: string;
  write: string;
  metric?: string;
  metricLabel?: string;
  chips: string[];
}

const RUN: Launch[] = [
  {
    id: 'students',
    icon: 'ST',
    title: 'Student management',
    to: '/students',
    module: 'students',
    read: 'students:read',
    write: 'students:write',
    chips: ['Roster', 'Admissions', 'Profiles'],
  },
  {
    id: 'fees',
    icon: 'FE',
    title: 'Fees & collections',
    to: '/invoices',
    module: 'fees',
    read: 'invoices:read',
    write: 'payments:write',
    chips: ['Collect', 'Invoices', 'Structure'],
  },
  {
    id: 'expenses',
    icon: 'AC',
    title: 'Expenses & accounts',
    to: '/expenses',
    module: 'expenses',
    read: 'expenses:read',
    write: 'expenses:write',
    metricLabel: 'cash in hand',
    chips: ['Day book', 'Approvals', 'Statement'],
  },
  {
    id: 'staff',
    icon: 'SF',
    title: 'Staff & payroll',
    to: '/staff',
    module: 'staff',
    read: 'staff:read',
    write: 'staff:write',
    metricLabel: 'on the rolls',
    chips: ['Register', 'Attendance', 'Payroll'],
  },
  {
    id: 'reports',
    icon: 'RE',
    title: 'Reports',
    to: '/reports',
    module: 'reports',
    read: 'reports:read',
    write: 'reports:read',
    metricLabel: 'collection rate',
    chips: ['Overview', 'Fee heads', 'Concessions'],
  },
];

const CONFIGURE: Launch[] = [
  {
    id: 'setup',
    icon: 'SU',
    title: 'School setup',
    to: '/setup',
    read: 'settings:read',
    write: 'settings:write',
    chips: ['Standards', 'Mappings', 'Academic year'],
  },
  {
    id: 'team',
    icon: 'SF',
    title: 'Team & access',
    to: '/team',
    read: 'members:read',
    write: 'members:write',
    metricLabel: 'staff logins',
    chips: ['Team', 'Roles'],
  },
];

function greet(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function HomePage() {
  const navigate = useNavigate();
  const { api, session, currentOrg, roleName, can, hasModule } = useApi();

  // Cheap live figures for the launcher. Each tolerates a permission failure.
  const summary = useAsync(() => api.payments.summary().catch(() => null), []);
  const students = useAsync(() => api.students.list().catch(() => null), []);
  const classes = useAsync(() => api.classes.list().catch(() => null), []);
  const members = useAsync(() => api.members.list().catch(() => null), []);
  const expenses = useAsync(
    () => (hasModule('expenses') && can('expenses:read') ? api.expenses.overview().catch(() => null) : Promise.resolve(null)),
    [],
  );
  const staffSummary = useAsync(
    () => (hasModule('staff') && can('staff:read') ? api.staff.summary().catch(() => null) : Promise.resolve(null)),
    [],
  );
  const setup = useAsync(
    () => (can('settings:read') ? api.setup.overview().catch(() => null) : Promise.resolve(null)),
    [],
  );

  const s = summary.data;
  const studentCount = students.data?.length ?? null;
  const classCount = classes.data?.length ?? null;
  const memberCount = members.data?.length ?? null;
  const cashInHand = expenses.data?.closing ?? null;
  const staffCount = staffSummary.data?.headcount ?? null;

  const firstName = (session?.user.name ?? '').split(' ')[0] || 'there';
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const kicker = [currentOrg?.name, currentOrg?.shortCode, today].filter(Boolean).join(' · ');

  const allowed = (l: Launch) =>
    (!l.module || hasModule(l.module)) && (!l.read || can(l.read));

  const metricFor = (l: Launch): { value: string; label: string } | null => {
    if (l.id === 'students' && studentCount != null)
      return { value: String(studentCount), label: 'on the roll' };
    if (l.id === 'fees' && s) return { value: formatMoney(s.collected), label: 'collected this year' };
    if (l.id === 'setup' && classCount != null)
      return { value: String(classCount), label: classCount === 1 ? 'standard' : 'standards' };
    if (l.id === 'team' && memberCount != null)
      return { value: String(memberCount), label: memberCount === 1 ? 'staff login' : 'staff logins' };
    if (l.id === 'expenses' && cashInHand != null)
      return { value: formatMoney(cashInHand), label: 'cash in hand' };
    if (l.id === 'staff' && staffCount != null)
      return { value: String(staffCount), label: 'on the rolls' };
    if (l.id === 'reports' && s && s.totalInvoiced > 0)
      return { value: `${Math.round((s.collected / s.totalInvoiced) * 100)}%`, label: 'collection rate' };
    if (l.id === 'setup' && setup.data)
      return { value: `${setup.data.doneMusts}/${setup.data.totalMusts}`, label: 'essentials done' };
    if (l.metric) return { value: l.metric, label: l.metricLabel ?? '' };
    return null;
  };

  const card = (l: Launch) => {
    const canWrite = !l.write || can(l.write);
    const m = metricFor(l);
    return (
      <button key={l.id} className="lcard" onClick={() => navigate(l.to)}>
        <span className="lcard-top">
          <span className="lcard-ic">{l.icon}</span>
          <span className="lcard-id">
            <span className="lcard-title">{l.title}</span>
            <span className={`lcard-tag ${canWrite ? 'full' : 'view'}`}>
              {canWrite ? 'Full access' : 'View only'}
            </span>
          </span>
          <span className="lcard-arrow">→</span>
        </span>
        {m && (
          <span className="lcard-metric">
            <b>{m.value}</b>
            <span>{m.label}</span>
          </span>
        )}
        <span className="lcard-links">
          {l.chips.map((c) => (
            <span key={c} className="lchip">
              {c}
            </span>
          ))}
        </span>
      </button>
    );
  };

  const run = RUN.filter(allowed);
  const configure = CONFIGURE.filter(allowed);
  const openCount = run.length + configure.length;

  // The figures the old "needs attention" band carried, now shown beside Ask.
  const glance: AskGlance[] = [];
  if (s && can('payments:read')) {
    if (s.balanceDue > 0)
      glance.push({
        key: 'due',
        value: formatMoney(s.balanceDue),
        label: 'still to collect',
        to: '/payments',
        tone: '#ffc24b',
      });
    if (s.invoiceCount > 0 && can('invoices:read'))
      glance.push({
        key: 'inv',
        value: String(s.invoiceCount),
        label: 'invoices this year',
        to: '/invoices',
        tone: '#93b4ff',
      });
  }

  // Ask needs the reports module and read access — same gate as the page.
  const canAsk = hasModule('reports') && can('reports:read');

  const quick = [
    { label: 'Collect a fee', to: '/payments', primary: true, show: can('payments:write') && hasModule('fees') },
    { label: 'New admission', to: '/students', primary: false, show: can('students:write') },
    { label: 'Add invoice', to: '/invoices/new', primary: false, show: can('invoices:write') && hasModule('fees') },
  ].filter((q) => q.show);

  const locked = [...RUN, ...CONFIGURE].filter(
    (l) => !allowed(l) && l.module && !hasModule(l.module),
  );

  return (
    <div className="home">
      <div className="home-head">
        <div style={{ minWidth: 0 }}>
          <div className="home-kick">{kicker}</div>
          <h1 className="home-greet">
            {greet()}, {firstName}
          </h1>
          <div className="home-sub">
            {openCount
              ? `${openCount} ${openCount === 1 ? 'feature' : 'features'} open to you · ${roleName ?? 'signed in'}`
              : 'Nothing is open to you yet — ask an owner at your school for access'}
          </div>
        </div>
        {quick.length > 0 && (
          <div className="home-qa">
            {quick.map((q) => (
              <button key={q.label} className={`qa${q.primary ? ' primary' : ''}`} onClick={() => navigate(q.to)}>
                {q.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Ask replaces the old "needs attention" band — same figures, still one
          click away, but you can now put a question to the data instead of
          reading whichever two numbers we chose to show. */}
      {canAsk && <AskBar glance={glance} />}

      {run.length > 0 && (
        <div className="lgroup">
          <div className="lgroup-head">
            <div className="lgroup-label">Run the school</div>
            <div className="lgroup-rule" />
            <div className="lgroup-note">Day-to-day work</div>
          </div>
          <div className="lcards">{run.map(card)}</div>
        </div>
      )}

      {configure.length > 0 && (
        <div className="lgroup">
          <div className="lgroup-head">
            <div className="lgroup-label">Configure</div>
            <div className="lgroup-rule" />
            <div className="lgroup-note">Set once, everything else reads it</div>
          </div>
          <div className="lcards">{configure.map(card)}</div>
        </div>
      )}

      {locked.length > 0 && (
        <div className="lgroup">
          <div className="lgroup-head">
            <div className="lgroup-label">Not enabled</div>
            <div className="lgroup-rule" />
          </div>
          <div className="lgroup-locked">
            {locked.map((l) => (
              <div key={l.id} className="llock">
                <span className="llock-ic">{l.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <b>{l.title}</b>
                  <span>Not part of your plan yet</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

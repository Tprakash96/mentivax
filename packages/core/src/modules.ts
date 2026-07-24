/**
 * Module registry — the plug-in / plug-out catalog.
 *
 * Mentivax is a shared engine; each school (organization) buys only the modules
 * it needs. The CATALOG here is the source of truth for *what modules exist*
 * (code-defined, versioned with the app). *Which* modules a given org has
 * enabled is stored per-tenant in the database (OrganizationModule). Enforcement
 * lives in the API (ModuleGuard) and the clients (nav/route filtering).
 *
 * To add a feature: implement it as a module, then add an entry here. Core
 * modules are always on and cannot be plugged out.
 */

export type ModuleCategory = 'core' | 'finance' | 'academics' | 'communication' | 'analytics' | 'operations';

/** Per-org lifecycle of a purchased module. */
export type ModuleStatus = 'ACTIVE' | 'TRIAL' | 'SUSPENDED';

export interface ModuleDef {
  /** Stable identifier used in code, DB, guards, and clients. Never rename. */
  key: string;
  name: string;
  description: string;
  category: ModuleCategory;
  /** Icon name understood by the web client's <Icon>. */
  icon: string;
  /** Other module keys that must be enabled for this one to work. */
  dependsOn: string[];
  /** Core modules are always enabled and cannot be disabled. */
  core: boolean;
  /** Indicative price per month in paise (0 for core). UI/marketing only. */
  priceMonthly: number;
}

const rupeesPerMonth = (r: number) => r * 100;

/**
 * The catalog. Keys are permanent contracts. Prices are indicative placeholders.
 * (Feature set mirrors the single-school billing app this platform generalizes.)
 */
export const MODULES: ModuleDef[] = [
  {
    key: 'students',
    name: 'Students & Classes',
    description: 'Student directory, classes & sections, siblings/referrals, admissions, and Excel import.',
    category: 'core',
    icon: 'users',
    dependsOn: [],
    core: true,
    priceMonthly: 0,
  },
  {
    key: 'fees',
    name: 'Fees & Collections',
    description: 'Fee heads, class billing, term/monthly instalments, discounts, invoices, payments & receipts.',
    category: 'finance',
    icon: 'invoice',
    dependsOn: ['students'],
    core: false,
    priceMonthly: rupeesPerMonth(1499),
  },
  {
    key: 'communication',
    name: 'Parent Communication',
    description: 'WhatsApp / SMS fee reminders, receipts, and broadcasts to parents.',
    category: 'communication',
    icon: 'card',
    dependsOn: ['students'],
    core: false,
    priceMonthly: rupeesPerMonth(999),
  },
  {
    key: 'reports',
    name: 'Reports & Ask-AI',
    description: 'Collection dashboards, invoice & period reports, and natural-language Ask-AI.',
    category: 'analytics',
    icon: 'structure',
    dependsOn: [],
    core: false,
    priceMonthly: rupeesPerMonth(799),
  },
  {
    key: 'expenses',
    name: 'Expenses',
    description: 'Other-expense and contingent ledgers with income/expense reports.',
    category: 'finance',
    icon: 'card',
    dependsOn: [],
    core: false,
    priceMonthly: rupeesPerMonth(499),
  },
  {
    key: 'attendance',
    name: 'Attendance',
    description: 'Daily student attendance with parent notifications.',
    category: 'academics',
    icon: 'check',
    dependsOn: ['students'],
    core: false,
    priceMonthly: rupeesPerMonth(699),
  },
  {
    key: 'transport',
    name: 'Transport',
    description: 'Vans, routes & stops with monthly transport-fee billing.',
    category: 'operations',
    icon: 'card',
    dependsOn: ['students', 'fees'],
    core: false,
    priceMonthly: rupeesPerMonth(599),
  },
];

export const MODULE_MAP: Record<string, ModuleDef> = Object.fromEntries(
  MODULES.map((m) => [m.key, m]),
);

/** Keys of modules that are always enabled for every organization. */
export const CORE_MODULE_KEYS: string[] = MODULES.filter((m) => m.core).map((m) => m.key);

export const isValidModuleKey = (key: string): boolean => key in MODULE_MAP;

/** Dependencies of `key` that are NOT present in `enabledKeys`. */
export function getMissingDependencies(key: string, enabledKeys: Iterable<string>): string[] {
  const def = MODULE_MAP[key];
  if (!def) return [];
  const enabled = new Set(enabledKeys);
  return def.dependsOn.filter((dep) => !enabled.has(dep));
}

/** Enabled modules that depend on `key` (i.e. would break if it were removed). */
export function getDependents(key: string, enabledKeys: Iterable<string>): string[] {
  const enabled = new Set(enabledKeys);
  return MODULES.filter((m) => enabled.has(m.key) && m.dependsOn.includes(key)).map((m) => m.key);
}

/**
 * Full set an org can use: everything explicitly enabled, plus always-on core
 * modules. Use this as the single check for "can this org use module X".
 */
export function effectiveModuleKeys(enabledKeys: Iterable<string>): Set<string> {
  return new Set<string>([...CORE_MODULE_KEYS, ...enabledKeys]);
}

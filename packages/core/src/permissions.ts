/**
 * RBAC — the permission catalog and the system role templates.
 *
 * Mirrors the design of the module catalog (see modules.ts): *what permissions
 * exist* is code, versioned with the app; *who has them* is data (Role +
 * RolePermission rows, per organization).
 *
 * Permission keys are `resource:action` and are permanent contracts — never
 * rename one, or existing RolePermission rows silently stop matching. To retire
 * a permission, drop it from the catalog and clean up the rows in a migration.
 *
 * Every permission declares the `module` it belongs to. A permission is only
 * *usable* by an org that has that module plugged in, so the roles UI can hide
 * permissions the school hasn't bought, and the API can treat a permission on a
 * disabled module as absent.
 */

/** Coarse grouping for the permission checklist in the roles editor. */
export type PermissionGroup =
  | 'Students'
  | 'Fees'
  | 'Invoices'
  | 'Payments'
  | 'Transport'
  | 'Reports'
  | 'Administration';

export interface PermissionDef {
  /** Stable `resource:action` identifier. Never rename. */
  key: string;
  name: string;
  description: string;
  group: PermissionGroup;
  /** Module key from the MODULES catalog that this permission belongs to. */
  module: string;
}

/**
 * The catalog. Keep grouped by module so the roles editor reads top-to-bottom
 * in the same order as the marketplace.
 */
export const PERMISSIONS: PermissionDef[] = [
  // --- Students (core module) ---
  {
    key: 'students:read',
    name: 'View students',
    description: 'See the student roster and individual student profiles.',
    group: 'Students',
    module: 'students',
  },
  {
    key: 'students:write',
    name: 'Add & edit students',
    description: 'Create students, edit profiles, and set per-student fee adjustments.',
    group: 'Students',
    module: 'students',
  },
  {
    key: 'students:delete',
    name: 'Delete students',
    description: 'Permanently remove a student record.',
    group: 'Students',
    module: 'students',
  },
  {
    key: 'students:import',
    name: 'Bulk import students',
    description: 'Upload a spreadsheet to create students in bulk.',
    group: 'Students',
    module: 'students',
  },
  {
    key: 'classes:read',
    name: 'View classes',
    description: 'See the list of standards/classes the school runs.',
    group: 'Students',
    module: 'students',
  },
  {
    key: 'classes:write',
    name: 'Manage classes',
    description: 'Create, rename, and reorder standards/classes.',
    group: 'Students',
    module: 'students',
  },

  // --- Fees ---
  {
    key: 'fees:read',
    name: 'View fee structure',
    description: 'See fee heads and the per-standard fee amounts.',
    group: 'Fees',
    module: 'fees',
  },
  {
    key: 'fees:write',
    name: 'Manage fee structure',
    description: 'Create fee heads and set the amount charged per standard.',
    group: 'Fees',
    module: 'fees',
  },
  {
    key: 'invoices:read',
    name: 'View invoices',
    description: 'See issued invoices and their outstanding balances.',
    group: 'Invoices',
    module: 'fees',
  },
  {
    key: 'invoices:write',
    name: 'Create invoices',
    description: 'Run class billing and issue invoices to students.',
    group: 'Invoices',
    module: 'fees',
  },
  {
    key: 'invoices:discount',
    name: 'Apply discounts',
    description: 'Grant per-student discounts and fee exemptions while billing.',
    group: 'Invoices',
    module: 'fees',
  },
  {
    key: 'invoices:void',
    name: 'Cancel invoices',
    description: 'Cancel or delete an issued invoice.',
    group: 'Invoices',
    module: 'fees',
  },
  {
    key: 'payments:read',
    name: 'View payments',
    description: 'See recorded collections and payment history.',
    group: 'Payments',
    module: 'fees',
  },
  {
    key: 'payments:write',
    name: 'Record payments',
    description: 'Record a collection against a student’s invoices and issue receipts.',
    group: 'Payments',
    module: 'fees',
  },
  {
    key: 'payments:delete',
    name: 'Reverse payments',
    description: 'Void a recorded payment. High-trust — reverses money already booked.',
    group: 'Payments',
    module: 'fees',
  },

  // --- Transport ---
  {
    key: 'transport:read',
    name: 'View transport',
    description: 'See routes, stops, and fares.',
    group: 'Transport',
    module: 'transport',
  },
  {
    key: 'transport:write',
    name: 'Manage transport',
    description: 'Create routes and stops, and set transport fares.',
    group: 'Transport',
    module: 'transport',
  },

  // --- Reports ---
  {
    key: 'reports:read',
    name: 'View reports',
    description: 'Open collection dashboards and run Ask-AI queries.',
    group: 'Reports',
    module: 'reports',
  },

  // --- Administration (always available; belongs to the core module) ---
  {
    key: 'settings:read',
    name: 'View settings',
    description: 'See academic years and organization settings.',
    group: 'Administration',
    module: 'students',
  },
  {
    key: 'settings:write',
    name: 'Manage settings',
    description: 'Create academic years, set the active year, and edit school details.',
    group: 'Administration',
    module: 'students',
  },
  {
    key: 'members:read',
    name: 'View team',
    description: 'See the staff accounts that can access this school.',
    group: 'Administration',
    module: 'students',
  },
  {
    key: 'members:write',
    name: 'Manage team',
    description: 'Invite or create staff accounts and assign their roles.',
    group: 'Administration',
    module: 'students',
  },
  {
    key: 'roles:read',
    name: 'View roles',
    description: 'See the roles defined for this school and their permissions.',
    group: 'Administration',
    module: 'students',
  },
  {
    key: 'roles:write',
    name: 'Manage roles',
    description: 'Create custom roles and change what each role is allowed to do.',
    group: 'Administration',
    module: 'students',
  },
  {
    key: 'modules:manage',
    name: 'Plug modules in/out',
    description: 'Enable or disable paid modules for this school. Affects billing.',
    group: 'Administration',
    module: 'students',
  },
];

export const PERMISSION_MAP: Record<string, PermissionDef> = Object.fromEntries(
  PERMISSIONS.map((p) => [p.key, p]),
);

export const ALL_PERMISSION_KEYS: string[] = PERMISSIONS.map((p) => p.key);

export const isValidPermissionKey = (key: string): boolean => key in PERMISSION_MAP;

/** Ordered group names, for rendering the roles editor. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  'Students',
  'Fees',
  'Invoices',
  'Payments',
  'Transport',
  'Reports',
  'Administration',
];

/** Permissions belonging to modules in `enabledModuleKeys`. */
export function permissionsForModules(enabledModuleKeys: Iterable<string>): PermissionDef[] {
  const enabled = new Set(enabledModuleKeys);
  return PERMISSIONS.filter((p) => enabled.has(p.module));
}

// ---------------------------------------------------------------------------
// System roles
// ---------------------------------------------------------------------------

export interface SystemRoleDef {
  /** Stable role key, unique within an organization. Never rename. */
  key: string;
  name: string;
  description: string;
  /** `'*'` means every permission in the catalog, including future ones. */
  permissions: string[] | '*';
  /**
   * The owner role is granted automatically to whoever the org is provisioned
   * for, and an org must always retain at least one member holding it.
   */
  isOwner?: boolean;
}

/**
 * Roles every organization is provisioned with. These are written into the
 * `Role` table per-org (with `isSystem = true`) when the org is created, so a
 * school can *see* them and assign them but not edit or delete them. Orgs may
 * add their own roles alongside these.
 */
export const SYSTEM_ROLES: SystemRoleDef[] = [
  {
    key: 'owner',
    name: 'Owner',
    description: 'Full control including billing, modules, team, and roles.',
    permissions: '*',
    isOwner: true,
  },
  {
    key: 'admin',
    name: 'Administrator',
    description: 'Runs the school day to day. Everything except plugging modules in or out.',
    permissions: ALL_PERMISSION_KEYS.filter((k) => k !== 'modules:manage'),
  },
  {
    key: 'accountant',
    name: 'Accountant',
    description: 'Handles fees, invoicing, and collections. Read-only on students.',
    permissions: [
      'students:read',
      'classes:read',
      'fees:read',
      'fees:write',
      'invoices:read',
      'invoices:write',
      'invoices:discount',
      'payments:read',
      'payments:write',
      'transport:read',
      'reports:read',
      'settings:read',
    ],
  },
  {
    key: 'teacher',
    name: 'Teacher',
    description: 'Views their students and classes. No access to money.',
    permissions: ['students:read', 'classes:read', 'settings:read'],
  },
  {
    key: 'viewer',
    name: 'Viewer',
    description: 'Read-only access across every module the school has enabled.',
    permissions: ALL_PERMISSION_KEYS.filter((k) => k.endsWith(':read')),
  },
];

export const SYSTEM_ROLE_MAP: Record<string, SystemRoleDef> = Object.fromEntries(
  SYSTEM_ROLES.map((r) => [r.key, r]),
);

/** The role key that must always have at least one holder in an org. */
export const OWNER_ROLE_KEY = 'owner';

/** Resolve a system role's permission list, expanding the `'*'` wildcard. */
export function systemRolePermissions(key: string): string[] {
  const def = SYSTEM_ROLE_MAP[key];
  if (!def) return [];
  return def.permissions === '*' ? [...ALL_PERMISSION_KEYS] : [...def.permissions];
}

/**
 * The single "can this member do X" check, used by the API guard and the web
 * client alike.
 *
 * A permission counts only if its owning module is enabled for the org — so
 * disabling the Fees module instantly revokes `payments:write` from everyone,
 * without touching a single RolePermission row.
 */
export function hasPermission(
  granted: Iterable<string>,
  required: string,
  enabledModuleKeys?: Iterable<string>,
): boolean {
  const set = granted instanceof Set ? granted : new Set(granted);
  if (!set.has(required)) return false;
  if (!enabledModuleKeys) return true;
  const def = PERMISSION_MAP[required];
  if (!def) return false;
  return new Set(enabledModuleKeys).has(def.module);
}

/** Filter a granted permission list down to those on currently-enabled modules. */
export function effectivePermissions(
  granted: Iterable<string>,
  enabledModuleKeys: Iterable<string>,
): string[] {
  const enabled = new Set(enabledModuleKeys);
  return [...granted].filter((k) => {
    const def = PERMISSION_MAP[k];
    return def ? enabled.has(def.module) : false;
  });
}

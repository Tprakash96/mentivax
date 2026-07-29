import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSION_KEYS,
  MODULES,
  OWNER_ROLE_KEY,
  PERMISSIONS,
  PERMISSION_MAP,
  SYSTEM_ROLES,
  effectivePermissions,
  hasPermission,
  isValidPermissionKey,
  permissionsForModules,
  systemRolePermissions,
} from './index';

const MODULE_KEYS = new Set(MODULES.map((m) => m.key));

describe('permission catalog', () => {
  it('has unique keys', () => {
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(PERMISSIONS.length);
  });

  it('uses resource:action keys throughout', () => {
    for (const p of PERMISSIONS) expect(p.key).toMatch(/^[a-z]+:[a-z]+$/);
  });

  it('only references modules that exist in the catalog', () => {
    // A permission on an unknown module would be permanently unreachable,
    // because every check intersects with the org's enabled modules.
    for (const p of PERMISSIONS) expect(MODULE_KEYS).toContain(p.module);
  });

  it('validates keys', () => {
    expect(isValidPermissionKey('students:read')).toBe(true);
    expect(isValidPermissionKey('students:hack')).toBe(false);
  });
});

describe('system roles', () => {
  it('always includes an owner role', () => {
    expect(SYSTEM_ROLES.some((r) => r.key === OWNER_ROLE_KEY && r.isOwner)).toBe(true);
  });

  it('grants the owner every permission, including ones added later', () => {
    expect(systemRolePermissions('owner').sort()).toEqual([...ALL_PERMISSION_KEYS].sort());
  });

  it('withholds module management from the administrator role', () => {
    // Plugging modules in and out changes what the school is billed, so it
    // stays with the owner even though admins can do everything else.
    expect(systemRolePermissions('admin')).not.toContain('modules:manage');
    expect(systemRolePermissions('admin')).toContain('members:write');
  });

  it('keeps the accountant away from student mutation and the team', () => {
    const acct = systemRolePermissions('accountant');
    expect(acct).toContain('payments:write');
    expect(acct).not.toContain('students:write');
    expect(acct).not.toContain('members:write');
    expect(acct).not.toContain('payments:delete');
  });

  it('gives the teacher no access to money', () => {
    const teacher = systemRolePermissions('teacher');
    expect(teacher.some((k) => k.startsWith('payments:') || k.startsWith('invoices:'))).toBe(false);
  });

  it('makes viewer strictly read-only', () => {
    for (const key of systemRolePermissions('viewer')) expect(key.endsWith(':read')).toBe(true);
  });

  it('grants only keys that exist', () => {
    for (const role of SYSTEM_ROLES) {
      for (const key of systemRolePermissions(role.key)) {
        expect(PERMISSION_MAP[key], `${role.key} grants unknown "${key}"`).toBeDefined();
      }
    }
  });

  it('returns nothing for an unknown role', () => {
    expect(systemRolePermissions('nope')).toEqual([]);
  });
});

describe('hasPermission', () => {
  const granted = ['students:read', 'payments:write'];

  it('accepts a held permission', () => {
    expect(hasPermission(granted, 'students:read')).toBe(true);
  });

  it('rejects one that was never granted', () => {
    expect(hasPermission(granted, 'students:write')).toBe(false);
  });

  it('rejects a held permission whose module is plugged out', () => {
    // Disabling Fees must revoke payment rights without editing any role.
    expect(hasPermission(granted, 'payments:write', ['students'])).toBe(false);
    expect(hasPermission(granted, 'payments:write', ['students', 'fees'])).toBe(true);
  });

  it('rejects unknown keys even when the caller claims to hold them', () => {
    expect(hasPermission(['students:hack'], 'students:hack', ['students'])).toBe(false);
  });
});

describe('effectivePermissions', () => {
  it('drops permissions belonging to disabled modules', () => {
    const granted = ['students:read', 'payments:write', 'transport:read'];
    expect(effectivePermissions(granted, ['students', 'fees'])).toEqual([
      'students:read',
      'payments:write',
    ]);
  });

  it('drops keys that are not in the catalog', () => {
    expect(effectivePermissions(['bogus:key'], ['students'])).toEqual([]);
  });

  it('is empty when no modules are enabled', () => {
    expect(effectivePermissions(ALL_PERMISSION_KEYS, [])).toEqual([]);
  });
});

describe('permissionsForModules', () => {
  it('returns only the enabled modules’ permissions', () => {
    const forFees = permissionsForModules(['fees']);
    expect(forFees.length).toBeGreaterThan(0);
    for (const p of forFees) expect(p.module).toBe('fees');
  });

  it('covers the whole catalog when everything is enabled', () => {
    expect(permissionsForModules(MODULE_KEYS)).toHaveLength(PERMISSIONS.length);
  });
});

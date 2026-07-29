/**
 * Zod schemas for authentication, organization provisioning, and RBAC.
 * Shared by the NestJS API (validation) and the typed api-client (types).
 */
import { z } from 'zod';
import { isValidPermissionKey } from './permissions';

// --- Auth -------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshDto = z.infer<typeof refreshSchema>;

/** Minimum password policy, applied everywhere a password is set. */
export const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200, 'Password is too long');

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordField,
});
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

// --- Organizations (platform admin) ----------------------------------------

/** Lowercase, URL-safe, hyphen-separated. Used in URLs and must stay stable. */
export const slugField = z
  .string()
  .min(2, 'Slug must be at least 2 characters')
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only');

export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'School name is required').max(160),
  slug: slugField,
  shortCode: z.string().min(1, 'Short code is required').max(6),
  currency: z.string().length(3).default('INR'),
  timezone: z.string().min(1).default('Asia/Kolkata'),
  /** Module keys to plug in at provisioning time. Core modules are implicit. */
  modules: z.array(z.string()).default([]),
  /**
   * The school's first user, who receives the Owner role. Provisioning an org
   * without an owner would leave it unreachable, so this is required.
   */
  owner: z.object({
    name: z.string().min(1, 'Owner name is required').max(160),
    email: z.string().email('Enter a valid email address'),
    password: passwordField,
  }),
  /** First academic year. Without one, tenant resolution fails. */
  academicYear: z.object({
    label: z.string().min(1, 'Academic year label is required'),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
  }),
});
export type CreateOrganizationDto = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  shortCode: z.string().min(1).max(6).optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateOrganizationDto = z.infer<typeof updateOrganizationSchema>;

// --- Members (org-level user management) ------------------------------------

export const createMemberSchema = z.object({
  name: z.string().min(1, 'Name is required').max(160),
  email: z.string().email('Enter a valid email address'),
  /**
   * Omit to attach an existing Mentivax account to this school instead of
   * creating a new one (the same person can work at several schools).
   */
  password: passwordField.optional(),
  roleId: z.string().min(1, 'Pick a role'),
});
export type CreateMemberDto = z.infer<typeof createMemberSchema>;

export const updateMemberSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  roleId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateMemberDto = z.infer<typeof updateMemberSchema>;

export const resetMemberPasswordSchema = z.object({
  newPassword: passwordField,
});
export type ResetMemberPasswordDto = z.infer<typeof resetMemberPasswordSchema>;

// --- Roles ------------------------------------------------------------------

const permissionKeyList = z
  .array(z.string())
  .refine((keys) => keys.every(isValidPermissionKey), {
    message: 'Contains an unknown permission key',
  });

export const createRoleSchema = z.object({
  name: z.string().min(2, 'Role name is required').max(60),
  description: z.string().max(300).optional(),
  permissions: permissionKeyList.default([]),
});
export type CreateRoleDto = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  description: z.string().max(300).optional(),
  permissions: permissionKeyList.optional(),
});
export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;

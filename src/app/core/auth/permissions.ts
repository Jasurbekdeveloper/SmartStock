import { signal } from '@angular/core';
import type { StoreRole, UserRole } from '../services/auth.service';

/**
 * Store permissions — what each role may do. ROLE_PERMISSIONS are the defaults; the
 * super admin can change them for the whole platform (`platformConfig/rolePermissions`,
 * see RolePermissionsService), and roleCan() always reads the effective set. Routes
 * (permissionGuard), the sidebar, buttons and the users page table all go through it.
 * firestore.rules reads the same doc (with the same defaults in defaultRolePermissions())
 * — keep the defaults in both places in sync (a unit test compares them).
 */
export type Permission =
  | 'pos.sell'
  | 'pos.discount'
  | 'pos.priceOverride'
  | 'sales.viewOwn'
  | 'sales.viewAll'
  | 'sales.refund'
  | 'shifts.own'
  | 'shifts.viewAll'
  | 'products.view'
  | 'products.manage'
  | 'products.viewCost'
  | 'stock.manage'
  | 'suppliers.manage'
  | 'customers.manage'
  | 'debts.manage'
  | 'reports.view'
  | 'finance.manage'
  | 'auditLog.view'
  | 'users.manage'
  | 'settings.manage'
  | 'subscription.manage';

export const STORE_ROLES: readonly StoreRole[] = ['admin', 'manager', 'cashier'];

const CASHIER: readonly Permission[] = ['pos.sell', 'pos.discount', 'sales.viewOwn', 'sales.refund', 'shifts.own'];

const MANAGER: readonly Permission[] = [
  ...CASHIER,
  'pos.priceOverride',
  'sales.viewAll',
  'shifts.viewAll',
  'products.view',
  'products.manage',
  'products.viewCost',
  'stock.manage',
  'suppliers.manage',
  'customers.manage',
  'debts.manage',
  'reports.view',
  'finance.manage',
  'auditLog.view'
];

const ADMIN: readonly Permission[] = [...MANAGER, 'users.manage', 'settings.manage', 'subscription.manage'];

export const ROLE_PERMISSIONS: Readonly<Record<StoreRole, readonly Permission[]>> = {
  admin: ADMIN,
  manager: MANAGER,
  cashier: CASHIER
};

/** Rows of the permissions table, grouped as in the sidebar. Labels are i18n keys `permissions.<id>`. */
export const PERMISSION_GROUPS: readonly { id: string; permissions: readonly Permission[] }[] = [
  { id: 'sales', permissions: ['pos.sell', 'pos.discount', 'pos.priceOverride', 'sales.viewOwn', 'sales.viewAll', 'sales.refund', 'shifts.own', 'shifts.viewAll'] },
  { id: 'catalog', permissions: ['products.view', 'products.manage', 'products.viewCost', 'stock.manage', 'suppliers.manage'] },
  { id: 'clients', permissions: ['customers.manage', 'debts.manage'] },
  { id: 'reports', permissions: ['reports.view', 'finance.manage', 'auditLog.view'] },
  { id: 'admin', permissions: ['users.manage', 'settings.manage', 'subscription.manage'] }
];

export const ALL_PERMISSIONS: readonly Permission[] = PERMISSION_GROUPS.flatMap((g) => g.permissions);

/** The admin can never lose these, so a store can't lock itself out of its own settings. */
export const LOCKED_PERMISSIONS: Readonly<Partial<Record<StoreRole, readonly Permission[]>>> = {
  admin: ['users.manage', 'settings.manage']
};

export type RolePermissionMap = Record<StoreRole, Permission[]>;

/** Cleans a stored config: known permissions only, locked ones always on, defaults for a missing role. */
export function normalizeRolePermissions(raw: unknown): RolePermissionMap {
  const known = new Set<string>(ALL_PERMISSIONS);
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = {} as RolePermissionMap;
  for (const role of STORE_ROLES) {
    const list = Array.isArray(data[role]) ? (data[role] as unknown[]).filter((p): p is Permission => typeof p === 'string' && known.has(p)) : [...ROLE_PERMISSIONS[role]];
    out[role] = [...new Set([...list, ...(LOCKED_PERMISSIONS[role] ?? [])])];
  }
  return out;
}

/** Effective permissions; null = the defaults above. Set by RolePermissionsService. */
const activePermissions = signal<RolePermissionMap | null>(null);

export function setRolePermissions(config: unknown | null) {
  activePermissions.set(config ? normalizeRolePermissions(config) : null);
}

export function permissionsFor(role: StoreRole): readonly Permission[] {
  return activePermissions()?.[role] ?? ROLE_PERMISSIONS[role];
}

export function roleCan(role: UserRole | null | undefined, permission: Permission): boolean {
  if (!role || role === 'superadmin') return false;
  return permissionsFor(role)?.includes(permission) ?? false;
}

/** Where a role lands after login or when a page is not allowed: the dashboard needs
 *  reports, so a cashier starts at the till. */
export function homePath(role: UserRole | null | undefined): string {
  return roleCan(role, 'reports.view') ? '/dashboard' : '/pos';
}

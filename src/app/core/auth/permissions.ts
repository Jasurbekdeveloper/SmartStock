import type { StoreRole, UserRole } from '../services/auth.service';

/**
 * Store permissions — the single source of truth for what each role may do. Routes
 * (permissionGuard), the sidebar, buttons and the "Rollar va huquqlar" table on the
 * users page all read ROLE_PERMISSIONS, so they can't drift apart. firestore.rules
 * enforces the same split server-side (staff = admin/manager; cashiers only their own
 * sales and shifts) — keep both in sync when changing a role.
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

const CASHIER: readonly Permission[] = ['pos.sell', 'pos.discount', 'sales.viewOwn', 'shifts.own'];

const MANAGER: readonly Permission[] = [
  ...CASHIER,
  'pos.priceOverride',
  'sales.viewAll',
  'sales.refund',
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

export function roleCan(role: UserRole | null | undefined, permission: Permission): boolean {
  if (!role || role === 'superadmin') return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Where a role lands after login or when a page is not allowed: the dashboard needs
 *  reports, so a cashier starts at the till. */
export function homePath(role: UserRole | null | undefined): string {
  return roleCan(role, 'reports.view') ? '/dashboard' : '/pos';
}

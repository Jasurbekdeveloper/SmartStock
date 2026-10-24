import { describe, expect, it } from 'vitest';
import { homePath, PERMISSION_GROUPS, ROLE_PERMISSIONS, roleCan } from './permissions';

describe('permissions', () => {
  it('lets a cashier sell and see only their own sales', () => {
    expect(roleCan('cashier', 'pos.sell')).toBe(true);
    expect(roleCan('cashier', 'sales.viewOwn')).toBe(true);
    expect(roleCan('cashier', 'sales.viewAll')).toBe(false);
    expect(roleCan('cashier', 'products.manage')).toBe(false);
    expect(roleCan('cashier', 'sales.refund')).toBe(false);
    expect(roleCan('cashier', 'reports.view')).toBe(false);
  });

  it('keeps users, settings and the subscription to the admin', () => {
    expect(roleCan('manager', 'products.manage')).toBe(true);
    expect(roleCan('manager', 'users.manage')).toBe(false);
    expect(roleCan('admin', 'users.manage')).toBe(true);
    expect(roleCan('superadmin', 'pos.sell')).toBe(false);
  });

  it('sends cashiers to the till', () => {
    expect(homePath('cashier')).toBe('/pos');
    expect(homePath('manager')).toBe('/dashboard');
  });

  it('lists every permission in the table', () => {
    const listed = new Set(PERMISSION_GROUPS.flatMap((g) => g.permissions));
    for (const permission of ROLE_PERMISSIONS.admin) expect(listed.has(permission)).toBe(true);
  });
});

import { SubscriptionState, Tenant, getSubscriptionInfo } from '../core/models/saas';
import { formatNumber } from '../core/utils/format-number';

/** Subscription prices are always in so'm, independent of any store's settings. */
export function money(value: number): string {
  return `${formatNumber(value, 0)} so'm`;
}

/** Badge colors per effective subscription state, shared by every platform page. */
export const STATE_BADGE: Record<SubscriptionState, string> = {
  trial: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  grace: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  readonly: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  suspended: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
};

export function tenantState(tenant: Tenant): SubscriptionState {
  return getSubscriptionInfo(tenant).state;
}

export function stateKey(state: SubscriptionState): string {
  return `subscription.state.${state}`;
}

/** Readable random password for a new owner (no look-alike characters). */
export function generatePassword(length = 10): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (n) => chars[n % chars.length]).join('');
}

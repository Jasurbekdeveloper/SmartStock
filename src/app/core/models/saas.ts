import { LocalizedText } from './site-content';

export type TenantStatus = 'trial' | 'active' | 'suspended' | 'cancelled';

/** `tenants/{id}` — one store on the platform. Subscription fields (status, plan,
 *  limits, paidUntil) are written only by the super admin. */
export interface Tenant {
  id: string;
  name: string;
  ownerId: string;
  ownerName?: string;
  ownerEmail?: string;
  phone?: string;
  address?: string;
  planId?: string;
  planName?: string;
  status: TenantStatus;
  /** End of the paid (or trial) period. Missing = no expiry (legacy store). */
  paidUntil?: Date;
  maxUsers?: number;
  maxProducts?: number;
  /** false until the owner finishes the first-login setup. Missing = already set up. */
  onboarded?: boolean;
  createdAt?: Date;
  createdBy?: string;
}

/** `plans/{id}` — limits are copied onto the tenant when a plan is assigned. */
export interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  maxUsers: number;
  maxProducts: number;
  active: boolean;
  /** Listed in the website's pricing section (website/main.js reads plans publicly). */
  showOnSite?: boolean;
  /** Marked "Popular" on the website. */
  highlighted?: boolean;
  /** Extra website bullet points per language, one per line. */
  siteFeatures?: LocalizedText;
  createdAt?: Date;
}

export type PaymentMethod = 'cash' | 'card' | 'transfer';

/** `subscriptionPayments/{id}` — recorded by the super admin, immutable. */
export interface SubscriptionPayment {
  id: string;
  tenantId: string;
  tenantName: string;
  amount: number;
  months: number;
  method: PaymentMethod;
  note?: string;
  paidUntilBefore?: Date | null;
  paidUntilAfter: Date;
  recordedBy: string;
  recordedByName: string;
  createdAt?: Date;
  /** A cancelled payment stays in the history (money trail) but no longer counts. */
  voided?: boolean;
  voidedAt?: Date;
  voidedBy?: string;
  voidedByName?: string;
}

export type PlatformAuditAction =
  | 'tenant_create'
  | 'tenant_status'
  | 'tenant_plan'
  | 'payment_record'
  | 'tenant_user_create'
  | 'tenant_user_active'
  | 'tenant_edit'
  | 'tenant_owner'
  | 'payment_void'
  | 'site_update';

/** `platformAudit/{id}` — what the super admin did, immutable. */
export interface PlatformAuditEntry {
  id: string;
  action: PlatformAuditAction;
  tenantId?: string;
  tenantName?: string;
  details?: string;
  userId: string;
  userName: string;
  createdAt?: Date;
}

/** Days after `paidUntil` during which the store still works but sees a warning.
 *  Must match `GRACE_DAYS` in firestore.rules. */
export const GRACE_DAYS = 3;
export const DEFAULT_TRIAL_DAYS = 14;
/** Show the "expires soon" reminder this many days ahead. */
export const EXPIRY_WARNING_DAYS = 5;

export type SubscriptionState = 'trial' | 'active' | 'grace' | 'readonly' | 'suspended';

export interface SubscriptionInfo {
  state: SubscriptionState;
  /** Whole days until paidUntil (trial/active) or until the grace period ends (grace).
   *  null when there is no expiry or the store is already read-only/suspended. */
  daysLeft: number | null;
  canWrite: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Effective subscription state — the same rule firestore.rules applies to writes. */
export function getSubscriptionInfo(tenant: Pick<Tenant, 'status' | 'paidUntil'>, now = new Date()): SubscriptionInfo {
  if (tenant.status === 'suspended' || tenant.status === 'cancelled') {
    return { state: 'suspended', daysLeft: null, canWrite: false };
  }
  const base: SubscriptionState = tenant.status === 'trial' ? 'trial' : 'active';
  if (!tenant.paidUntil) {
    return { state: base, daysLeft: null, canWrite: true };
  }
  const paidUntil = tenant.paidUntil.getTime();
  if (now.getTime() < paidUntil) {
    return { state: base, daysLeft: Math.ceil((paidUntil - now.getTime()) / DAY_MS), canWrite: true };
  }
  const graceEnd = paidUntil + GRACE_DAYS * DAY_MS;
  if (now.getTime() < graceEnd) {
    return { state: 'grace', daysLeft: Math.ceil((graceEnd - now.getTime()) / DAY_MS), canWrite: true };
  }
  return { state: 'readonly', daysLeft: null, canWrite: false };
}

/** Adds whole calendar months; a payment always extends from the later of today or the
 *  current paidUntil, so paying early never loses days. */
export function extendPaidUntil(current: Date | undefined | null, months: number, now = new Date()): Date {
  const start = current && current.getTime() > now.getTime() ? new Date(current) : new Date(now);
  const day = start.getDate();
  start.setMonth(start.getMonth() + months);
  // e.g. Jan 31 + 1 month would roll into March; clamp to the month's last day instead.
  if (start.getDate() < day) start.setDate(0);
  return start;
}

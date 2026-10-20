import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import {
  Firestore,
  Timestamp,
  collection,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromCollectionQuery, fromDocRef } from '../firebase/firestore.utils';
import { createAuthAccount } from '../firebase/create-auth-account';
import {
  DEFAULT_TRIAL_DAYS,
  PaymentMethod,
  Plan,
  PlatformAuditAction,
  PlatformAuditEntry,
  SubscriptionPayment,
  Tenant,
  TenantStatus,
  extendPaidUntil
} from '../models/saas';
import { AppUser, AuthService, StoreRole } from './auth.service';
import { DEFAULT_PRICES_INCLUDE_VAT, DEFAULT_VAT_RATE } from './settings.service';

export interface CreateTenantInput {
  storeName: string;
  phone?: string;
  plan: Plan;
  trialDays: number;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
}

export interface TenantUserInput {
  displayName: string;
  email: string;
  password: string;
  role: StoreRole;
}

export interface RecordPaymentInput {
  amount: number;
  months: number;
  method: PaymentMethod;
  note?: string;
}

/** Starter plans offered on an empty plans list; the super admin sets real prices. */
export const SAMPLE_PLANS: Omit<Plan, 'id'>[] = [
  { name: 'Start', priceMonthly: 0, maxUsers: 2, maxProducts: 500, active: true },
  { name: 'Biznes', priceMonthly: 0, maxUsers: 5, maxProducts: 5000, active: true },
  { name: 'Pro', priceMonthly: 0, maxUsers: 0, maxProducts: 0, active: true }
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Super-admin operations across all stores. Every write is also allowed only to
 *  platform admins by firestore.rules (`isSuperAdmin()`). */
@Injectable({
  providedIn: 'root'
})
export class PlatformService {
  private firestore: Firestore = inject(FIRESTORE);
  private authService = inject(AuthService);

  getTenants(): Observable<Tenant[]> {
    return fromCollectionQuery<Tenant>(query(collection(this.firestore, 'tenants'), orderBy('createdAt', 'desc')));
  }

  getTenant(id: string): Observable<Tenant | undefined> {
    return fromDocRef<Tenant>(doc(this.firestore, 'tenants', id));
  }

  getTenantUsers(tenantId: string): Observable<AppUser[]> {
    return fromCollectionQuery<AppUser>(
      query(collection(this.firestore, 'users'), where('tenantId', '==', tenantId), orderBy('createdAt', 'desc'))
    );
  }

  getPlans(): Observable<Plan[]> {
    return fromCollectionQuery<Plan>(query(collection(this.firestore, 'plans'), orderBy('priceMonthly', 'asc')));
  }

  getPayments(tenantId?: string, max = 50): Observable<SubscriptionPayment[]> {
    const ref = collection(this.firestore, 'subscriptionPayments');
    return fromCollectionQuery<SubscriptionPayment>(
      tenantId
        ? query(ref, where('tenantId', '==', tenantId), orderBy('createdAt', 'desc'))
        : query(ref, orderBy('createdAt', 'desc'), limit(max))
    );
  }

  getAudit(max = 200): Observable<PlatformAuditEntry[]> {
    return fromCollectionQuery<PlatformAuditEntry>(
      query(collection(this.firestore, 'platformAudit'), orderBy('createdAt', 'desc'), limit(max))
    );
  }

  savePlan(plan: Omit<Plan, 'id'>, id?: string): Observable<void> {
    const ref = id ? doc(this.firestore, 'plans', id) : doc(collection(this.firestore, 'plans'));
    return from(setDoc(ref, { ...plan, ...(id ? {} : { createdAt: serverTimestamp() }) }, { merge: true }));
  }

  seedSamplePlans(): Observable<void> {
    const batch = writeBatch(this.firestore);
    for (const plan of SAMPLE_PLANS) {
      batch.set(doc(collection(this.firestore, 'plans')), { ...plan, createdAt: serverTimestamp() });
    }
    return from(batch.commit());
  }

  /** Creates the owner's login, then the store, its owner profile and default settings
   *  in one batch. Returns the new tenant id. */
  createTenant(input: CreateTenantInput): Observable<string> {
    return from(this.createTenantAsync(input));
  }

  private async createTenantAsync(input: CreateTenantInput): Promise<string> {
    const ownerUid = await createAuthAccount(input.ownerEmail, input.ownerPassword);
    const tenantRef = doc(collection(this.firestore, 'tenants'));
    const paidUntil = new Date(Date.now() + input.trialDays * DAY_MS);
    const batch = writeBatch(this.firestore);

    batch.set(tenantRef, {
      name: input.storeName,
      ownerId: ownerUid,
      ownerName: input.ownerName,
      ownerEmail: input.ownerEmail,
      ...(input.phone ? { phone: input.phone } : {}),
      planId: input.plan.id,
      planName: input.plan.name,
      maxUsers: input.plan.maxUsers,
      maxProducts: input.plan.maxProducts,
      status: 'trial' satisfies TenantStatus,
      paidUntil: Timestamp.fromDate(paidUntil),
      onboarded: false,
      createdAt: serverTimestamp(),
      createdBy: this.actorId()
    });
    batch.set(doc(this.firestore, 'users', ownerUid), {
      email: input.ownerEmail,
      displayName: input.ownerName,
      role: 'admin',
      active: true,
      tenantId: tenantRef.id,
      createdAt: serverTimestamp()
    });
    batch.set(doc(this.firestore, 'settings', tenantRef.id), {
      storeName: input.storeName,
      vatRate: DEFAULT_VAT_RATE,
      pricesIncludeVat: DEFAULT_PRICES_INCLUDE_VAT,
      currencySymbol: "so'm",
      receiptPaperWidth: '80',
      ...(input.phone ? { storePhone: input.phone } : {})
    });
    this.addAudit(batch, 'tenant_create', tenantRef.id, input.storeName, `${input.plan.name}, ${input.trialDays}d trial, ${input.ownerEmail}`);

    await batch.commit();
    return tenantRef.id;
  }

  addTenantUser(tenant: Tenant, input: TenantUserInput): Observable<void> {
    return from(
      (async () => {
        const uid = await createAuthAccount(input.email, input.password);
        const batch = writeBatch(this.firestore);
        batch.set(doc(this.firestore, 'users', uid), {
          email: input.email,
          displayName: input.displayName,
          role: input.role,
          active: true,
          tenantId: tenant.id,
          createdAt: serverTimestamp()
        });
        this.addAudit(batch, 'tenant_user_create', tenant.id, tenant.name, `${input.email} (${input.role})`);
        await batch.commit();
      })()
    );
  }

  setUserActive(tenant: Tenant, user: AppUser, active: boolean): Observable<void> {
    const batch = writeBatch(this.firestore);
    batch.update(doc(this.firestore, 'users', user.uid), { active });
    this.addAudit(batch, 'tenant_user_active', tenant.id, tenant.name, `${user.email}: ${active ? 'on' : 'off'}`);
    return from(batch.commit());
  }

  setStatus(tenant: Tenant, status: TenantStatus): Observable<void> {
    const batch = writeBatch(this.firestore);
    batch.update(doc(this.firestore, 'tenants', tenant.id), { status });
    this.addAudit(batch, 'tenant_status', tenant.id, tenant.name, `${tenant.status} → ${status}`);
    return from(batch.commit());
  }

  changePlan(tenant: Tenant, plan: Plan): Observable<void> {
    const batch = writeBatch(this.firestore);
    batch.update(doc(this.firestore, 'tenants', tenant.id), {
      planId: plan.id,
      planName: plan.name,
      maxUsers: plan.maxUsers,
      maxProducts: plan.maxProducts
    });
    this.addAudit(batch, 'tenant_plan', tenant.id, tenant.name, `${tenant.planName ?? '—'} → ${plan.name}`);
    return from(batch.commit());
  }

  /** Records a payment and moves paidUntil forward by whole months. A trial store
   *  becomes active on its first payment. */
  recordPayment(tenant: Tenant, input: RecordPaymentInput): Observable<void> {
    const paidUntilAfter = extendPaidUntil(tenant.paidUntil, input.months);
    const user = this.authService.getCurrentUser();
    const batch = writeBatch(this.firestore);
    batch.set(doc(collection(this.firestore, 'subscriptionPayments')), {
      tenantId: tenant.id,
      tenantName: tenant.name,
      amount: input.amount,
      months: input.months,
      method: input.method,
      ...(input.note ? { note: input.note } : {}),
      paidUntilBefore: tenant.paidUntil ? Timestamp.fromDate(tenant.paidUntil) : null,
      paidUntilAfter: Timestamp.fromDate(paidUntilAfter),
      recordedBy: user?.uid ?? '',
      recordedByName: user?.displayName || user?.email || '',
      createdAt: serverTimestamp()
    });
    batch.update(doc(this.firestore, 'tenants', tenant.id), {
      paidUntil: Timestamp.fromDate(paidUntilAfter),
      ...(tenant.status === 'trial' ? { status: 'active' } : {})
    });
    this.addAudit(batch, 'payment_record', tenant.id, tenant.name, `${input.amount} × ${input.months}m (${input.method})`);
    return from(batch.commit());
  }

  private actorId(): string {
    return this.authService.getCurrentUser()?.uid ?? '';
  }

  private addAudit(
    batch: ReturnType<typeof writeBatch>,
    action: PlatformAuditAction,
    tenantId: string,
    tenantName: string,
    details: string
  ) {
    const user = this.authService.getCurrentUser();
    batch.set(doc(collection(this.firestore, 'platformAudit')), {
      action,
      tenantId,
      tenantName,
      details,
      userId: user?.uid ?? '',
      userName: user?.displayName || user?.email || '',
      createdAt: serverTimestamp()
    });
  }
}

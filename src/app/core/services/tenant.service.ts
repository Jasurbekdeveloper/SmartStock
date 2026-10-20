import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, from, of, switchMap } from 'rxjs';
import { collection, doc, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromCollectionQuery, fromDocRef } from '../firebase/firestore.utils';
import { SubscriptionInfo, SubscriptionPayment, Tenant, getSubscriptionInfo } from '../models/saas';
import { AuthService } from './auth.service';
import { requireTenantId } from './tenant-data';

export interface OnboardingInput {
  storeName: string;
  phone?: string;
  address?: string;
  pricesIncludeVat: boolean;
}

/** The signed-in user's own store (`tenants/{tenantId}`) and its subscription state. */
@Injectable({
  providedIn: 'root'
})
export class TenantService {
  private firestore = inject(FIRESTORE);
  private authService = inject(AuthService);

  readonly tenant$: Observable<Tenant | undefined> = this.authService.currentUser$.pipe(
    switchMap((user) =>
      user?.tenantId ? fromDocRef<Tenant>(doc(this.firestore, 'tenants', user.tenantId)) : of(undefined)
    )
  );

  /** undefined while loading, for the super admin, or when signed out. */
  tenant = toSignal(this.tenant$, { initialValue: undefined });

  subscription = computed<SubscriptionInfo>(() => {
    const tenant = this.tenant();
    return tenant ? getSubscriptionInfo(tenant) : { state: 'active', daysLeft: null, canWrite: true };
  });

  isOwner = computed(() => {
    const tenant = this.tenant();
    return !!tenant && tenant.ownerId === this.authService.getCurrentUser()?.uid;
  });

  getPayments(): Observable<SubscriptionPayment[]> {
    return fromCollectionQuery<SubscriptionPayment>(
      query(
        collection(this.firestore, 'subscriptionPayments'),
        where('tenantId', '==', requireTenantId(this.authService)),
        orderBy('createdAt', 'desc')
      )
    );
  }

  /** First-login setup: store details go to both the tenant doc (platform view) and the
   *  store settings (receipts, header), and the tenant is marked as set up. */
  completeOnboarding(input: OnboardingInput): Observable<void> {
    const tenantId = requireTenantId(this.authService);
    const batch = writeBatch(this.firestore);
    const contact = {
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.address ? { address: input.address } : {})
    };
    batch.update(doc(this.firestore, 'tenants', tenantId), {
      name: input.storeName,
      ...contact,
      onboarded: true,
      updatedAt: serverTimestamp()
    });
    batch.set(
      doc(this.firestore, 'settings', tenantId),
      {
        storeName: input.storeName,
        pricesIncludeVat: input.pricesIncludeVat,
        ...(input.phone ? { storePhone: input.phone } : {}),
        ...(input.address ? { storeAddress: input.address } : {})
      },
      { merge: true }
    );
    return from(batch.commit());
  }

  skipOnboarding(): Observable<void> {
    return from(updateDoc(doc(this.firestore, 'tenants', requireTenantId(this.authService)), { onboarded: true }));
  }

  /** Keeps the tenant's display name in sync when the admin renames the store in Settings. */
  syncStoreName(name: string): Observable<void> {
    return from(
      setDoc(doc(this.firestore, 'tenants', requireTenantId(this.authService)), { name }, { merge: true })
    );
  }
}

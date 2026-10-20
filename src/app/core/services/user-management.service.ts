import { Injectable, inject } from '@angular/core';
import { Observable, from, tap } from 'rxjs';
import {
  Firestore,
  collection,
  doc,
  getCountFromServer,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { createAuthAccount } from '../firebase/create-auth-account';
import { FIRESTORE } from '../firebase/firebase.providers';
import { AppUser, StoreRole } from './auth.service';
import { fromCollectionQuery } from '../firebase/firestore.utils';
import { AuditLogService } from './audit-log.service';
import { AuthService } from './auth.service';
import { requireTenantId, tenantQuery } from './tenant-data';
import { TenantService } from './tenant.service';

export interface CreateEmployeeInput {
  email: string;
  password: string;
  displayName: string;
  role: StoreRole;
}

@Injectable({
  providedIn: 'root'
})
export class UserManagementService {
  private firestore: Firestore = inject(FIRESTORE);
  private auditLogService = inject(AuditLogService);
  private authService = inject(AuthService);
  private tenantService = inject(TenantService);

  getUsers(): Observable<AppUser[]> {
    const usersQuery = tenantQuery(this.firestore, 'users', requireTenantId(this.authService), orderBy('createdAt', 'desc'));
    return fromCollectionQuery<AppUser>(usersQuery);
  }

  createEmployee(input: CreateEmployeeInput): Observable<void> {
    return from(this.createEmployeeAsync(input));
  }

  /** `previousRole` is optional only so this keeps compiling for any future caller
   *  that doesn't have it handy — pass it whenever the caller already has the
   *  user's current role in scope (see `setActive()`/its call site for the pattern). */
  updateRole(uid: string, role: StoreRole, previousRole?: StoreRole): Observable<void> {
    return from(updateDoc(doc(this.firestore, 'users', uid), { role })).pipe(
      tap(() => {
        // Non-atomic by design (see plan) — a failure here doesn't roll back the
        // role change itself, it only means this one change goes unlogged.
        this.auditLogService
          .log({
            action: 'role_change',
            entityType: 'user',
            entityId: uid,
            before: previousRole !== undefined ? { role: previousRole } : undefined,
            after: { role }
          })
          .subscribe();
      })
    );
  }

  setActive(uid: string, active: boolean, previousActive?: boolean): Observable<void> {
    return from(updateDoc(doc(this.firestore, 'users', uid), { active })).pipe(
      tap(() => {
        this.auditLogService
          .log({
            action: 'active_toggle',
            entityType: 'user',
            entityId: uid,
            before: previousActive !== undefined ? { active: previousActive } : undefined,
            after: { active }
          })
          .subscribe();
      })
    );
  }

  /** Checks the subscription (writable, staff limit) before creating the login, which
   *  goes through a secondary Firebase App so the admin's own session is kept. */
  private async createEmployeeAsync(input: CreateEmployeeInput): Promise<void> {
    const tenantId = requireTenantId(this.authService);
    const tenant = this.tenantService.tenant();
    if (!this.tenantService.subscription().canWrite) {
      throw new Error('TENANT_READ_ONLY');
    }
    if (tenant?.maxUsers) {
      const activeUsers = await getCountFromServer(
        query(collection(this.firestore, 'users'), where('tenantId', '==', tenantId), where('active', '==', true))
      );
      if (activeUsers.data().count >= tenant.maxUsers) {
        throw new Error('USER_LIMIT_REACHED');
      }
    }

    const uid = await createAuthAccount(input.email, input.password);
    await setDoc(doc(this.firestore, 'users', uid), {
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      active: true,
      tenantId,
      createdAt: serverTimestamp()
    });
  }
}

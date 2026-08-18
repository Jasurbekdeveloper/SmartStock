import { Injectable, inject } from '@angular/core';
import { Observable, from, tap } from 'rxjs';
import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import {
  Firestore,
  collection,
  doc,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { FIRESTORE } from '../firebase/firebase.providers';
import { AppUser, UserRole } from './auth.service';
import { fromCollectionQuery } from '../firebase/firestore.utils';
import { AuditLogService } from './audit-log.service';

export interface CreateEmployeeInput {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
}

@Injectable({
  providedIn: 'root'
})
export class UserManagementService {
  private firestore: Firestore = inject(FIRESTORE);
  private auditLogService = inject(AuditLogService);

  getUsers(): Observable<AppUser[]> {
    const usersQuery = query(collection(this.firestore, 'users'), orderBy('createdAt', 'desc'));
    return fromCollectionQuery<AppUser>(usersQuery);
  }

  createEmployee(input: CreateEmployeeInput): Observable<void> {
    return from(this.createEmployeeAsync(input));
  }

  /** `previousRole` is optional only so this keeps compiling for any future caller
   *  that doesn't have it handy — pass it whenever the caller already has the
   *  user's current role in scope (see `setActive()`/its call site for the pattern). */
  updateRole(uid: string, role: UserRole, previousRole?: UserRole): Observable<void> {
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

  /**
   * Creates the Auth account on a throwaway secondary Firebase App so the
   * admin's own session (on the default app) is never signed out.
   */
  private async createEmployeeAsync(input: CreateEmployeeInput): Promise<void> {
    const secondaryApp = initializeApp(environment.firebase, `secondary-${Date.now()}`);
    const secondaryAuth = getAuth(secondaryApp);

    try {
      const credential = await createUserWithEmailAndPassword(
        secondaryAuth,
        input.email,
        input.password
      );

      await setDoc(doc(this.firestore, 'users', credential.user.uid), {
        email: input.email,
        displayName: input.displayName,
        role: input.role,
        active: true,
        createdAt: serverTimestamp()
      });

      await signOut(secondaryAuth);
    } finally {
      await deleteApp(secondaryApp);
    }
  }
}

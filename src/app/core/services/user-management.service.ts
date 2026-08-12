import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
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

  getUsers(): Observable<AppUser[]> {
    const usersQuery = query(collection(this.firestore, 'users'), orderBy('createdAt', 'desc'));
    return fromCollectionQuery<AppUser>(usersQuery);
  }

  createEmployee(input: CreateEmployeeInput): Observable<void> {
    return from(this.createEmployeeAsync(input));
  }

  updateRole(uid: string, role: UserRole): Observable<void> {
    return from(updateDoc(doc(this.firestore, 'users', uid), { role }));
  }

  setActive(uid: string, active: boolean): Observable<void> {
    return from(updateDoc(doc(this.firestore, 'users', uid), { active }));
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

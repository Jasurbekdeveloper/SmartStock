import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, from, of, switchMap } from 'rxjs';
import { map } from 'rxjs/operators';
import { Auth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { Firestore, doc, getDoc } from 'firebase/firestore';
import { FIREBASE_AUTH, FIRESTORE } from '../firebase/firebase.providers';
import { fromDocRef } from '../firebase/firestore.utils';

export type UserRole = 'admin' | 'cashier' | 'manager';

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt?: Date;
}

const SESSION_DURATION_MS = 10 * 60 * 60 * 1000; // 10 soat
const LOGIN_AT_KEY = 'auth_login_at';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth: Auth = inject(FIREBASE_AUTH);
  private firestore: Firestore = inject(FIRESTORE);

  private currentUserSubject = new BehaviorSubject<AppUser | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  private authReadySubject = new BehaviorSubject(false);
  public authReady$ = this.authReadySubject.asObservable();

  constructor() {
    if (this.isSessionExpired()) {
      signOut(this.auth);
      this.clearLoginTimestamp();
    }

    onAuthStateChanged(this.auth, (firebaseUser) => {
      if (!firebaseUser || this.isSessionExpired()) {
        if (firebaseUser) {
          signOut(this.auth);
        }
        this.clearLoginTimestamp();
        this.currentUserSubject.next(null);
        this.authReadySubject.next(true);
        return;
      }

      fromDocRef<Omit<AppUser, 'uid'>>(doc(this.firestore, 'users', firebaseUser.uid)).subscribe({
        next: (profile) => {
          this.currentUserSubject.next(
            profile && profile.active ? { uid: firebaseUser.uid, ...profile } : null
          );
          this.authReadySubject.next(true);
        },
        error: () => {
          this.currentUserSubject.next(null);
          this.authReadySubject.next(true);
        }
      });
    });

    // 10 soatlik sessiya muddati tugaganda, sahifa ochiq turgan taqdirda ham
    // avtomatik chiqib ketish uchun davriy tekshiruv (foydalanuvchi navigatsiya
    // qilmasa ham, masalan bitta POS sahifasida uzoq ishlab tursa).
    if (typeof window !== 'undefined') {
      setInterval(() => {
        if (this.isAuthenticated() && this.isSessionExpired()) {
          this.logout();
        }
      }, 60 * 1000);
    }
  }

  private isSessionExpired(): boolean {
    if (typeof localStorage === 'undefined') return false;
    const loginAt = localStorage.getItem(LOGIN_AT_KEY);
    if (!loginAt) return false;
    return Date.now() - Number(loginAt) > SESSION_DURATION_MS;
  }

  private setLoginTimestamp(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LOGIN_AT_KEY, Date.now().toString());
  }

  private clearLoginTimestamp(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(LOGIN_AT_KEY);
  }

  isAuthenticated(): boolean {
    return !!this.currentUserSubject.value;
  }

  hasRole(...roles: UserRole[]): boolean {
    const user = this.currentUserSubject.value;
    return !!user && roles.includes(user.role);
  }

  getCurrentUser(): AppUser | null {
    return this.currentUserSubject.value;
  }

  login(email: string, password: string): Observable<AppUser> {
    return from(signInWithEmailAndPassword(this.auth, email, password)).pipe(
      switchMap((credential) =>
        from(getDoc(doc(this.firestore, 'users', credential.user.uid))).pipe(
          map((snap) => {
            if (!snap.exists()) {
              signOut(this.auth);
              throw new Error('NO_PROFILE');
            }

            const profile = snap.data() as Omit<AppUser, 'uid'>;
            if (!profile.active) {
              signOut(this.auth);
              throw new Error('INACTIVE');
            }

            const user: AppUser = { uid: credential.user.uid, ...profile };
            this.currentUserSubject.next(user);
            this.setLoginTimestamp();
            return user;
          })
        )
      )
    );
  }

  logout(): void {
    signOut(this.auth);
    this.clearLoginTimestamp();
  }
}

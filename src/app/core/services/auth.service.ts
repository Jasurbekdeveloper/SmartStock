import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, from, of, switchMap } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  Auth,
  onAuthStateChanged,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { Functions, httpsCallable } from 'firebase/functions';
import { Firestore, doc, getDoc } from 'firebase/firestore';
import { FIREBASE_AUTH, FIREBASE_FUNCTIONS, FIRESTORE } from '../firebase/firebase.providers';
import { fromDocRef } from '../firebase/firestore.utils';
import { Permission, roleCan } from '../auth/permissions';

/** `superadmin` is the platform operator (no store); the rest belong to one store. */
export type UserRole = 'superadmin' | 'admin' | 'cashier' | 'manager';

export type StoreRole = Exclude<UserRole, 'superadmin'>;

/** Fields the Telegram Login Widget passes to its onauth callback. */
export interface TelegramAuthData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  /** Empty for the super admin. */
  tenantId: string;
  telegramId?: number;
  telegramUsername?: string;
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
  private functions: Functions = inject(FIREBASE_FUNCTIONS);

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

  /** Whether the signed-in user's role grants `permission` (see core/auth/permissions.ts). */
  can(permission: Permission): boolean {
    return roleCan(this.currentUserSubject.value?.role, permission);
  }

  isSuperAdmin(): boolean {
    return this.currentUserSubject.value?.role === 'superadmin';
  }

  getCurrentUser(): AppUser | null {
    return this.currentUserSubject.value;
  }

  login(email: string, password: string): Observable<AppUser> {
    return from(signInWithEmailAndPassword(this.auth, email, password)).pipe(
      switchMap((credential) => from(this.finishLogin(credential.user.uid)))
    );
  }

  /** Telegram Login Widget payload -> server verifies the bot signature and returns a
   *  Firebase custom token for the account that linked this Telegram ID. */
  loginWithTelegram(data: TelegramAuthData): Observable<AppUser> {
    const call = httpsCallable<TelegramAuthData, { token: string }>(this.functions, 'telegramLogin');
    return from(call(data)).pipe(
      switchMap((result) => from(signInWithCustomToken(this.auth, result.data.token))),
      switchMap((credential) => from(this.finishLogin(credential.user.uid)))
    );
  }

  linkTelegram(data: TelegramAuthData): Observable<void> {
    const call = httpsCallable<TelegramAuthData, void>(this.functions, 'linkTelegram');
    return from(call(data)).pipe(map(() => undefined));
  }

  /** Sign-in through the bot: a one-time code for t.me/<bot>?start=<start>. */
  createTelegramLoginCode(): Observable<{ code: string; start: string }> {
    const call = httpsCallable<void, { code: string; start: string }>(this.functions, 'createTelegramLoginCode');
    return from(call()).pipe(map((result) => result.data));
  }

  /** 'pending' until the user confirms in Telegram; then signs in with the one-time token. */
  async checkTelegramLogin(code: string): Promise<{ status: 'pending' | 'expired' | 'rejected' } | { status: 'confirmed'; user: AppUser }> {
    const call = httpsCallable<{ code: string }, { status: 'pending' | 'expired' | 'rejected' | 'confirmed'; token?: string }>(
      this.functions,
      'checkTelegramLogin'
    );
    const { data } = await call({ code });
    if (data.status !== 'confirmed' || !data.token) return { status: data.status === 'confirmed' ? 'expired' : data.status };
    const credential = await signInWithCustomToken(this.auth, data.token);
    return { status: 'confirmed', user: await this.finishLogin(credential.user.uid) };
  }

  /** Admin: one-time code for t.me/<bot>?startgroup=<start> — that group gets the reports. */
  createTelegramGroupCode(): Observable<{ code: string; start: string }> {
    const call = httpsCallable<void, { code: string; start: string }>(this.functions, 'createTelegramGroupCode');
    return from(call()).pipe(map((result) => result.data));
  }

  /** Admin: sends one report now to the store's Telegram recipients. */
  sendTelegramReportNow(kind: 'daily' | 'weekly' | 'monthly' | 'lowStock' | 'debtDue'): Observable<{ sent: number; recipients: number }> {
    const call = httpsCallable<{ kind: string }, { sent: number; recipients: number }>(this.functions, 'sendTelegramReportNow');
    return from(call({ kind })).pipe(map((result) => result.data));
  }

  /** One-time code for t.me/<bot>?start=<start>: links whichever Telegram account presses Start. */
  createTelegramLinkCode(): Observable<{ code: string; start: string }> {
    const call = httpsCallable<void, { code: string; start: string }>(this.functions, 'createTelegramLinkCode');
    return from(call()).pipe(map((result) => result.data));
  }

  unlinkTelegram(): Observable<void> {
    const call = httpsCallable<void, void>(this.functions, 'unlinkTelegram');
    return from(call()).pipe(map(() => undefined));
  }

  /** Shared by every sign-in method: the Auth account alone isn't enough — it needs an
   *  active profile, and a store user also needs a store that isn't suspended. */
  private async finishLogin(uid: string): Promise<AppUser> {
    const snap = await getDoc(doc(this.firestore, 'users', uid));
    if (!snap.exists()) {
      await signOut(this.auth);
      throw new Error('NO_PROFILE');
    }

    const profile = snap.data() as Omit<AppUser, 'uid'>;
    if (!profile.active) {
      await signOut(this.auth);
      // The role tells the login page whether to send the user to an administrator.
      throw Object.assign(new Error('INACTIVE'), { role: profile.role });
    }

    if (profile.role !== 'superadmin') {
      const tenantSnap = profile.tenantId ? await getDoc(doc(this.firestore, 'tenants', profile.tenantId)) : null;
      const status = tenantSnap?.data()?.['status'];
      if (!tenantSnap?.exists() || status === 'suspended' || status === 'cancelled') {
        await signOut(this.auth);
        throw Object.assign(new Error('TENANT_SUSPENDED'), { role: profile.role });
      }
    }

    const user: AppUser = { uid, ...profile };
    this.currentUserSubject.next(user);
    this.setLoginTimestamp();
    return user;
  }

  logout(): void {
    signOut(this.auth);
    this.clearLoginTimestamp();
  }
}

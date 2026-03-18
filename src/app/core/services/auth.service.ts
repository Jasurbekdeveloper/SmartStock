import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'cashier' | 'manager';
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<AuthUser | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  private tokenSubject = new BehaviorSubject<string | null>(null);
  public token$ = this.tokenSubject.asObservable();

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    if (isPlatformBrowser(this.platformId)) {
      const token = localStorage.getItem('auth_token');
      this.tokenSubject.next(token);

      const userRaw = localStorage.getItem('auth_user');
      if (userRaw) {
        try {
          this.currentUserSubject.next(JSON.parse(userRaw) as AuthUser);
        } catch {
          localStorage.removeItem('auth_user');
        }
      }
    }
  }

  isAuthenticated(): boolean {
    return !!this.tokenSubject.value;
  }

  login(username: string, password: string): Observable<LoginResponse> {
    const url = `${environment.apiBaseUrl}/auth/login`;

    return this.http
      .post<LoginResponse>(url, { username, password } satisfies LoginRequest)
      .pipe(tap((res) => this.setSession(res.token, res.user)));
  }

  logout(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    }
    this.tokenSubject.next(null);
    this.currentUserSubject.next(null);
  }

  getToken(): string | null {
    return this.tokenSubject.value;
  }

  getCurrentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  private setSession(token: string, user: AuthUser) {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
    }

    this.tokenSubject.next(token);
    this.currentUserSubject.next(user);
  }
}

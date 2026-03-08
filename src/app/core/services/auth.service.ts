import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'cashier' | 'manager';
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<AuthUser | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  private tokenSubject = new BehaviorSubject<string | null>(null);
  public token$ = this.tokenSubject.asObservable();

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    if (isPlatformBrowser(this.platformId)) {
      const token = localStorage.getItem('auth_token');
      this.tokenSubject.next(token);
    }
  }

  isAuthenticated(): boolean {
    return !!this.tokenSubject.value;
  }

  login(username: string, password: string): Observable<any> {
    // TODO: Replace with actual API call
    const mockToken = 'mock-jwt-token-' + Date.now();
    
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('auth_token', mockToken);
    }
    
    this.tokenSubject.next(mockToken);

    const mockUser: AuthUser = {
      id: '1',
      username: username,
      email: username + '@example.com',
      role: 'admin'
    };
    this.currentUserSubject.next(mockUser);

    return new Observable(observer => {
      observer.next({ token: mockToken, user: mockUser });
      observer.complete();
    });
  }

  logout(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('auth_token');
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
}

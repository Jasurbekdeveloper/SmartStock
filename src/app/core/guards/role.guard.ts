import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { AuthService, UserRole } from '../services/auth.service';

export function roleGuard(...allowedRoles: UserRole[]): CanActivateFn {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return authService.authReady$.pipe(
      filter((ready) => ready),
      take(1),
      map(() => (authService.hasRole(...allowedRoles) ? true : router.createUrlTree(['/dashboard'])))
    );
  };
}

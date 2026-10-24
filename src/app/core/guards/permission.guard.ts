import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { homePath, Permission } from '../auth/permissions';

/** Allows the route when the user's role has `permission`; otherwise sends them to
 *  their home page (the till for cashiers, the dashboard for staff). */
export function permissionGuard(permission: Permission): CanActivateFn {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return authService.authReady$.pipe(
      filter((ready) => ready),
      take(1),
      map(() => (authService.can(permission) ? true : router.createUrlTree([homePath(authService.getCurrentUser()?.role)])))
    );
  };
}

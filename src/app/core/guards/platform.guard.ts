import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { of } from 'rxjs';
import { filter, map, switchMap, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { TenantService } from '../services/tenant.service';

/** /platform: super admin only; everyone else goes to their store. */
export const superAdminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.authReady$.pipe(
    filter((ready) => ready),
    take(1),
    map(() => {
      if (!authService.isAuthenticated()) return router.createUrlTree(['/auth/login']);
      return authService.isSuperAdmin() ? true : router.createUrlTree(['/dashboard']);
    })
  );
};

/** Store pages need a store: the super admin has none, so send them to the panel. */
export const storeUserGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.authReady$.pipe(
    filter((ready) => ready),
    take(1),
    map(() => (authService.isSuperAdmin() ? router.createUrlTree(['/platform']) : true))
  );
};

/** A store admin who hasn't finished first-login setup lands on /onboarding. */
export const onboardingGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const tenantService = inject(TenantService);
  const router = inject(Router);

  return authService.authReady$.pipe(
    filter((ready) => ready),
    take(1),
    switchMap(() => (authService.hasRole('admin') ? tenantService.tenant$.pipe(take(1)) : of(undefined))),
    map((tenant) => (tenant?.onboarded === false ? router.createUrlTree(['/onboarding']) : true))
  );
};

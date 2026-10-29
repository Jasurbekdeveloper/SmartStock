import { Component, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { TenantService } from '../core/services/tenant.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatSidenavModule } from '@angular/material/sidenav';
import { HeaderComponent } from './header/header.component';
import { SidebarComponent } from './sidebar/sidebar.component';
import { SubscriptionBannerComponent } from './subscription-banner/subscription-banner.component';
import { SidebarStateService } from './sidebar/sidebar-state.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, MatSidenavModule, HeaderComponent, SidebarComponent, SubscriptionBannerComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css'
})
export class LayoutComponent {
  sidebarState = inject(SidebarStateService);
  private tenantService = inject(TenantService);
  private authService = inject(AuthService);
  private router = inject(Router);

  constructor() {
    // A store suspended by the platform while someone is signed in (or with a saved
    // session) is closed immediately, not just on the next login.
    effect(() => {
      if (this.tenantService.tenant() && this.tenantService.subscription().state === 'suspended') {
        this.authService.logout();
        this.router.navigate(['/auth/login'], { queryParams: { reason: 'suspended' } });
      }
    });
  }
  private breakpointObserver = inject(BreakpointObserver);

  // Matches Tailwind's lg breakpoint (1024px) so this stays in sync with the
  // rest of the app's responsive classes.
  //
  // initialValue must reflect the real viewport synchronously (via
  // matchMedia) rather than hardcoding false: BreakpointObserver's first
  // emission is async, so a hardcoded false briefly renders the sidenav as
  // mode="side" opened=true (the "desktop" branch) on an actual mobile
  // viewport. That transient true gets baked into MatSidenav's own internal
  // opened state, and once isHandset corrects to true a moment later, the
  // drawer is already stuck open in 'over' mode — covering the header, so
  // even the hamburger button (now buried under the backdrop) can't close
  // it on the first tap.
  private readonly handsetQuery = '(max-width: 1023px)';
  isHandset = toSignal(
    this.breakpointObserver.observe(this.handsetQuery).pipe(map((r) => r.matches)),
    { initialValue: typeof matchMedia !== 'undefined' ? matchMedia(this.handsetQuery).matches : false }
  );

  private url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url)
    ),
    { initialValue: this.router.url }
  );
  /** The till runs full screen (touch tablets, POS terminals): no header, no docked
   *  menu — the menu opens over it from the till's own ☰ button. */
  focusMode = computed(() => /^\/pos(\/|\?|$)/.test(this.url() ?? ''));
  overlayMenu = computed(() => this.isHandset() || this.focusMode());

  private readonly syncOverlay = effect(() => {
    this.sidebarState.overlay.set(this.overlayMenu());
    if (!this.overlayMenu()) this.sidebarState.closeMobile();
  });

  private readonly closeOnNavigate = this.router.events
    .pipe(filter((e) => e instanceof NavigationEnd))
    .subscribe(() => this.sidebarState.closeMobile());
}

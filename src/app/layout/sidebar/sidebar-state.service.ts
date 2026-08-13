import { Injectable, signal } from '@angular/core';

/** Shared so the header's mobile hamburger button and the sidebar itself
 * can control the same drawer state without a parent-child wire-up. */
@Injectable({
  providedIn: 'root'
})
export class SidebarStateService {
  /** Mobile (<lg): mat-sidenav "over" mode open/closed. */
  mobileOpen = signal(false);

  toggleMobile(): void {
    this.mobileOpen.update((v) => !v);
  }

  closeMobile(): void {
    this.mobileOpen.set(false);
  }
}

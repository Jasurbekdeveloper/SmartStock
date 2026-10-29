import { Injectable, signal } from '@angular/core';

/** Shared so the header's mobile hamburger button and the sidebar itself
 * can control the same drawer state without a parent-child wire-up. */
@Injectable({
  providedIn: 'root'
})
export class SidebarStateService {
  /** Mobile (<lg): mat-sidenav "over" mode open/closed. */
  mobileOpen = signal(false);
  /** True while the menu is a drawer over the page (phones, tablets, the full-screen
   *  till). Only then does it have a close button — a docked menu has nothing to close. */
  overlay = signal(false);

  toggleMobile(): void {
    this.mobileOpen.update((v) => !v);
  }

  closeMobile(): void {
    this.mobileOpen.set(false);
  }
}

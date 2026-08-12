import { Injectable, signal } from '@angular/core';

/** Shared so the header's mobile hamburger button and the sidebar itself
 * can control the same drawer/collapse state without a parent-child wire-up. */
@Injectable({
  providedIn: 'root'
})
export class SidebarStateService {
  /** Desktop (lg+): expanded (w-64, labels) vs collapsed (w-20, icons only). */
  isOpen = signal(true);

  /** Mobile (<lg): off-canvas drawer visibility. */
  mobileOpen = signal(false);

  toggleDesktop(): void {
    this.isOpen.update((v) => !v);
  }

  toggleMobile(): void {
    this.mobileOpen.update((v) => !v);
  }

  closeMobile(): void {
    this.mobileOpen.set(false);
  }
}

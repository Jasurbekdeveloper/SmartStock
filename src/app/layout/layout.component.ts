import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatSidenavModule } from '@angular/material/sidenav';
import { HeaderComponent } from './header/header.component';
import { SidebarComponent } from './sidebar/sidebar.component';
import { SidebarStateService } from './sidebar/sidebar-state.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, MatSidenavModule, HeaderComponent, SidebarComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css'
})
export class LayoutComponent {
  sidebarState = inject(SidebarStateService);
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
}

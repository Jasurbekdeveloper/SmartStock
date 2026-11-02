import { Component, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe } from '../core/pipes/translate.pipe';
import { AuthService } from '../core/services/auth.service';
import { ThemeService } from '../core/services/theme.service';
import { Language, TranslationService } from '../core/services/translation.service';
import { TelegramLinkDialogComponent } from '../shared/components/telegram-link-dialog/telegram-link-dialog.component';

/** Shell for the super admin panel: own sidebar (grouped sections) and a slim top bar. */
@Component({
  selector: 'app-platform-layout',
  standalone: true,
  imports: [RouterModule, MatButtonModule, MatIconModule, MatMenuModule, TranslatePipe],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="pf-shell" [class.pf-shell--open]="menuOpen()">
      <aside class="pf-side" [attr.aria-label]="'platform.badge' | translate">
        <a routerLink="/platform" class="pf-brand" (click)="menuOpen.set(false)">
          <img src="/logo.svg" alt="" class="pf-brand__logo" />
          <span class="min-w-0">
            <span class="pf-brand__name">MarketHisob</span>
            <span class="pf-brand__sub">{{ 'platform.badge' | translate }}</span>
          </span>
        </a>
        <nav class="pf-nav">
          @for (group of nav; track group.label) {
          <p class="pf-nav__group">{{ group.label | translate }}</p>
          @for (tab of group.items; track tab.path) {
          <a
            [routerLink]="tab.path"
            routerLinkActive="pf-nav__item--active"
            [routerLinkActiveOptions]="{ exact: tab.exact }"
            class="pf-nav__item"
            (click)="menuOpen.set(false)"
          >
            <mat-icon>{{ tab.icon }}</mat-icon>
            <span>{{ tab.label | translate }}</span>
          </a>
          }
          }
        </nav>
        <div class="pf-side__foot">
          <button type="button" class="pf-user" [matMenuTriggerFor]="userMenu">
            <span class="pf-user__avatar">{{ initials() }}</span>
            <span class="min-w-0 flex-1 text-left">
              <span class="pf-user__name">{{ userName() }}</span>
              <span class="pf-user__role">Super admin</span>
            </span>
            <mat-icon>unfold_more</mat-icon>
          </button>
        </div>
      </aside>
      <div class="pf-scrim" (click)="menuOpen.set(false)"></div>

      <div class="pf-main">
        <header class="pf-top">
          <button mat-icon-button class="pf-top__menu" (click)="menuOpen.set(!menuOpen())" [attr.aria-label]="'common.menu' | translate">
            <mat-icon>menu</mat-icon>
          </button>
          <span class="flex-1"></span>
          <button mat-button [matMenuTriggerFor]="langMenu" class="!min-w-0" aria-label="Language">
            <mat-icon>translate</mat-icon>
            <span class="hidden sm:inline">{{ languageShort() }}</span>
          </button>
          <button mat-icon-button (click)="themeService.toggleTheme()" [attr.aria-label]="'common.theme' | translate">
            <mat-icon>{{ themeService.getTheme() === 'light' ? 'dark_mode' : 'light_mode' }}</mat-icon>
          </button>
        </header>
        <main class="pf-content">
          <router-outlet></router-outlet>
        </main>
      </div>

      <mat-menu #langMenu="matMenu">
        @for (lang of languages; track lang.code) {
        <button mat-menu-item (click)="translation.setLanguage(lang.code)">{{ lang.name }}</button>
        }
      </mat-menu>
      <mat-menu #userMenu="matMenu" yPosition="above">
        <button mat-menu-item (click)="openTelegram()">
          <mat-icon>send</mat-icon>
          {{ 'telegram.menuItem' | translate }}
        </button>
        <button mat-menu-item (click)="logout()">
          <mat-icon>logout</mat-icon>
          {{ 'common.logout' | translate }}
        </button>
      </mat-menu>
    </div>
  `,
  styles: `
    .pf-shell { min-height: 100vh; background: var(--app-bg); color: var(--text); }
    .pf-side {
      position: fixed; inset: 0 auto 0 0; z-index: 40; width: 16rem; display: flex; flex-direction: column;
      background: var(--sidebar-bg); color: var(--sidebar-text); transition: transform 0.2s ease;
    }
    .pf-brand { display: flex; align-items: center; gap: 0.75rem; padding: 1.1rem 1rem 0.9rem; }
    .pf-brand__logo { width: 2.5rem; height: 2.5rem; border-radius: 12px; }
    .pf-brand__name { display: block; font-weight: 800; color: #fff; line-height: 1.2; }
    .pf-brand__sub { display: block; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #6ddbc8; }
    .pf-nav { flex: 1; overflow-y: auto; padding: 0.25rem 0.75rem 1rem; }
    .pf-nav__group { margin: 1rem 0.5rem 0.35rem; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--sidebar-muted); }
    .pf-nav__item {
      display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.75rem; border-radius: 10px;
      font-size: 0.9rem; font-weight: 500; color: var(--sidebar-text); transition: background-color 0.12s, color 0.12s;
    }
    .pf-nav__item mat-icon { width: 20px; height: 20px; font-size: 20px; opacity: 0.85; }
    .pf-nav__item:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
    .pf-nav__item--active { background: rgba(47, 191, 171, 0.16); color: #fff; box-shadow: inset 3px 0 0 #2fbfab; }
    .pf-side__foot { padding: 0.75rem; border-top: 1px solid rgba(255, 255, 255, 0.06); }
    .pf-user { display: flex; align-items: center; gap: 0.6rem; width: 100%; padding: 0.5rem; border-radius: 10px; color: var(--sidebar-text); }
    .pf-user:hover { background: rgba(255, 255, 255, 0.06); }
    .pf-user__avatar { display: grid; place-items: center; width: 2.1rem; height: 2.1rem; border-radius: 50%; flex-shrink: 0; font-weight: 700; font-size: 0.8rem; color: #032a27; background: linear-gradient(140deg, #6ddbc8, #16a593); }
    .pf-user__name { display: block; color: #fff; font-weight: 600; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pf-user__role { display: block; font-size: 11px; color: var(--sidebar-muted); }
    .pf-scrim { display: none; }
    .pf-main { margin-left: 16rem; min-height: 100vh; display: flex; flex-direction: column; }
    .pf-top {
      position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 0.25rem; height: 3.75rem;
      padding: 0 1rem; background: color-mix(in srgb, var(--app-bg) 85%, transparent); backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border);
    }
    .pf-top__menu { display: none !important; }
    .pf-content { width: 100%; max-width: 80rem; margin: 0 auto; padding: 1.5rem; }
    @media (max-width: 1023px) {
      .pf-side { transform: translateX(-100%); }
      .pf-shell--open .pf-side { transform: none; box-shadow: var(--shadow-lg); }
      .pf-shell--open .pf-scrim { display: block; position: fixed; inset: 0; z-index: 30; background: rgba(0, 0, 0, 0.4); }
      .pf-main { margin-left: 0; }
      .pf-top__menu { display: inline-flex !important; }
      .pf-content { padding: 1rem; }
    }

    /* Shared building blocks of the platform pages. */
    .pf-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; }
    .pf-title { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; color: var(--text); }
    .pf-sub, .pf-muted { color: var(--text-muted); }
    .pf-sub { margin-top: 0.25rem; font-size: 0.9rem; }
    .pf-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
    .pf-note { display: flex; align-items: flex-start; gap: 0.5rem; margin: 1rem 0; font-size: 0.85rem; color: var(--text-muted); }
    .pf-note mat-icon { width: 18px; height: 18px; font-size: 18px; flex-shrink: 0; }
    .pf-note--warn { padding: 0.6rem 0.9rem; border-radius: var(--radius-md); background: var(--warning-soft); color: var(--warning); }
    .pf-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr)); gap: 0.75rem; }
    .pf-stat { padding: 0.9rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); }
    .pf-stat__label { display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; color: var(--text-muted); }
    .pf-stat__label mat-icon { width: 16px; height: 16px; font-size: 16px; color: var(--brand); }
    .pf-stat__value { margin-top: 0.3rem; font: 700 1.25rem var(--font-mono); color: var(--text); }
  `
})
export class PlatformLayoutComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  translation = inject(TranslationService);
  themeService = inject(ThemeService);

  private user = toSignal(this.authService.currentUser$, { initialValue: null });
  userName = computed(() => this.user()?.displayName || this.user()?.email || '');

  menuOpen = signal(false);
  initials = computed(() =>
    (this.userName() || 'S')
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('')
  );

  readonly nav = [
    {
      label: 'platform.navGroup.manage',
      items: [
        { path: '/platform', label: 'platform.nav.overview', icon: 'space_dashboard', exact: true },
        { path: '/platform/tenants', label: 'platform.nav.tenants', icon: 'storefront', exact: false },
        { path: '/platform/leads', label: 'platform.nav.leads', icon: 'mark_email_unread', exact: false }
      ]
    },
    {
      label: 'platform.navGroup.settings',
      items: [
        { path: '/platform/plans', label: 'platform.nav.plans', icon: 'sell', exact: false },
        { path: '/platform/roles', label: 'platform.nav.roles', icon: 'admin_panel_settings', exact: false },
        { path: '/platform/site', label: 'platform.nav.site', icon: 'language', exact: false },
        { path: '/platform/audit', label: 'platform.nav.audit', icon: 'history', exact: false }
      ]
    }
  ];

  readonly languages: { code: Language; name: string }[] = [
    { code: 'uz', name: "O'zbek (Latin)" },
    { code: 'uz-cyrillic', name: 'Ўзбек (Cyrillic)' },
    { code: 'ru', name: 'Русский' },
    { code: 'en', name: 'English' }
  ];

  languageShort(): string {
    const short: Record<Language, string> = { en: 'EN', ru: 'RU', uz: 'UZ', 'uz-cyrillic': 'ЎЗ' };
    return short[this.translation.getLanguage()];
  }

  openTelegram() {
    this.dialog.open(TelegramLinkDialogComponent, { width: '420px' });
  }

  logout() {
    this.authService.logout();
    this.router.navigateByUrl('/auth/login');
  }
}

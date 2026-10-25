import { Component, computed, inject } from '@angular/core';
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

/** Shell for the super admin panel: top bar + tabs, no store sidebar. */
@Component({
  selector: 'app-platform-layout',
  standalone: true,
  imports: [RouterModule, MatButtonModule, MatIconModule, MatMenuModule, TranslatePipe],
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header class="sticky top-0 z-20 bg-slate-900 text-white">
        <div class="max-w-7xl mx-auto px-4 lg:px-6 h-16 flex items-center gap-3">
          <a routerLink="/platform" class="flex items-center gap-2 shrink-0">
            <img src="/logo.svg" alt="" class="w-9 h-9" />
            <span class="font-extrabold text-lg">MarketHisob</span>
            <span class="hidden sm:inline text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-brand-300">{{ 'platform.badge' | translate }}</span>
          </a>
          <span class="flex-1"></span>
          <button mat-button [matMenuTriggerFor]="langMenu" class="!text-white !min-w-0" aria-label="Language">
            <mat-icon>translate</mat-icon>
            <span class="hidden sm:inline">{{ languageShort() }}</span>
          </button>
          <mat-menu #langMenu="matMenu">
            @for (lang of languages; track lang.code) {
            <button mat-menu-item (click)="translation.setLanguage(lang.code)">{{ lang.name }}</button>
            }
          </mat-menu>
          <button mat-icon-button class="!text-white" (click)="themeService.toggleTheme()" [attr.aria-label]="'common.theme' | translate">
            <mat-icon>{{ themeService.getTheme() === 'light' ? 'dark_mode' : 'light_mode' }}</mat-icon>
          </button>
          <button mat-button [matMenuTriggerFor]="userMenu" class="!text-white !min-w-0">
            <mat-icon>account_circle</mat-icon>
            <span class="hidden md:inline max-w-[160px] truncate">{{ userName() }}</span>
          </button>
          <mat-menu #userMenu="matMenu" xPosition="before">
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
        <nav class="max-w-7xl mx-auto px-2 lg:px-4 flex gap-1 overflow-x-auto text-sm">
          @for (tab of tabs; track tab.path) {
          <a
            [routerLink]="tab.path"
            routerLinkActive="!text-white !border-brand-400"
            [routerLinkActiveOptions]="{ exact: tab.exact }"
            class="flex items-center gap-1.5 px-3 py-2.5 border-b-2 border-transparent text-slate-300 hover:text-white whitespace-nowrap"
          >
            <mat-icon class="!w-5 !h-5 !text-[20px]">{{ tab.icon }}</mat-icon>
            {{ tab.label | translate }}
          </a>
          }
        </nav>
      </header>
      <main class="max-w-7xl mx-auto p-4 lg:p-6">
        <router-outlet></router-outlet>
      </main>
    </div>
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

  readonly tabs = [
    { path: '/platform', label: 'platform.nav.overview', icon: 'space_dashboard', exact: true },
    { path: '/platform/tenants', label: 'platform.nav.tenants', icon: 'storefront', exact: false },
    { path: '/platform/leads', label: 'platform.nav.leads', icon: 'mark_email_unread', exact: false },
    { path: '/platform/plans', label: 'platform.nav.plans', icon: 'sell', exact: false },
    { path: '/platform/site', label: 'platform.nav.site', icon: 'language', exact: false },
    { path: '/platform/audit', label: 'platform.nav.audit', icon: 'history', exact: false }
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

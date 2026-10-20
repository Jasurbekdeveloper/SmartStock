import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { ThemeService } from '../../core/services/theme.service';
import { Language, TranslationService } from '../../core/services/translation.service';
import { AuthService } from '../../core/services/auth.service';
import { SidebarStateService } from '../sidebar/sidebar-state.service';
import { SettingsService } from '../../core/services/settings.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { TelegramLinkDialogComponent } from '../../shared/components/telegram-link-dialog/telegram-link-dialog.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, MatButtonModule, MatMenuModule, MatIconModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent {
  translationService = inject(TranslationService);
  themeService = inject(ThemeService);
  authService = inject(AuthService);
  sidebarState = inject(SidebarStateService);
  private router = inject(Router);
  private dialog = inject(MatDialog);

  private currentUser = toSignal(this.authService.currentUser$, { initialValue: null });
  isAdmin = computed(() => this.currentUser()?.role === 'admin');
  userName = computed(() => this.currentUser()?.displayName || this.currentUser()?.email || '—');
  roleKey = computed(() => {
    const role = this.currentUser()?.role ?? 'cashier';
    return 'users.role' + role[0].toUpperCase() + role.slice(1);
  });
  initials = computed(() =>
    this.userName()
      .split(/\s+/)
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase()
  );
  storeName = inject(SettingsService).storeName;
  readonly today = new Date();

  readonly languages: { code: Language; name: string }[] = [
    { code: 'en', name: 'English' },
    { code: 'ru', name: 'Русский' },
    { code: 'uz', name: "O'zbek (Latin)" },
    { code: 'uz-cyrillic', name: 'Ўзбек (Cyrillic)' }
  ];

  currentLanguageShort(): string {
    const short: Record<Language, string> = { en: 'EN', ru: 'RU', uz: 'UZ', 'uz-cyrillic': 'ЎЗ' };
    return short[this.translationService.getLanguage() as Language] ?? '';
  }

  setLanguage(lang: Language) {
    this.translationService.setLanguage(lang);
  }

  toggleTheme() {
    this.themeService.toggleTheme();
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }

  openTelegram() {
    this.dialog.open(TelegramLinkDialogComponent, { width: '420px' });
  }
}

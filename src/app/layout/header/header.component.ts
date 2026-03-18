import { Component, ChangeDetectorRef, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ThemeService, type Theme } from '../../core/services/theme.service';
import { Language, TranslationService } from '../../core/services/translation.service';
import { AuthService } from '../../core/services/auth.service';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Globe, LogOut, Moon, MoreVertical, Sun, LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, LucideAngularModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent {
  isDropdownOpen = false;
  isLanguageMenuOpen = false;
  isThemeMenuOpen = false;

  translationService = inject(TranslationService);
  themeService = inject(ThemeService);
  authService = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  private currentUser = toSignal(this.authService.currentUser$, { initialValue: null });
  userName = computed(() => this.currentUser()?.username ?? '—');

  readonly GlobeIcon = Globe;
  readonly MoonIcon = Moon;
  readonly SunIcon = Sun;
  readonly MoreIcon = MoreVertical;
  readonly LogoutIcon = LogOut;

  readonly languages: { code: Language; name: string }[] = [
    { code: 'en', name: 'English' },
    { code: 'ru', name: 'Русский' },
    { code: 'uz', name: "O'zbek (Latin)" },
    { code: 'uz-cyrillic', name: 'Ўзбек (Cyrillic)' }
  ];

  toggleDropdown() {
    this.isDropdownOpen = !this.isDropdownOpen;
    this.isLanguageMenuOpen = false;
    this.isThemeMenuOpen = false;
  }

  toggleLanguageMenu() {
    this.isLanguageMenuOpen = !this.isLanguageMenuOpen;
  }

  toggleThemeMenu() {
    this.isThemeMenuOpen = !this.isThemeMenuOpen;
  }

  setLanguage(lang: Language) {
    this.translationService.setLanguage(lang);
    this.isLanguageMenuOpen = false;
    this.cdr.markForCheck();
  }

  toggleTheme() {
    this.themeService.toggleTheme();
    this.isThemeMenuOpen = false;
    this.cdr.markForCheck();
  }

  logout() {
    this.authService.logout();
    this.isDropdownOpen = false;
    this.router.navigate(['/auth/login']);
  }
}

import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslationService, type Language } from '../../core/services/translation.service';
import { ThemeService, type Theme } from '../../core/services/theme.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent {
  userName = 'Admin User';
  isDropdownOpen = false;
  isLanguageMenuOpen = false;
  isThemeMenuOpen = false;

  translationService = inject(TranslationService);
  themeService = inject(ThemeService);
  private cdr = inject(ChangeDetectorRef);

  readonly languages: { code: Language; name: string }[] = [
    { code: 'en', name: 'English' },
    { code: 'ru', name: 'Русский' },
    { code: 'uz-latin', name: "O'zbek (Latin)" },
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
    // TODO: Implement logout
  }
}

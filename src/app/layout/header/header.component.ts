import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { ThemeService } from '../../core/services/theme.service';
import { Language, TranslationService } from '../../core/services/translation.service';
import { AuthService } from '../../core/services/auth.service';
import { SidebarStateService } from '../sidebar/sidebar-state.service';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, MatToolbarModule, MatButtonModule, MatMenuModule, MatIconModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent {
  translationService = inject(TranslationService);
  themeService = inject(ThemeService);
  authService = inject(AuthService);
  sidebarState = inject(SidebarStateService);
  private router = inject(Router);

  private currentUser = toSignal(this.authService.currentUser$, { initialValue: null });
  userName = computed(() => this.currentUser()?.displayName ?? this.currentUser()?.email ?? '—');

  readonly languages: { code: Language; name: string }[] = [
    { code: 'en', name: 'English' },
    { code: 'ru', name: 'Русский' },
    { code: 'uz', name: "O'zbek (Latin)" },
    { code: 'uz-cyrillic', name: 'Ўзбек (Cyrillic)' }
  ];

  currentLanguageName(): string {
    return this.languages.find((l) => l.code === this.translationService.getLanguage())?.name ?? '';
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
}

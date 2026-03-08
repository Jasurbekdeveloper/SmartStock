import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private currentTheme = signal<Theme>('light');
  public currentTheme$ = this.currentTheme.asReadonly();

  constructor() {
    const savedTheme = this.getSavedTheme();
    if (savedTheme) {
      this.setTheme(savedTheme);
    } else if (this.prefersDarkMode()) {
      this.setTheme('dark');
    }
  }

  setTheme(theme: Theme) {
    this.currentTheme.set(theme);
    localStorage.setItem('app_theme', theme);
    this.applyTheme(theme);
  }

  getTheme(): Theme {
    return this.currentTheme();
  }

  toggleTheme() {
    const newTheme = this.currentTheme() === 'light' ? 'dark' : 'light';
    this.setTheme(newTheme);
  }

  private getSavedTheme(): Theme | null {
    if (typeof localStorage === 'undefined') return null;
    const saved = localStorage.getItem('app_theme');
    if (saved && ['light', 'dark'].includes(saved)) {
      return saved as Theme;
    }
    return null;
  }

  private prefersDarkMode(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  private applyTheme(theme: Theme) {
    if (typeof document === 'undefined') return;

    const html = document.documentElement;
    if (theme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }
}

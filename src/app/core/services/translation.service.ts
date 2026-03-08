import { Injectable, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';

export type Language = 'uz-latin' | 'uz-cyrillic' | 'ru' | 'en';

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private currentLanguage = signal<Language>('uz-latin');
  public currentLanguage$ = this.currentLanguage.asReadonly();
  
  // Observable for pipe reactivity
  private languageChange$ = new BehaviorSubject<Language>('uz-latin');
  public language$ = this.languageChange$.asObservable();

  constructor(private translateService: TranslateService) {
    // Initialize ngx-translate with supported languages
    this.translateService.addLangs(['en', 'ru', 'uz-latin', 'uz-cyrillic']);
    
    // Set default language
    const savedLanguage = this.getSavedLanguage();
    const defaultLang = savedLanguage || 'en';
    
    this.translateService.setDefaultLang('en');
    this.translateService.use(defaultLang);
    
    this.currentLanguage.set(defaultLang as Language);
    this.languageChange$.next(defaultLang as Language);
  }

  setLanguage(language: Language) {
    this.translateService.use(language);
    this.currentLanguage.set(language);
    this.languageChange$.next(language);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('app_language', language);
    }
  }

  getLanguage(): Language {
    return this.currentLanguage();
  }

  private getSavedLanguage(): Language | null {
    if (typeof localStorage === 'undefined') return null;
    const saved = localStorage.getItem('app_language');
    if (saved && ['uz-latin', 'uz-cyrillic', 'ru', 'en'].includes(saved)) {
      return saved as Language;
    }
    return null;
  }

  translate(key: string): string {
    return this.translateService.instant(key);
  }

  t(key: string): string {
    return this.translate(key);
  }
}

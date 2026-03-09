import { Injectable, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';

export type Language = 'uz' | 'uz-cyrillic' | 'ru' | 'en';

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private currentLanguage = signal<Language>('en');
  public currentLanguage$ = this.currentLanguage.asReadonly();
  
  // Observable for pipe reactivity
  private languageChange$ = new BehaviorSubject<Language>('en');
  public language$ = this.languageChange$.asObservable();

  constructor(private translateService: TranslateService) {
    this.initializeLanguage();
  }

  private initializeLanguage() {
    // Initialize supported languages
    this.translateService.addLangs(['en', 'ru', 'uz', 'uz-cyrillic']);
    
    // Get saved language or default to 'en'
    const savedLanguage = this.getSavedLanguage();
    const defaultLang: Language = (savedLanguage && ['uz', 'uz-cyrillic', 'ru', 'en'].includes(savedLanguage)) 
      ? (savedLanguage as Language)
      : 'en';
    
    // Set the language
    this.translateService.use(defaultLang).subscribe({
      next: () => {
        this.currentLanguage.set(defaultLang);
        this.languageChange$.next(defaultLang);
      },
      error: (err) => {
        console.error('Error loading language:', err);
        // Fallback to English if there's an error
        this.translateService.use('en').subscribe(() => {
          this.currentLanguage.set('en');
          this.languageChange$.next('en');
        });
      }
    });
  }

  setLanguage(language: Language) {
    this.translateService.use(language).subscribe({
      next: () => {
        this.currentLanguage.set(language);
        this.languageChange$.next(language);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('app_language', language);
        }
      },
      error: (err) => {
        console.error('Error changing language:', err);
      }
    });
  }

  getLanguage(): Language {
    return this.currentLanguage();
  }

  private getSavedLanguage(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem('app_language');
  }

  translate(key: string): string {
    return this.translateService.instant(key);
  }

  t(key: string): string {
    return this.translate(key);
  }
}

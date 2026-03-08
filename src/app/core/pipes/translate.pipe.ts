import { Pipe, PipeTransform, inject, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

@Pipe({
  name: 'translate',
  standalone: true,
  pure: false  // Important: Makes pipe re-evaluate when inputs or language changes
})
export class TranslatePipe implements PipeTransform, OnDestroy {
  private translateService = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);
  private subscription: Subscription | null = null;

  constructor() {
    // Subscribe to language changes to trigger re-evaluation
    if (!this.subscription) {
      this.subscription = this.translateService.onLangChange
        .subscribe(() => {
          this.cdr.markForCheck();
        });
    }
  }

  transform(key: string, defaultValue?: string): string {
    if (!key) {
      return defaultValue || '';
    }
    
    const translation = this.translateService.instant(key);
    
    // If translation key contains a dot character and result is the key itself,
    // it means the translation wasn't found
    if (translation === key && key.includes('.')) {
      console.warn(`Translation key not found: ${key}`);
      return defaultValue || key;
    }
    
    return translation || defaultValue || key;
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}

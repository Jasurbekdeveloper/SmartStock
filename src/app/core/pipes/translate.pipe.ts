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
  private subscription: Subscription;

  constructor() {
    // Subscribe to language changes to trigger re-evaluation
    this.subscription = this.translateService.onLangChange
      .subscribe(() => {
        this.cdr.markForCheck();
      });
  }

  transform(key: string): string {
    return this.translateService.instant(key);
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }
}

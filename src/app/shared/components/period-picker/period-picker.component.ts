import { Component, input, model } from '@angular/core';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { PERIOD_KEYS, PeriodKey } from '../../../core/utils/period';

/** Segmented period switch used by the finance pages. */
@Component({
  selector: 'app-period-picker',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div class="seg max-w-full overflow-x-auto" role="tablist">
      @for (key of keys(); track key) {
      <button type="button" role="tab" class="whitespace-nowrap" [class.seg--on]="value() === key" [attr.aria-selected]="value() === key" (click)="value.set(key)">
        {{ 'period.' + key | translate }}
      </button>
      }
    </div>
  `
})
export class PeriodPickerComponent {
  value = model<PeriodKey>('month');
  keys = input<readonly PeriodKey[]>(PERIOD_KEYS);
}

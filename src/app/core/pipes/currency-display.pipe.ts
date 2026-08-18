import { Pipe, PipeTransform, inject } from '@angular/core';
import { formatNumber } from '../utils/format-number';
import { SettingsService } from '../services/settings.service';

/**
 * Formats a number the same way `SumPipe` always has (space-grouped thousands, see
 * `format-number.ts`) and appends the currency symbol from Settings, so the currency
 * shown throughout the app is centrally controlled by `settings/general.currencySymbol`
 * instead of a hardcoded "so'm" string in every template.
 *
 * Deliberately impure (`pure: false`): the numeric `value` argument rarely changes on
 * its own once rendered, but the currency symbol can change later (admin edits Settings)
 * without the surrounding value changing at all. A pure pipe would memoize on `value`
 * and never re-run in that case. Being impure guarantees `transform()` re-evaluates on
 * every change-detection pass of the host view, which — since this is a zoneless app —
 * still only happens when a signal read in that view's render actually changes (e.g. the
 * `SettingsService.currencySymbol` signal itself, which this pipe reads), never on a timer.
 */
@Pipe({
  name: 'currencyDisplay',
  standalone: true,
  pure: false
})
export class CurrencyDisplayPipe implements PipeTransform {
  private settingsService = inject(SettingsService);

  transform(value: number | null | undefined, decimals = 2): string {
    return `${formatNumber(value, decimals)} ${this.settingsService.currencySymbol()}`;
  }
}

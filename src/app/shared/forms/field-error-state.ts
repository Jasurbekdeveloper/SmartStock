import { signal } from '@angular/core';
import { ErrorStateMatcher } from '@angular/material/core';
import { FieldErrors } from '../../core/utils/product-form-validation';

/**
 * Per-field error display for template-driven Material forms: after the first failed
 * submit, every field whose key is in `errors()` gets Material's red error state and
 * its <mat-error> message. Errors are recomputed on each check, so a field turns back
 * to normal as soon as the user fixes it.
 *
 *   <input matInput [errorStateMatcher]="fields.matcher('price')" ...>
 *   <mat-error>{{ fields.message('price') | translate }}</mat-error>
 */
export class FieldErrorState {
  readonly shown = signal(false);
  private readonly matchers = new Map<string, ErrorStateMatcher>();

  constructor(private readonly errors: () => FieldErrors) {}

  matcher(key: string): ErrorStateMatcher {
    let matcher = this.matchers.get(key);
    if (!matcher) {
      matcher = { isErrorState: () => this.shown() && !!this.errors()[key] };
      this.matchers.set(key, matcher);
    }
    return matcher;
  }

  message(key: string): string {
    return this.errors()[key] ?? '';
  }

  /** Shows the errors; returns true when the form is valid. Moves focus to the first red field. */
  check(): boolean {
    const valid = Object.keys(this.errors()).length === 0;
    this.shown.set(true);
    if (!valid) {
      setTimeout(() => {
        const input = document.querySelector<HTMLElement>('.mat-form-field-invalid input, .mat-form-field-invalid textarea');
        input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        input?.focus({ preventScroll: true });
      });
    }
    return valid;
  }
}

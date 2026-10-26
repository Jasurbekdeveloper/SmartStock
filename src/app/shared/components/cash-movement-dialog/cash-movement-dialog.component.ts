import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';
import {
  CASH_IN_REASONS,
  CASH_OUT_REASONS,
  CashMovementInput,
  CashReason
} from '../../../core/services/cash-movement.service';
import { NumericInputDirective } from '../../directives/numeric-input.directive';

export interface CashMovementDialogData {
  /** Pre-selected direction. */
  type?: 'in' | 'out';
  /** Cash the drawer should hold right now — shown so a collection never exceeds it. */
  expectedCash?: number;
}

/** Records cash put into / taken out of the drawer. Returns a CashMovementInput or undefined. */
@Component({
  selector: 'app-cash-movement-dialog',
  standalone: true,
  imports: [NumericInputDirective, FormsModule, MatDialogModule, MatButtonModule, MatIconModule, TranslatePipe, CurrencyDisplayPipe],
  template: `
    <div class="cm">
      <div class="cm__head">
        <span class="cm__icon" [class.tone-green]="type() === 'in'" [class.tone-red]="type() === 'out'">
          <mat-icon>{{ type() === 'in' ? 'south_west' : 'north_east' }}</mat-icon>
        </span>
        <div class="min-w-0">
          <h2 class="text-lg font-bold">{{ 'finance.cashMovement' | translate }}</h2>
          @if (data.expectedCash !== undefined) {
          <p class="text-sm text-muted">{{ 'finance.inDrawer' | translate }}: <b class="money">{{ data.expectedCash | currencyDisplay:0 }}</b></p>
          }
        </div>
      </div>

      <div class="px-6 pb-2 space-y-4">
        <div class="seg w-full">
          <button type="button" class="flex-1" [class.seg--on]="type() === 'in'" (click)="setType('in')">
            {{ 'finance.cashIn' | translate }}
          </button>
          <button type="button" class="flex-1" [class.seg--on]="type() === 'out'" (click)="setType('out')">
            {{ 'finance.cashOut' | translate }}
          </button>
        </div>

        <label class="block">
          <span class="cm__label">{{ 'finance.amount' | translate }}</span>
          <input
            class="cm__amount money"
            type="number"
            min="0"
            step="any"
            inputmode="decimal"
            [ngModel]="amount()"
            (ngModelChange)="amount.set(+$event || 0)"
            (keydown.enter)="save()"
            cdkFocusInitial
            placeholder="0"
          />
        </label>

        <div>
          <span class="cm__label">{{ 'finance.reasonLabel' | translate }}</span>
          <div class="flex flex-wrap gap-2 mt-1">
            @for (r of reasons(); track r) {
            <button type="button" class="chip" [class.chip--active]="reason() === r" (click)="reason.set(r)">
              {{ 'finance.reason.' + r | translate }}
            </button>
            }
          </div>
        </div>

        <label class="block">
          <span class="cm__label">{{ 'finance.note' | translate }}</span>
          <input class="cm__input" type="text" maxlength="200" [ngModel]="note()" (ngModelChange)="note.set($event)" />
        </label>

        @if (overDrawer()) {
        <p class="badge badge--amber !rounded-lg !py-1.5 !px-3 w-full">
          <mat-icon class="!w-4 !h-4 !text-base">warning</mat-icon>{{ 'finance.moreThanDrawer' | translate }}
        </p>
        }
      </div>

      <div class="cm__actions">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | translate }}</button>
        <button mat-flat-button color="primary" type="button" [disabled]="!(amount() > 0)" (click)="save()">
          {{ 'common.save' | translate }}
        </button>
      </div>
    </div>
  `,
  styles: `
    .cm__head { display: flex; align-items: center; gap: 0.85rem; padding: 1.25rem 1.5rem 1rem; color: var(--text); }
    .cm__icon { display: grid; place-items: center; width: 2.75rem; height: 2.75rem; border-radius: 14px; flex-shrink: 0; }
    .cm__label { display: block; font-size: 0.8rem; font-weight: 500; color: var(--text-muted); margin-bottom: 0.25rem; }
    .cm__amount {
      width: 100%; padding: 0.6rem 0.9rem; font-size: 1.75rem; font-weight: 700;
      border: 1.5px solid var(--border-strong); border-radius: 14px; background: var(--surface); color: var(--text); outline: none;
    }
    .cm__amount:focus, .cm__input:focus { border-color: var(--brand); box-shadow: 0 0 0 4px var(--brand-ring); }
    .cm__input {
      width: 100%; padding: 0.6rem 0.8rem; border: 1px solid var(--border-strong); border-radius: 12px;
      background: var(--surface); color: var(--text); outline: none;
    }
    .cm__actions { display: flex; justify-content: flex-end; gap: 0.5rem; padding: 1rem 1.5rem 1.25rem; }
    .seg button { padding-top: 0.55rem; padding-bottom: 0.55rem; }
  `
})
export class CashMovementDialogComponent {
  data = inject<CashMovementDialogData>(MAT_DIALOG_DATA, { optional: true }) ?? {};
  private ref = inject(MatDialogRef<CashMovementDialogComponent, CashMovementInput>);

  type = signal<'in' | 'out'>(this.data.type ?? 'out');
  amount = signal(0);
  reason = signal<CashReason>(this.data.type === 'in' ? 'float' : 'collection');
  note = signal('');

  reasons = computed<readonly CashReason[]>(() => (this.type() === 'in' ? CASH_IN_REASONS : CASH_OUT_REASONS));

  overDrawer = computed(
    () => this.type() === 'out' && this.data.expectedCash !== undefined && this.amount() > this.data.expectedCash
  );

  setType(type: 'in' | 'out') {
    this.type.set(type);
    this.reason.set(type === 'in' ? 'float' : 'collection');
  }

  save() {
    if (!(this.amount() > 0)) return;
    this.ref.close({ type: this.type(), amount: this.amount(), reason: this.reason(), note: this.note() });
  }
}

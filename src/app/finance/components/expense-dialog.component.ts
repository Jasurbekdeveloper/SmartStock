import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { CurrencyDisplayPipe } from '../../core/pipes/currency-display.pipe';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_ICONS, ExpenseCategory } from '../../core/utils/finance';
import { Expense, ExpenseInput, ExpenseMethod } from '../../core/services/expense.service';
import { fromDateInput } from '../../core/utils/product-extras';

export interface ExpenseDialogData {
  /** Editing an existing expense; omitted for a new one. */
  expense?: Expense;
  /** The current user's open shift — enables "taken from the till". */
  openShiftId?: string;
}

export interface ExpenseDialogResult {
  input: ExpenseInput;
  fromShift: boolean;
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

@Component({
  selector: 'app-expense-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatSlideToggleModule, TranslatePipe, CurrencyDisplayPipe],
  template: `
    <div class="xd">
      <div class="px-6 pt-5 pb-3">
        <h2 class="text-lg font-bold">{{ (editing ? 'finance.editExpense' : 'finance.newExpense') | translate }}</h2>
      </div>
      <div class="px-6 space-y-4 max-h-[70vh] overflow-y-auto">
        <div>
          <span class="xd__label">{{ 'finance.category' | translate }}</span>
          <div class="xd__cats">
            @for (c of categories; track c) {
            <button type="button" class="xd__cat" [class.xd__cat--on]="category() === c" (click)="category.set(c)">
              <mat-icon>{{ icons[c] }}</mat-icon>
              <span>{{ 'finance.cat.' + c | translate }}</span>
            </button>
            }
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
          <label class="block">
            <span class="xd__label">{{ 'finance.amount' | translate }}</span>
            <input class="xd__amount money" type="number" min="0" step="any" inputmode="decimal" [ngModel]="amount()" (ngModelChange)="amount.set(+$event || 0)" [disabled]="amountLocked" placeholder="0" cdkFocusInitial />
          </label>
          <label class="block">
            <span class="xd__label">{{ 'finance.date' | translate }}</span>
            <input class="xd__input !h-[3.4rem]" type="date" [ngModel]="date()" (ngModelChange)="date.set($event)" />
          </label>
        </div>

        <div>
          <span class="xd__label">{{ 'finance.method' | translate }}</span>
          <div class="seg w-full">
            @for (m of methods; track m) {
            <button type="button" class="flex-1" [class.seg--on]="method() === m" (click)="setMethod(m)">{{ 'finance.methods.' + m | translate }}</button>
            }
          </div>
        </div>

        @if (!editing && data.openShiftId && method() === 'cash') {
        <div class="xd__till">
          <div>
            <p class="text-sm font-semibold">{{ 'finance.fromTill' | translate }}</p>
            <p class="text-xs text-muted">{{ 'finance.fromTillHint' | translate }}</p>
          </div>
          <mat-slide-toggle [ngModel]="fromShift()" (ngModelChange)="fromShift.set($event)" [attr.aria-label]="'finance.fromTill' | translate"></mat-slide-toggle>
        </div>
        }
        @if (amountLocked) {
        <p class="text-xs text-muted">{{ 'finance.lockedAmount' | translate }}</p>
        }

        <label class="block">
          <span class="xd__label">{{ 'finance.note' | translate }}</span>
          <textarea class="xd__input" rows="2" maxlength="300" [ngModel]="note()" (ngModelChange)="note.set($event)" [placeholder]="'finance.notePlaceholder' | translate"></textarea>
        </label>
      </div>
      <div class="flex items-center justify-end gap-2 px-6 py-4">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | translate }}</button>
        <button mat-flat-button color="primary" type="button" [disabled]="!valid()" (click)="save()">
          {{ 'common.save' | translate }} · <span class="money">{{ amount() | currencyDisplay:0 }}</span>
        </button>
      </div>
    </div>
  `,
  styles: `
    .xd { color: var(--text); }
    .xd__label { display: block; margin-bottom: 0.35rem; font-size: 0.8rem; font-weight: 500; color: var(--text-muted); }
    .xd__cats { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 0.5rem; }
    .xd__cat {
      display: flex; flex-direction: column; align-items: center; gap: 0.25rem; padding: 0.65rem 0.25rem;
      border: 1.5px solid var(--border); border-radius: 14px; background: var(--surface); color: var(--text);
      font-size: 0.78rem; font-weight: 600; text-align: center; transition: all 0.12s;
    }
    .xd__cat mat-icon { color: var(--text-muted); }
    .xd__cat:hover { border-color: var(--brand); }
    .xd__cat--on { border-color: var(--brand); background: var(--brand-soft); color: var(--brand-strong); }
    .xd__cat--on mat-icon { color: var(--brand); }
    .xd__amount, .xd__input {
      width: 100%; border: 1px solid var(--border-strong); border-radius: 12px; background: var(--surface);
      color: var(--text); outline: none;
    }
    .xd__amount { padding: 0.55rem 0.85rem; font-size: 1.6rem; font-weight: 700; }
    .xd__input { padding: 0.6rem 0.8rem; font-size: 0.95rem; }
    .xd__amount:focus, .xd__input:focus { border-color: var(--brand); box-shadow: 0 0 0 4px var(--brand-ring); }
    .xd__amount:disabled { opacity: 0.6; }
    .xd__till {
      display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.85rem 1rem;
      border-radius: 14px; background: var(--warning-soft);
    }
  `
})
export class ExpenseDialogComponent {
  data = inject<ExpenseDialogData>(MAT_DIALOG_DATA, { optional: true }) ?? {};
  private ref = inject(MatDialogRef<ExpenseDialogComponent, ExpenseDialogResult>);

  readonly categories = EXPENSE_CATEGORIES;
  readonly icons = EXPENSE_CATEGORY_ICONS;
  readonly methods: ExpenseMethod[] = ['cash', 'card', 'bank'];
  readonly editing = !!this.data.expense;
  /** Taken from a till: the linked cash movement is immutable, so is the amount. */
  readonly amountLocked = !!this.data.expense?.cashMovementId;

  category = signal<ExpenseCategory>(this.data.expense?.category ?? 'rent');
  amount = signal(this.data.expense?.amount ?? 0);
  date = signal(this.data.expense ? toInput(new Date(this.data.expense.date)) : today());
  method = signal<ExpenseMethod>(this.data.expense?.method ?? 'cash');
  note = signal(this.data.expense?.note ?? '');
  fromShift = signal(false);

  valid = computed(() => this.amount() > 0 && !!fromDateInput(this.date()));

  setMethod(m: ExpenseMethod) {
    if (this.amountLocked) return;
    this.method.set(m);
    if (m !== 'cash') this.fromShift.set(false);
  }

  save() {
    const date = fromDateInput(this.date());
    if (!this.valid() || !date) return;
    // Keep the time of day for today's entries so the list sorts naturally.
    const now = new Date();
    if (date.toDateString() === now.toDateString()) date.setHours(now.getHours(), now.getMinutes());
    else date.setHours(12);
    this.ref.close({
      input: { category: this.category(), amount: this.amount(), date, method: this.method(), note: this.note() },
      fromShift: this.fromShift()
    });
  }
}

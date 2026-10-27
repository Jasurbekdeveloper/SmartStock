import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';
import { CollectPaymentResult, Debt, DebtPaymentMethod, DebtService } from '../../../core/services/debt.service';
import { AuthService } from '../../../core/services/auth.service';
import { ShiftService } from '../../../core/services/shift.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import { normalizeForSearch } from '../../../core/utils/uzbek-transliteration';
import { roundMoney } from '../../../core/utils/pos-math';
import { NumpadComponent } from '../numpad/numpad.component';

export interface DebtPaymentDialogData {
  /** Opens straight on this customer; otherwise the cashier picks one. */
  customerId?: string;
  /** Pay this one debt only. */
  debtId?: string;
}

interface Debtor {
  id: string;
  name: string;
  phone: string;
  owed: number;
  debts: Debt[];
}

/**
 * Takes a customer's debt payment — at the till or in the back office. Cash taken
 * while the user has an open shift goes into that drawer (shows in the drawer total
 * and the Z-report); card payments are recorded without touching the drawer.
 */
@Component({
  selector: 'app-debt-payment-dialog',
  standalone: true,
  imports: [DatePipe, MatDialogModule, MatButtonModule, MatIconModule, TranslatePipe, CurrencyDisplayPipe, NumpadComponent],
  template: `
    <div class="dp">
      <div class="dp__head">
        <span class="dp__icon tone-green"><mat-icon>request_quote</mat-icon></span>
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-bold">{{ 'debts.collectTitle' | translate }}</h2>
          @if (debtor(); as d) {
          <p class="text-sm text-muted truncate">{{ d.name }} · {{ d.phone }}</p>
          }
        </div>
        <button mat-icon-button type="button" mat-dialog-close [attr.aria-label]="'common.close' | translate"><mat-icon>close</mat-icon></button>
      </div>

      @if (!debtor()) {
      <div class="px-5 pb-5 space-y-3">
        <label class="search-box !min-w-0">
          <mat-icon>search</mat-icon>
          <input type="search" [value]="query()" (input)="query.set($any($event.target).value)" [placeholder]="'debts.findCustomer' | translate" autofocus />
        </label>
        <div class="dp__list">
          @for (d of matches(); track d.id) {
          <button type="button" class="dp__row" (click)="pick(d)">
            <span class="min-w-0 flex-1 text-left">
              <span class="block font-semibold truncate">{{ d.name }}</span>
              <span class="block text-xs text-muted">{{ d.phone }} · {{ d.debts.length }} {{ 'debts.openDebts' | translate }}</span>
            </span>
            <b class="money text-loss">{{ d.owed | currencyDisplay:0 }}</b>
          </button>
          } @empty {
          <p class="text-sm text-muted text-center py-8">{{ 'debts.noDebtors' | translate }}</p>
          }
        </div>
      </div>
      } @else {
      <div class="dp__body">
        <div class="space-y-3 min-w-0">
          <div class="dp__owed">
            <span class="text-sm">{{ 'debts.totalOwed' | translate }}</span>
            <b class="money text-2xl">{{ owedNow() | currencyDisplay:0 }}</b>
          </div>
          <div class="dp__debts">
            @for (x of shownDebts(); track x.id) {
            <div class="flex justify-between text-sm py-1.5">
              <span class="text-muted">{{ x.createdAt | date: 'dd.MM.yyyy' }}</span>
              <span class="money">{{ x.remainingAmount | currencyDisplay:0 }}</span>
            </div>
            }
          </div>
          <div class="seg w-full">
            <button type="button" class="flex-1" [class.seg--on]="method() === 'cash'" (click)="method.set('cash')">{{ 'pos.cash' | translate }}</button>
            <button type="button" class="flex-1" [class.seg--on]="method() === 'card'" (click)="method.set('card')">{{ 'pos.card' | translate }}</button>
          </div>
          @if (method() === 'cash') {
          <p class="text-xs" [class.text-profit]="shiftId()" [class.text-muted]="!shiftId()">
            <mat-icon class="!w-4 !h-4 !text-base align-middle">{{ shiftId() ? 'point_of_sale' : 'info' }}</mat-icon>
            {{ (shiftId() ? 'debts.cashToDrawer' : 'debts.noShiftCash') | translate }}
          </p>
          }
          @if (!data.customerId) {
          <button mat-button type="button" (click)="pick(null)"><mat-icon>arrow_back</mat-icon>{{ 'debts.otherCustomer' | translate }}</button>
          }
        </div>
        <div class="space-y-2">
          <div class="dp__amount" [class.dp__amount--over]="over()">
            <span class="text-xs text-muted">{{ 'debts.paymentAmount' | translate }}</span>
            <span class="money">{{ amountText() || '0' }}</span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="dp__quick" (click)="amountText.set(owedNow() + '')">{{ 'debts.payAll' | translate }}</button>
            <button type="button" class="dp__quick" (click)="amountText.set(half() + '')">½</button>
          </div>
          <app-numpad [value]="amountText()" (valueChange)="amountText.set($event)" [decimal]="false" [okLabel]="'debts.accept' | translate" (enter)="save()" />
        </div>
      </div>
      <div class="dp__foot">
        @if (over()) { <span class="text-xs text-loss mr-auto">{{ 'debts.overpayCapped' | translate }}</span> }
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | translate }}</button>
        <button mat-flat-button color="primary" type="button" class="!h-12 !px-6" [disabled]="!(amount() > 0) || saving()" (click)="save()">
          <mat-icon>check</mat-icon>{{ 'debts.accept' | translate }} · <span class="money">{{ applied() | currencyDisplay:0 }}</span>
        </button>
      </div>
      }
    </div>
  `,
  styles: `
    .dp { color: var(--text); }
    .dp__head { display: flex; align-items: center; gap: 0.85rem; padding: 1.1rem 1.25rem 0.9rem; }
    .dp__icon { display: grid; place-items: center; width: 2.75rem; height: 2.75rem; border-radius: 14px; flex-shrink: 0; }
    .dp__list { max-height: 50vh; overflow: auto; border: 1px solid var(--border); border-radius: 14px; }
    .dp__row { width: 100%; display: flex; align-items: center; gap: 0.75rem; padding: 0.85rem 1rem; min-height: 3.5rem; border-bottom: 1px solid var(--border); background: var(--surface); }
    .dp__row:last-child { border-bottom: 0; }
    .dp__row:active { background: var(--surface-3); }
    .dp__body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 1.25rem; padding: 0 1.25rem; }
    @media (max-width: 640px) { .dp__body { grid-template-columns: 1fr; } }
    .dp__owed { display: flex; flex-direction: column; padding: 0.9rem 1rem; border-radius: 14px; background: var(--danger-soft); color: var(--danger); }
    .dp__debts { max-height: 9.5rem; overflow: auto; padding: 0 0.25rem; }
    .dp__amount { display: flex; flex-direction: column; align-items: flex-end; padding: 0.6rem 1rem; border-radius: 14px; border: 2px solid var(--brand); background: var(--surface); }
    .dp__amount .money { font-size: 2rem; font-weight: 800; line-height: 1.1; }
    .dp__amount--over { border-color: var(--warning); }
    .dp__quick { height: 2.75rem; border-radius: 12px; border: 1px solid var(--border); background: var(--surface-2); font-weight: 600; }
    .dp__foot { display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem; padding: 1rem 1.25rem 1.25rem; }
    .seg button { padding-top: 0.7rem; padding-bottom: 0.7rem; }
  `
})
export class DebtPaymentDialogComponent {
  data = inject<DebtPaymentDialogData>(MAT_DIALOG_DATA, { optional: true }) ?? {};
  private ref = inject(MatDialogRef<DebtPaymentDialogComponent, CollectPaymentResult>);
  private debtService = inject(DebtService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private translation = inject(TranslationService);

  private customers = toSignal(this.debtService.getCustomers().pipe(catchError(() => of([]))), { initialValue: [] });
  private debts = toSignal(this.debtService.getDebts().pipe(catchError(() => of([] as Debt[]))), { initialValue: [] as Debt[] });
  private openShift = toSignal(
    inject(ShiftService).getOpenShiftForUser(this.auth.getCurrentUser()?.uid ?? '').pipe(catchError(() => of(undefined))),
    { initialValue: undefined }
  );
  shiftId = computed(() => this.openShift()?.id);

  query = signal('');
  method = signal<DebtPaymentMethod>('cash');
  amountText = signal('');
  saving = signal(false);
  private picked = signal<string | null>(this.data.customerId ?? null);

  private debtors = computed<Debtor[]>(() => {
    const byCustomer = new Map<string, Debt[]>();
    for (const d of this.debts()) {
      if (d.remainingAmount <= 0.005) continue;
      const list = byCustomer.get(d.customerId) ?? [];
      list.push(d);
      byCustomer.set(d.customerId, list);
    }
    return this.customers()
      .filter((c) => byCustomer.has(c.id))
      .map((c) => {
        const debts = byCustomer.get(c.id)!;
        return { id: c.id, name: c.name, phone: c.phone, debts, owed: roundMoney(debts.reduce((s, d) => s + d.remainingAmount, 0)) };
      })
      .sort((a, b) => b.owed - a.owed);
  });

  matches = computed(() => {
    const q = normalizeForSearch(this.query().trim());
    const list = this.debtors();
    if (!q) return list;
    return list.filter((d) => normalizeForSearch(d.name).includes(q) || d.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§'));
  });

  debtor = computed(() => {
    const id = this.picked();
    return id ? this.debtors().find((d) => d.id === id) ?? null : null;
  });

  shownDebts = computed(() => {
    const d = this.debtor();
    if (!d) return [];
    return this.data.debtId ? d.debts.filter((x) => x.id === this.data.debtId) : d.debts;
  });

  owedNow = computed(() => roundMoney(this.shownDebts().reduce((s, d) => s + d.remainingAmount, 0)));
  half = computed(() => Math.round(this.owedNow() / 2));
  amount = computed(() => Number(this.amountText()) || 0);
  over = computed(() => this.amount() > this.owedNow() + 0.005);
  applied = computed(() => Math.min(this.amount(), this.owedNow()));

  pick(d: Debtor | null) {
    this.picked.set(d?.id ?? null);
    this.amountText.set('');
  }

  save() {
    const d = this.debtor();
    if (!d || !(this.amount() > 0) || this.saving()) return;
    this.saving.set(true);
    this.debtService
      .collectPayment({
        customerId: d.id,
        customerName: d.name,
        amount: this.applied(),
        method: this.method(),
        shiftId: this.shiftId(),
        debtId: this.data.debtId
      })
      .subscribe({
        next: (result) => {
          this.saving.set(false);
          this.toast.success(this.translation.translate('debts.paymentSuccess'));
          this.ref.close(result);
        },
        error: (err) => {
          console.error('Debt payment error:', err);
          this.saving.set(false);
          this.toast.error(this.translation.translate('messages.error'));
        }
      });
  }
}

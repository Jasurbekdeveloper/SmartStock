import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { Customer, DebtService } from '../../core/services/debt.service';
import { CurrencyDisplayPipe } from '../../core/pipes/currency-display.pipe';
import { formatNumber } from '../../core/utils/format-number';
import {
  CheckoutLineInput,
  DiscountMode,
  VatOptions,
  calculateCheckout,
  resolveDiscount,
  splitPayment
} from '../../core/utils/pos-math';

export interface PosPaymentDialogData {
  lines: CheckoutLineInput[];
  vat: VatOptions;
  customers: Customer[];
}

export interface PosPaymentDialogResult {
  /** Absolute cart-level discount. */
  discount: number;
  cashTendered: number;
  cardAmount: number;
  isNewCustomer: boolean;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
}

type Tender = 'cash' | 'card' | 'mixed' | 'debt';

@Component({
  selector: 'app-pos-payment-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    CurrencyDisplayPipe,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule
  ],
  templateUrl: './pos-payment-dialog.component.html',
  styleUrl: './pos-payment-dialog.component.css'
})
export class PosPaymentDialogComponent {
  dialogRef = inject(MatDialogRef<PosPaymentDialogComponent, PosPaymentDialogResult>);
  data = inject<PosPaymentDialogData>(MAT_DIALOG_DATA);
  private debtService = inject(DebtService);
  private translateService = inject(TranslateService);

  tender = signal<Tender>('cash');
  discountMode = signal<DiscountMode>('amount');
  discountInput = signal(0);
  cashInput = signal(0);
  cardInput = signal(0);

  isNewCustomer = signal(false);
  selectedCustomerId = signal('');
  customerName = signal('');
  customerPhone = signal('');

  /** Subtotal before the cart-level discount — what a percentage applies to. */
  private baseSubtotal = calculateCheckout(this.data.lines, 0, this.data.vat).subtotal;

  discount = computed(() => resolveDiscount(this.baseSubtotal, this.discountInput(), this.discountMode()));

  checkout = computed(() => calculateCheckout(this.data.lines, this.discount(), this.data.vat));
  total = computed(() => this.checkout().total);

  /** Total without the cart discount, shown struck through while one is applied. */
  originalTotal = calculateCheckout(this.data.lines, 0, this.data.vat).total;

  split = computed(() => {
    const total = this.total();
    switch (this.tender()) {
      case 'card':
        return splitPayment(total, 0, total);
      case 'mixed':
        return splitPayment(total, this.cashInput(), this.cardInput());
      default:
        return splitPayment(total, this.cashInput(), 0);
    }
  });

  hasDebtPortion = computed(() => this.split().debt > 0);

  selectedCustomer = computed(() => this.data.customers.find((c) => c.id === this.selectedCustomerId()));

  private selectedCustomerDebts = toSignal(
    toObservable(this.selectedCustomerId).pipe(
      switchMap((id) => (id ? this.debtService.getCustomerDebts(id) : of([])))
    ),
    { initialValue: [] }
  );

  currentDebtTotal = computed(() => this.selectedCustomerDebts().reduce((sum, d) => sum + d.remainingAmount, 0));

  creditLimitExceeded = computed(() => {
    if (this.isNewCustomer() || !this.hasDebtPortion()) return false;
    const limit = this.selectedCustomer()?.creditLimit;
    if (!limit) return false;
    return this.currentDebtTotal() + this.split().debt > limit;
  });

  creditLimitWarning = computed(() => {
    const limit = this.selectedCustomer()?.creditLimit;
    if (!this.creditLimitExceeded() || !limit) return '';
    return this.translateService.instant('pos.creditLimitExceeded', {
      limit: formatNumber(limit, 0),
      current: formatNumber(this.currentDebtTotal(), 0)
    });
  });

  canSubmit = computed(() => {
    if (this.total() < 0) return false;
    if (!this.hasDebtPortion()) return true;
    if (this.creditLimitExceeded()) return false;
    return this.isNewCustomer() ? this.customerName().trim().length > 0 : !!this.selectedCustomerId();
  });

  /** Common banknote-rounded amounts above the total, for one-tap cash entry. */
  quickAmounts = computed(() => {
    const due = this.tender() === 'mixed' ? Math.max(0, this.total() - this.cardInput()) : this.total();
    if (due <= 0) return [];
    const roundUp = (value: number, step: number) => Math.ceil(value / step) * step;
    const amounts = [due, roundUp(due, 1000), roundUp(due, 5000), roundUp(due, 10000), roundUp(due, 50000), roundUp(due, 100000)];
    return Array.from(new Set(amounts.map((a) => Math.round(a)))).sort((a, b) => a - b).slice(0, 5);
  });

  constructor() {
    this.cashInput.set(Math.ceil(this.total()));
  }

  setTender(tender: Tender) {
    this.tender.set(tender);
    const total = Math.ceil(this.total());
    if (tender === 'cash') this.cashInput.set(total);
    if (tender === 'debt') {
      this.cashInput.set(0);
    }
    if (tender === 'mixed') {
      this.cardInput.set(0);
      this.cashInput.set(total);
    }
  }

  setDiscountMode(mode: DiscountMode) {
    this.discountMode.set(mode);
    this.discountInput.set(0);
    this.syncCashToTotal();
  }

  setDiscount(value: number) {
    this.discountInput.set(Math.max(0, +value || 0));
    this.syncCashToTotal();
  }

  /** In mixed mode, typing the card part auto-fills cash with the rest. */
  setCard(value: number) {
    this.cardInput.set(Math.max(0, +value || 0));
    this.cashInput.set(Math.max(0, Math.ceil(this.total() - this.cardInput())));
  }

  setCash(value: number) {
    this.cashInput.set(Math.max(0, +value || 0));
  }

  /** Keeps a cash-only payment exactly matching the total after the discount changes. */
  private syncCashToTotal() {
    if (this.tender() === 'cash') this.cashInput.set(Math.ceil(this.total()));
    if (this.tender() === 'mixed') this.cashInput.set(Math.max(0, Math.ceil(this.total() - this.cardInput())));
  }

  submit() {
    if (!this.canSubmit()) return;
    const split = this.split();

    this.dialogRef.close({
      discount: this.discount(),
      // Pass what was actually tendered (incl. change), the POS re-splits it.
      cashTendered: split.cash + split.change,
      cardAmount: split.card,
      isNewCustomer: this.isNewCustomer(),
      customerId: this.isNewCustomer() ? undefined : this.selectedCustomerId(),
      customerName: this.isNewCustomer() ? this.customerName().trim() : undefined,
      customerPhone: this.isNewCustomer() ? this.customerPhone().trim() : undefined
    });
  }

  cancel() {
    this.dialogRef.close();
  }
}

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
import { Customer, DebtService } from '../../core/services/debt.service';
import { CurrencyDisplayPipe } from '../../core/pipes/currency-display.pipe';

export interface PosPaymentDialogData {
  total: number;
  customers: Customer[];
}

export interface PosPaymentDialogResult {
  paymentMethod: 'cash' | 'card';
  paidAmount: number;
  discount: number;
  isNewCustomer: boolean;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
}

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
    MatSelectModule
  ],
  templateUrl: './pos-payment-dialog.component.html'
})
export class PosPaymentDialogComponent {
  dialogRef = inject(MatDialogRef<PosPaymentDialogComponent, PosPaymentDialogResult>);
  data = inject<PosPaymentDialogData>(MAT_DIALOG_DATA);
  private debtService = inject(DebtService);
  private translateService = inject(TranslateService);

  paymentMethod = signal<'cash' | 'card'>('cash');
  paidAmount = signal(Math.ceil(this.data.total));
  discount = signal(0);
  isNewCustomer = signal(true);
  selectedCustomerId = signal('');
  customerName = signal('');
  customerPhone = signal('');

  /** What's actually payable once the discount is taken off the cart total. */
  discountedTotal = computed(() => Math.max(0, this.data.total - this.discount()));

  change = computed(() => Math.max(0, this.paidAmount() - this.discountedTotal()));
  debtAmount = computed(() => Math.max(0, this.discountedTotal() - this.paidAmount()));
  hasDebtPortion = computed(() => this.debtAmount() > 0);

  selectedCustomer = computed(() => this.data.customers.find((c) => c.id === this.selectedCustomerId()));

  /** Only queried for an *existing* selected customer — a brand-new customer has no
   *  id (and thus no creditLimit/debt history) yet at this point in the flow. */
  private selectedCustomerDebts = toSignal(
    toObservable(this.selectedCustomerId).pipe(
      switchMap((id) => (id ? this.debtService.getCustomerDebts(id) : of([])))
    ),
    { initialValue: [] }
  );

  /** Sum of this customer's outstanding debt across all prior sales, excluding the
   *  new debt about to be created by this checkout. */
  currentDebtTotal = computed(() => this.selectedCustomerDebts().reduce((sum, d) => sum + d.remainingAmount, 0));

  /** True only when the selected existing customer has a creditLimit set and this
   *  checkout's new debt would push their total outstanding debt past it. New
   *  customers and customers without a creditLimit (unlimited) are never blocked. */
  creditLimitExceeded = computed(() => {
    if (this.isNewCustomer() || !this.hasDebtPortion()) return false;
    const customer = this.selectedCustomer();
    if (!customer?.creditLimit) return false;
    return this.currentDebtTotal() + this.debtAmount() > customer.creditLimit;
  });

  creditLimitWarning = computed(() => {
    if (!this.creditLimitExceeded()) return '';
    const customer = this.selectedCustomer();
    if (!customer?.creditLimit) return '';
    return this.translateService.instant('pos.creditLimitExceeded', {
      limit: customer.creditLimit,
      current: this.currentDebtTotal()
    });
  });

  canSubmit = computed(() => {
    if (this.discount() > this.data.total) return false;
    if (!this.hasDebtPortion()) return true;
    if (this.creditLimitExceeded()) return false;
    return this.isNewCustomer() ? this.customerName().trim().length > 0 : !!this.selectedCustomerId();
  });

  quickAmounts = computed(() => {
    const total = this.discountedTotal();
    if (total <= 0) return [];
    const roundUp = (value: number, step: number) => Math.ceil(value / step) * step;
    const amounts = [total, roundUp(total, 10000), roundUp(total, 50000), roundUp(total, 100000)];
    return Array.from(new Set(amounts.map((a) => Math.round(a)))).sort((a, b) => a - b);
  });

  setPaidAmount(amount: number) {
    this.paidAmount.set(amount);
  }

  submit() {
    if (!this.canSubmit()) return;

    this.dialogRef.close({
      paymentMethod: this.paymentMethod(),
      paidAmount: this.paidAmount(),
      discount: this.discount(),
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

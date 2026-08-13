import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Customer } from '../../core/services/debt.service';
import { SumPipe } from '../../core/pipes/sum.pipe';

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
    SumPipe,
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

  canSubmit = computed(() => {
    if (this.discount() > this.data.total) return false;
    if (!this.hasDebtPortion()) return true;
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

import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Sale, SaleReturn, SaleReturnItem } from '../../../core/services/sales.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';
import { roundMoney } from '../../../core/utils/pos-math';
import { BatchAllocation, restoreAllocation, subtractAllocations } from '../../../core/utils/batches';
import { NumericInputDirective } from '../../../shared/directives/numeric-input.directive';

export interface ReturnDialogData {
  sale: Sale;
  previousReturns: SaleReturn[];
}

export interface ReturnDialogResult {
  items: SaleReturnItem[];
  refundAmount: number;
  refundMethod: 'cash' | 'card';
  reason?: string;
}

interface ReturnRow {
  productId: string;
  productName: string;
  sold: number;
  returnable: number;
  /** What one unit actually cost the customer, after every discount and VAT. */
  unitRefund: number;
  /** Batch slices still available to give back. */
  batchesLeft: BatchAllocation[];
}

@Component({
  selector: 'app-return-dialog',
  standalone: true,
  imports: [NumericInputDirective, 
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    TranslatePipe,
    CurrencyDisplayPipe,
    SumPipe
  ],
  template: `
    <h2 mat-dialog-title>{{ 'returns.newReturn' | translate }}</h2>
    <mat-dialog-content>
      <div class="space-y-2">
        @for (row of rows; track row.productId; let i = $index) {
          <div class="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
            <div class="flex-1 min-w-0">
              <p class="font-semibold truncate text-gray-900 dark:text-white">{{ row.productName }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ 'returns.returnable' | translate }}: {{ row.returnable | sum: 3 }} / {{ row.sold | sum: 3 }} ·
                {{ row.unitRefund | currencyDisplay: 0 }}
              </p>
            </div>
            <input
              type="number"
              min="0"
              [max]="row.returnable"
              step="any"
              [disabled]="row.returnable <= 0"
              [ngModel]="qty()[i]"
              (ngModelChange)="setQty(i, $event)"
              class="w-24 px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-right"
            />
          </div>
        }
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <span class="text-sm text-gray-600 dark:text-gray-300">{{ 'returns.refundMethod' | translate }}:</span>
        <mat-button-toggle-group [value]="refundMethod()" (change)="refundMethod.set($event.value)">
          <mat-button-toggle value="cash">{{ 'pos.cash' | translate }}</mat-button-toggle>
          <mat-button-toggle value="card">{{ 'pos.card' | translate }}</mat-button-toggle>
        </mat-button-toggle-group>
      </div>

      <mat-form-field appearance="outline" class="w-full mt-4" subscriptSizing="dynamic">
        <mat-label>{{ 'returns.reason' | translate }}</mat-label>
        <input matInput [ngModel]="reason()" (ngModelChange)="reason.set($event)" />
      </mat-form-field>

      <div class="mt-4 flex justify-between items-center p-3 rounded-lg bg-red-50 dark:bg-red-900/30">
        <span class="font-medium text-red-800 dark:text-red-200">{{ 'returns.refundAmount' | translate }}</span>
        <span class="text-xl font-bold text-red-700 dark:text-red-300">{{ refundAmount() | currencyDisplay }}</span>
      </div>
    </mat-dialog-content>
    @if (data.sale.debtAmount) {
      <p class="px-6 text-xs text-amber-700 dark:text-amber-300">{{ 'returns.debtSaleHint' | translate }}</p>
    }
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button color="warn" [disabled]="refundAmount() <= 0" (click)="submit()">
        {{ 'returns.confirm' | translate }}
      </button>
    </mat-dialog-actions>
  `
})
export class ReturnDialogComponent {
  dialogRef = inject(MatDialogRef<ReturnDialogComponent, ReturnDialogResult>);
  data = inject<ReturnDialogData>(MAT_DIALOG_DATA);

  rows: ReturnRow[] = this.buildRows();
  qty = signal<number[]>(this.rows.map(() => 0));
  refundMethod = signal<'cash' | 'card'>(this.data.sale.paymentMethod === 'card' ? 'card' : 'cash');
  reason = signal('');

  /** Money can only go back up to what was actually paid — the unpaid (debt) part of
   *  a sale and anything already refunded are excluded. */
  private maxRefund = roundMoney(
    Math.max(0, this.data.sale.total - (this.data.sale.debtAmount ?? 0) - (this.data.sale.refundedAmount ?? 0))
  );

  refundAmount = computed(() =>
    Math.min(
      this.maxRefund,
      roundMoney(this.rows.reduce((sum, row, i) => sum + row.unitRefund * (this.qty()[i] || 0), 0))
    )
  );

  private buildRows(): ReturnRow[] {
    const { sale, previousReturns } = this.data;
    const returned = new Map<string, number>();
    const givenBack = new Map<string, BatchAllocation[]>();
    for (const r of previousReturns) {
      for (const item of r.items) {
        returned.set(item.productId, (returned.get(item.productId) ?? 0) + item.quantity);
        givenBack.set(item.productId, [...(givenBack.get(item.productId) ?? []), ...(item.batches ?? [])]);
      }
    }

    // Sales made before `finalTotal` existed: spread the sale total over lines pro rata.
    const lineSum = sale.items.reduce((s, item) => s + item.total, 0);
    const ratio = lineSum > 0 ? sale.total / lineSum : 0;

    return sale.items.map((item) => {
      const paid = item.finalTotal ?? item.total * ratio;
      const alreadyReturned = returned.get(item.productId) ?? 0;
      returned.set(item.productId, Math.max(0, alreadyReturned - item.quantity));
      return {
        productId: item.productId,
        productName: item.productName,
        sold: item.quantity,
        returnable: Math.max(0, item.quantity - alreadyReturned),
        unitRefund: item.quantity > 0 ? paid / item.quantity : 0,
        // Batch slices of this line not yet given back by an earlier return.
        batchesLeft: subtractAllocations(item.batches, givenBack.get(item.productId) ?? [])
      };
    });
  }

  setQty(index: number, value: number) {
    const clamped = Math.max(0, Math.min(+value || 0, this.rows[index].returnable));
    this.qty.update((list) => list.map((q, i) => (i === index ? clamped : q)));
  }

  submit() {
    const items: SaleReturnItem[] = this.rows
      .map((row, i) => ({
        productId: row.productId,
        productName: row.productName,
        quantity: this.qty()[i] || 0,
        refund: roundMoney(row.unitRefund * (this.qty()[i] || 0)),
        batches: restoreAllocation(row.batchesLeft, this.qty()[i] || 0)
      }))
      .map((item) => (item.batches.length ? item : { ...item, batches: undefined }))
      .filter((item) => item.quantity > 0);
    if (items.length === 0) return;

    this.dialogRef.close({
      items,
      refundAmount: this.refundAmount(),
      refundMethod: this.refundMethod(),
      reason: this.reason().trim() || undefined
    });
  }
}

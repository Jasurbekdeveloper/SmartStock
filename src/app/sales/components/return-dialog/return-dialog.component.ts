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
import { isFiscalQrUrl } from '../../../core/utils/fiscal-receipt';
import { splitReturn } from '../../../core/utils/return-split';
import { NumericInputDirective } from '../../../shared/directives/numeric-input.directive';

export interface ReturnDialogData {
  sale: Sale;
  previousReturns: SaleReturn[];
  /** The refund goes on a fiscal receipt, which needs the QR code of the paper sale receipt. */
  needsFiscalQr?: boolean;
  /** Debt this sale opened, as it stands now (after repayments and earlier returns). */
  debt?: { id: string; remainingAmount: number } | null;
  customerName?: string;
}

export interface ReturnDialogResult {
  items: SaleReturnItem[];
  refundAmount: number;
  refundMethod: 'cash' | 'card';
  reason?: string;
  originalQrCodeUrl?: string;
  /** Set when part of the goods' value comes off the sale's debt. */
  debtId?: string;
  debtReduction?: number;
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
      @if (debtLinked()) {
        <div class="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-sm text-amber-900 dark:text-amber-100 space-y-1">
          <p class="font-semibold">{{ 'returns.debtSaleTitle' | translate }}@if (data.customerName) { · {{ data.customerName }}}</p>
          <p>{{ 'returns.debtSaleExplain' | translate }}</p>
          <div class="pt-1 grid grid-cols-3 gap-2 text-xs">
            <div><span class="block opacity-75">{{ 'returns.saleTotal' | translate }}</span><b class="money">{{ data.sale.total | currencyDisplay: 0 }}</b></div>
            <div><span class="block opacity-75">{{ 'returns.paidSoFar' | translate }}</span><b class="money">{{ paidLeft | currencyDisplay: 0 }}</b></div>
            <div><span class="block opacity-75">{{ 'returns.debtLeft' | translate }}</span><b class="money">{{ debtLeft | currencyDisplay: 0 }}</b></div>
          </div>
        </div>
      }

      <p class="text-sm text-gray-600 dark:text-gray-300 mb-2">{{ 'returns.chooseQty' | translate }}</p>
      <div class="space-y-2">
        @for (row of rows; track row.productId; let i = $index) {
          <div class="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
            <div class="flex-1 min-w-0">
              <p class="font-semibold truncate text-gray-900 dark:text-white">{{ row.productName }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ 'returns.returnable' | translate }}: {{ row.returnable | sum: 3 }} / {{ row.sold | sum: 3 }} ·
                {{ 'returns.unitPrice' | translate }}: {{ row.unitRefund | currencyDisplay: 0 }}
              </p>
            </div>
            <input
              type="number"
              min="0"
              [max]="row.returnable"
              step="any"
              placeholder="0"
              [disabled]="row.returnable <= 0"
              [ngModel]="qty()[i] || null"
              (ngModelChange)="setQty(i, $event)"
              class="w-24 px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-right"
            />
            <button mat-stroked-button type="button" class="!min-w-0 !px-3" [disabled]="row.returnable <= 0" (click)="setQty(i, row.returnable)">
              {{ 'returns.all' | translate }}
            </button>
          </div>
        }
      </div>

      @if (split().refund > 0 || !debtLinked()) {
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <span class="text-sm text-gray-600 dark:text-gray-300">{{ 'returns.refundMethod' | translate }}:</span>
          <mat-button-toggle-group [value]="refundMethod()" (change)="refundMethod.set($event.value)">
            <mat-button-toggle value="cash">{{ 'pos.cash' | translate }}</mat-button-toggle>
            <mat-button-toggle value="card">{{ 'pos.card' | translate }}</mat-button-toggle>
          </mat-button-toggle-group>
        </div>
      }

      @if (data.needsFiscalQr && split().refund > 0) {
        <mat-form-field appearance="outline" class="w-full mt-4" subscriptSizing="dynamic">
          <mat-label>{{ 'fiscal.originalQr' | translate }}</mat-label>
          <input matInput autocomplete="off" [ngModel]="fiscalQr()" (ngModelChange)="fiscalQr.set($event)" />
          <mat-hint>{{ 'fiscal.originalQrHint' | translate }}</mat-hint>
        </mat-form-field>
        @if (fiscalQr().trim() && !fiscalQrValid()) {
          <p class="mt-1 text-xs text-red-700 dark:text-red-300">{{ 'fiscal.originalQrInvalid' | translate }}</p>
        }
      }

      <mat-form-field appearance="outline" class="w-full mt-4" subscriptSizing="dynamic">
        <mat-label>{{ 'returns.reason' | translate }}</mat-label>
        <input matInput [ngModel]="reason()" (ngModelChange)="reason.set($event)" />
      </mat-form-field>

      <div class="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700 text-sm">
        <div class="flex justify-between items-center px-3 py-2">
          <span class="text-gray-600 dark:text-gray-300">{{ 'returns.goodsValue' | translate }}</span>
          <span class="font-semibold money">{{ split().goods | currencyDisplay }}</span>
        </div>
        @if (debtLinked()) {
          <div class="flex justify-between items-center px-3 py-2">
            <span class="text-gray-600 dark:text-gray-300">
              {{ 'returns.offDebt' | translate }}
              <span class="block text-xs opacity-75">{{ 'returns.debtLeft' | translate }}: {{ debtLeft | currencyDisplay: 0 }} → {{ debtLeft - split().debtReduction | currencyDisplay: 0 }}</span>
            </span>
            <span class="font-semibold money text-amber-700 dark:text-amber-300">−{{ split().debtReduction | currencyDisplay }}</span>
          </div>
        }
        <div class="flex justify-between items-center px-3 py-3 bg-red-50 dark:bg-red-900/30">
          <span class="font-medium text-red-800 dark:text-red-200">{{ 'returns.refundAmount' | translate }}</span>
          <span class="text-xl font-bold text-red-700 dark:text-red-300 money">{{ split().refund | currencyDisplay }}</span>
        </div>
      </div>
      @if (split().goods > 0 && split().refund === 0 && split().debtReduction > 0) {
        <p class="mt-2 text-xs text-gray-600 dark:text-gray-300">{{ 'returns.noMoneyBack' | translate }}</p>
      }
      @if (!debtLinked() && data.sale.debtAmount) {
        <p class="mt-2 text-xs text-amber-700 dark:text-amber-300">{{ 'returns.debtSaleHint' | translate }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button color="warn" [disabled]="!canSubmit()" (click)="submit()">
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
  fiscalQr = signal('');
  fiscalQrValid = computed(() => isFiscalQrUrl(this.fiscalQr()));
  /** The sale's debt is known, so returned goods can come off it. */
  debtLinked = computed(() => !!this.data.debt && (this.data.sale.debtAmount ?? 0) > 0);

  /** What the customer still owes for this sale. */
  readonly debtLeft = roundMoney(this.debtLinked() ? Math.max(0, this.data.debt!.remainingAmount) : 0);

  /**
   * Money the customer paid for this sale and hasn't had back yet. With a known debt:
   * total − goods already taken off the debt − debt still open − money already refunded
   * (repayments since the sale count as paid). Without it, the unpaid part is excluded.
   */
  readonly paidLeft = roundMoney(
    Math.max(
      0,
      this.data.sale.total -
        (this.debtLinked()
          ? (this.data.sale.debtReturned ?? 0) + this.debtLeft
          : (this.data.sale.debtAmount ?? 0)) -
        (this.data.sale.refundedAmount ?? 0)
    )
  );

  split = computed(() =>
    splitReturn(
      this.rows.reduce((sum, row, i) => sum + row.unitRefund * (this.qty()[i] || 0), 0),
      this.debtLeft,
      this.paidLeft
    )
  );

  /** Money going back to the customer. */
  refundAmount = computed(() => this.split().refund);

  canSubmit = computed(() => {
    const s = this.split();
    if (s.refund <= 0 && s.debtReduction <= 0) return false;
    return !this.data.needsFiscalQr || s.refund <= 0 || this.fiscalQrValid();
  });

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
    if (items.length === 0 || !this.canSubmit()) return;

    const s = this.split();
    this.dialogRef.close({
      items,
      refundAmount: s.refund,
      refundMethod: this.refundMethod(),
      reason: this.reason().trim() || undefined,
      ...(this.data.needsFiscalQr && s.refund > 0 ? { originalQrCodeUrl: this.fiscalQr().trim() } : {}),
      ...(s.debtReduction > 0 && this.data.debt ? { debtId: this.data.debt.id, debtReduction: s.debtReduction } : {})
    });
  }
}

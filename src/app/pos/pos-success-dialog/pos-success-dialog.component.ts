import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { CurrencyDisplayPipe } from '../../core/pipes/currency-display.pipe';

export interface PosSuccessDialogData {
  saleId: string;
  receiptNo: string;
  total: number;
  change: number;
  debt: number;
}

/** Shown after every sale: the change to hand back, big, plus a one-key receipt print. */
@Component({
  selector: 'app-pos-success-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslatePipe, CurrencyDisplayPipe],
  template: `
    <div class="p-6 text-center">
      <div class="mx-auto mb-3 grid place-items-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/40">
        <mat-icon class="!w-9 !h-9 !text-4xl text-green-600 dark:text-green-400">check</mat-icon>
      </div>
      <h2 class="text-xl font-bold text-gray-900 dark:text-white">{{ 'pos.saleDone' | translate }}</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400">№ {{ data.receiptNo }} · {{ data.total | currencyDisplay: 0 }}</p>

      @if (data.debt > 0) {
      <div class="mt-5 rounded-xl bg-amber-50 dark:bg-amber-900/30 p-4">
        <p class="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">{{ 'pos.debit' | translate }}</p>
        <p class="text-3xl font-extrabold text-amber-700 dark:text-amber-300 tabular-nums">{{ data.debt | currencyDisplay: 0 }}</p>
      </div>
      } @else {
      <div class="mt-5 rounded-xl bg-green-50 dark:bg-green-900/30 p-4">
        <p class="text-xs uppercase tracking-wide text-green-700 dark:text-green-300">{{ 'pos.change' | translate }}</p>
        <p class="text-4xl font-extrabold text-green-700 dark:text-green-300 tabular-nums">{{ data.change | currencyDisplay: 0 }}</p>
      </div>
      }

      <div class="mt-6 grid grid-cols-2 gap-3">
        <button mat-stroked-button class="!h-12" (click)="dialogRef.close('print')">
          <mat-icon>print</mat-icon>
          {{ 'sales.printReceipt' | translate }}
        </button>
        <button mat-flat-button color="primary" class="!h-12" cdkFocusInitial (click)="dialogRef.close()">
          {{ 'pos.newSale' | translate }}
        </button>
      </div>
      <p class="mt-3 text-xs text-gray-400">Enter — {{ 'pos.newSale' | translate }}</p>
    </div>
  `
})
export class PosSuccessDialogComponent {
  dialogRef = inject(MatDialogRef<PosSuccessDialogComponent>);
  data = inject<PosSuccessDialogData>(MAT_DIALOG_DATA);
}

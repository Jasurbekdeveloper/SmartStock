import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatPaginatorModule } from '@angular/material/paginator';
import { SalesService, Sale, saleCardIn, saleCashIn } from '../../../core/services/sales.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';
import { createPagination } from '../../../core/utils/pagination';
import { normalizeForSearch } from '../../../core/utils/uzbek-transliteration';
import { DEFAULT_RANGE_DAYS, daysAgo, endOfDay, startOfDay } from '../../../core/utils/date-range';

type PaymentFilter = 'all' | 'cash' | 'card' | 'mixed';

@Component({
  selector: 'app-sales-history',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TranslatePipe,
    TranslateModule,
    CurrencyDisplayPipe,
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatPaginatorModule
  ],
  templateUrl: './sales-history.component.html',
  styleUrl: './sales-history.component.css'
})
export class SalesHistoryComponent {
  private salesService = inject(SalesService);

  searchQuery = signal('');
  paymentFilter = signal<PaymentFilter>('all');
  /** The date range is what Firestore is queried with (not just a client-side filter),
   *  so it always has a start: the last DEFAULT_RANGE_DAYS days unless the user picks one. */
  startDate = signal<Date | null>(daysAgo(DEFAULT_RANGE_DAYS));
  endDate = signal<Date | null>(null);

  private range = computed(() => ({
    from: startOfDay(this.startDate() ?? daysAgo(DEFAULT_RANGE_DAYS)),
    to: this.endDate() ? endOfDay(this.endDate()!) : null
  }));

  sales = toSignal(
    toObservable(this.range).pipe(switchMap(({ from, to }) => this.salesService.getSalesInRange(from, to))),
    { initialValue: [] as Sale[] }
  );

  itemNames(sale: Sale): string {
    return sale.items.map((item) => `${item.productName} x${item.quantity}`).join(', ');
  }

  filteredSales = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const method = this.paymentFilter();
    const start = this.startDate();
    const end = this.endDate();

    return this.sales().filter((sale) => {
      if (method !== 'all' && sale.paymentMethod !== method) return false;

      const saleDate = new Date(sale.createdAt);
      if (start && saleDate < start) return false;
      if (end) {
        const endOfDay = new Date(end);
        endOfDay.setHours(23, 59, 59, 999);
        if (saleDate > endOfDay) return false;
      }

      if (query) {
        // Cross-script normalization (13-band) for item names — amount matching
        // stays a plain numeric substring check, unaffected.
        const matchesName = normalizeForSearch(this.itemNames(sale)).includes(normalizeForSearch(query));
        const matchesAmount = sale.total.toString().includes(query);
        const matchesReceipt = (sale.receiptNo ?? sale.id).toLowerCase().includes(query);
        if (!matchesName && !matchesAmount && !matchesReceipt) return false;
      }

      return true;
    });
  });

  pagination = createPagination(this.filteredSales);

  clearFilters() {
    this.searchQuery.set('');
    this.paymentFilter.set('all');
    this.startDate.set(daysAgo(DEFAULT_RANGE_DAYS));
    this.endDate.set(null);
    this.pagination.reset();
  }

  onSearchChange(value: string) {
    this.searchQuery.set(value);
    this.pagination.reset();
  }

  onPaymentFilterChange(value: PaymentFilter) {
    this.paymentFilter.set(value);
    this.pagination.reset();
  }

  onStartDateChange(value: Date | null) {
    this.startDate.set(value);
    this.pagination.reset();
  }

  onEndDateChange(value: Date | null) {
    this.endDate.set(value);
    this.pagination.reset();
  }

  exportToCSV() {
    const csv = ['Receipt,Date,Items,Payment,Cash,Card,Debt,Refunded,Total'].concat(
      this.filteredSales().map(s => {
        const items = s.items.map((item) => `${item.productName} x${item.quantity}`).join('; ').replace(/"/g, '""');
        return [
          s.receiptNo ?? s.id,
          new Date(s.createdAt).toLocaleString(),
          `"${items}"`,
          s.paymentMethod,
          saleCashIn(s).toFixed(2),
          saleCardIn(s).toFixed(2),
          (s.debtAmount ?? 0).toFixed(2),
          (s.refundedAmount ?? 0).toFixed(2),
          s.total.toFixed(2)
        ].join(',');
      })
    ).join('\n');

    const link = document.createElement('a');
    // BOM so Excel reads UTF-8 (Uzbek/Cyrillic product names) correctly.
    link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('﻿' + csv);
    link.download = 'sales-history.csv';
    link.click();
  }
}

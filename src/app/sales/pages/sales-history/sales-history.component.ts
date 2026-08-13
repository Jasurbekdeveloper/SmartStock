import { Component, OnInit, computed, signal } from '@angular/core';
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
import { SalesService, Sale } from '../../../core/services/sales.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';
import { createPagination } from '../../../core/utils/pagination';

type PaymentFilter = 'all' | 'cash' | 'card';

@Component({
  selector: 'app-sales-history',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TranslatePipe,
    TranslateModule,
    SumPipe,
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
export class SalesHistoryComponent implements OnInit {
  sales = signal<Sale[]>([]);

  searchQuery = signal('');
  paymentFilter = signal<PaymentFilter>('all');
  startDate = signal<Date | null>(null);
  endDate = signal<Date | null>(null);

  constructor(private salesService: SalesService) {}

  ngOnInit() {
    this.loadSales();
  }

  loadSales() {
    this.salesService.getSales().subscribe(sales => {
      this.sales.set(sales);
    });
  }

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
        const matchesName = this.itemNames(sale).toLowerCase().includes(query);
        const matchesAmount = sale.total.toString().includes(query);
        if (!matchesName && !matchesAmount) return false;
      }

      return true;
    });
  });

  pagination = createPagination(this.filteredSales);

  clearFilters() {
    this.searchQuery.set('');
    this.paymentFilter.set('all');
    this.startDate.set(null);
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
    const csv = ['Date,Items,Payment,Total'].concat(
      this.filteredSales().map(s => {
        const items = s.items.map((item) => `${item.productName} x${item.quantity}`).join('; ');
        return `${new Date(s.createdAt).toLocaleDateString()},"${items}",${s.paymentMethod},${s.total.toFixed(2)}`;
      })
    ).join('\n');

    const link = document.createElement('a');
    link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    link.download = 'sales-history.csv';
    link.click();
  }
}

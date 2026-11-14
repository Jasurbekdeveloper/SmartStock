import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { StockEntry, StockService } from '../../../core/services/stock.service';
import { ProductService } from '../../../core/services/product.service';
import { Sale, SaleReturn, SalesService } from '../../../core/services/sales.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';
import { createPagination } from '../../../core/utils/pagination';
import { DEFAULT_RANGE_DAYS, daysAgo } from '../../../core/utils/date-range';
import { JournalKind, buildStockJournal } from '../../../core/utils/stock-journal';
import { normalizeForSearch } from '../../../core/utils/uzbek-transliteration';

type KindFilter = 'all' | JournalKind;

/**
 * Stock movement journal: deliveries, write-offs and counts (stock entries) together
 * with sales and returns of the last DEFAULT_RANGE_DAYS days, so every change of a
 * product's quantity can be traced.
 */
@Component({
  selector: 'app-stock-history',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe, SumPipe, MatCardModule, MatPaginatorModule, MatButtonToggleModule, MatIconModule],
  templateUrl: './stock-history.component.html',
  styleUrl: './stock-history.component.css'
})
export class StockHistoryComponent {
  private stockService = inject(StockService);
  private productService = inject(ProductService);
  private salesService = inject(SalesService);

  private since = daysAgo(DEFAULT_RANGE_DAYS);
  readonly days = DEFAULT_RANGE_DAYS;

  stockEntries = toSignal(this.stockService.getStockEntries().pipe(catchError(() => of([] as StockEntry[]))), { initialValue: [] });
  private sales = toSignal(this.salesService.getSalesInRange(this.since).pipe(catchError(() => of([] as Sale[]))), { initialValue: [] });
  private returns = toSignal(this.salesService.getReturnsSince(this.since).pipe(catchError(() => of([] as SaleReturn[]))), { initialValue: [] });
  products = toSignal(this.productService.getProducts(), { initialValue: [] });
  private names = computed(() => new Map(this.products().map((p) => [p.id, p.name])));

  kind = signal<KindFilter>('all');
  query = signal('');

  rows = computed(() => {
    const kind = this.kind();
    const q = normalizeForSearch(this.query().trim());
    return buildStockJournal(this.stockEntries(), this.sales(), this.returns()).filter(
      (r) => (kind === 'all' || r.kind === kind) && (!q || normalizeForSearch(this.productName(r.productId)).includes(q))
    );
  });
  pagination = createPagination(this.rows);

  productName(productId: string): string {
    return this.names().get(productId) ?? productId;
  }

  kindLabelKey(kind: JournalKind): string {
    return kind === 'sale' ? 'stock.typeSale' : kind === 'return' ? 'stock.typeReturn' : `stock.type${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
  }

  setKind(kind: KindFilter) {
    this.kind.set(kind);
    this.pagination.reset();
  }

  setQuery(value: string) {
    this.query.set(value);
    this.pagination.reset();
  }
}

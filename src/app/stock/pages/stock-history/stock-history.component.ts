import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatPaginatorModule } from '@angular/material/paginator';
import { StockEntry, StockMovementType, StockService } from '../../../core/services/stock.service';
import { ProductService } from '../../../core/services/product.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';
import { createPagination } from '../../../core/utils/pagination';

@Component({
  selector: 'app-stock-history',
  standalone: true,
  imports: [CommonModule, TranslatePipe, TranslateModule, SumPipe, MatCardModule, MatPaginatorModule],
  templateUrl: './stock-history.component.html',
  styleUrl: './stock-history.component.css'
})
export class StockHistoryComponent {
  private stockService = inject(StockService);
  private productService = inject(ProductService);

  stockEntries = toSignal(this.stockService.getStockEntries(), { initialValue: [] });
  products = toSignal(this.productService.getProducts(), { initialValue: [] });
  pagination = createPagination(this.stockEntries);

  productName(productId: string): string {
    return this.products().find((p) => p.id === productId)?.name ?? productId;
  }

  typeLabelKey(type: StockMovementType): string {
    return `stock.type${type.charAt(0).toUpperCase()}${type.slice(1)}`;
  }

  reasonLabelKey(reason: string | undefined): string | null {
    return reason ? `stock.reason${reason.charAt(0).toUpperCase()}${reason.slice(1)}` : null;
  }

  quantityChange(entry: StockEntry): number {
    return entry.newQuantity - entry.previousQuantity;
  }
}

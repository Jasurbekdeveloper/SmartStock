import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Product, ProductService } from '../../../core/services/product.service';
import { StockService } from '../../../core/services/stock.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';

@Component({
  selector: 'app-stock-in',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, TranslateModule, SumPipe],
  templateUrl: './stock-in.component.html',
  styleUrl: './stock-in.component.css'
})
export class StockInComponent {
  private stockService = inject(StockService);
  private productService = inject(ProductService);
  private router = inject(Router);

  products = toSignal(this.productService.getProducts(), { initialValue: [] });

  productId = '';
  quantity: number | null = null;
  supplier = '';
  costPrice: number | null = null;

  submitting = signal(false);
  errorKey = signal<string | null>(null);

  selectedProduct(): Product | undefined {
    return this.products().find((p) => p.id === this.productId);
  }

  addStock() {
    const product = this.selectedProduct();
    if (!product || !this.quantity || this.quantity <= 0) {
      this.errorKey.set('stock.selectProductAndQuantity');
      return;
    }

    this.submitting.set(true);
    this.errorKey.set(null);

    this.stockService
      .stockIn({
        productId: product.id,
        quantity: this.quantity,
        currentQuantity: product.quantity,
        supplier: this.supplier,
        costPrice: this.costPrice || 0
      })
      .subscribe({
        next: () => {
          this.router.navigate(['/stock/history']);
        },
        error: (err) => {
          console.error('Stock in error:', err);
          this.errorKey.set('messages.error');
          this.submitting.set(false);
        }
      });
  }
}

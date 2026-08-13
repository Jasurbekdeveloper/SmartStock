import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { Product, ProductService } from '../../../core/services/product.service';
import { StockService } from '../../../core/services/stock.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';

@Component({
  selector: 'app-stock-in',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslatePipe,
    TranslateModule,
    SumPipe,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule
  ],
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
  sellingPrice: number | null = null;

  submitting = signal(false);
  errorKey = signal<string | null>(null);

  selectedProduct(): Product | undefined {
    return this.products().find((p) => p.id === this.productId);
  }

  /** Prefills the current cost/selling price so the admin only edits what actually changed. */
  onProductSelected(productId: string) {
    const product = this.products().find((p) => p.id === productId);
    if (!product) return;
    this.costPrice = product.cost;
    this.sellingPrice = product.price;
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
        costPrice: this.costPrice ?? 0,
        sellingPrice: this.sellingPrice ?? product.price
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

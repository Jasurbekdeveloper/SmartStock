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
  selector: 'app-stock-adjustment',
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
  templateUrl: './stock-adjustment.component.html',
  styleUrl: './stock-adjustment.component.css'
})
export class StockAdjustmentComponent {
  private stockService = inject(StockService);
  private productService = inject(ProductService);
  private router = inject(Router);

  products = toSignal(this.productService.getProducts(), { initialValue: [] });

  productId = '';
  countedQuantity: number | null = null;
  notes = '';

  submitting = signal(false);
  errorKey = signal<string | null>(null);

  selectedProduct(): Product | undefined {
    return this.products().find((p) => p.id === this.productId);
  }

  difference(): number | null {
    const product = this.selectedProduct();
    if (!product || this.countedQuantity === null) return null;
    return this.countedQuantity - product.quantity;
  }

  submitAdjustment() {
    const product = this.selectedProduct();
    if (!product || this.countedQuantity === null || this.countedQuantity < 0) {
      this.errorKey.set('stock.selectProductAndQuantity');
      return;
    }

    this.submitting.set(true);
    this.errorKey.set(null);

    this.stockService
      .adjustStock({
        productId: product.id,
        countedQuantity: this.countedQuantity,
        currentQuantity: product.quantity,
        notes: this.notes || undefined
      })
      .subscribe({
        next: () => {
          this.router.navigate(['/stock/history']);
        },
        error: (err) => {
          console.error('Stock adjustment error:', err);
          this.errorKey.set('messages.error');
          this.submitting.set(false);
        }
      });
  }
}

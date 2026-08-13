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

export type StockOutReason = 'damaged' | 'lost' | 'returned' | 'other';

@Component({
  selector: 'app-stock-out',
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
  templateUrl: './stock-out.component.html',
  styleUrl: './stock-out.component.css'
})
export class StockOutComponent {
  private stockService = inject(StockService);
  private productService = inject(ProductService);
  private router = inject(Router);

  products = toSignal(this.productService.getProducts(), { initialValue: [] });

  readonly reasons: StockOutReason[] = ['damaged', 'lost', 'returned', 'other'];

  productId = '';
  quantity: number | null = null;
  reason: StockOutReason = 'damaged';
  notes = '';

  submitting = signal(false);
  errorKey = signal<string | null>(null);

  selectedProduct(): Product | undefined {
    return this.products().find((p) => p.id === this.productId);
  }

  reasonLabelKey(reason: StockOutReason): string {
    return `stock.reason${reason.charAt(0).toUpperCase()}${reason.slice(1)}`;
  }

  removeStock() {
    const product = this.selectedProduct();
    if (!product || !this.quantity || this.quantity <= 0) {
      this.errorKey.set('stock.selectProductAndQuantity');
      return;
    }

    if (this.quantity > product.quantity) {
      this.errorKey.set('stock.insufficientQuantity');
      return;
    }

    this.submitting.set(true);
    this.errorKey.set(null);

    this.stockService
      .stockOut({
        productId: product.id,
        quantity: this.quantity,
        currentQuantity: product.quantity,
        reason: this.reason,
        notes: this.notes || undefined
      })
      .subscribe({
        next: () => {
          this.router.navigate(['/stock/history']);
        },
        error: (err) => {
          console.error('Stock out error:', err);
          this.errorKey.set('messages.error');
          this.submitting.set(false);
        }
      });
  }
}

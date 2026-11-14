import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
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
import { NumericInputDirective } from '../../../shared/directives/numeric-input.directive';
import { ProductPickerComponent } from '../../../shared/components/product-picker/product-picker.component';

export type StockOutReason = 'damaged' | 'expired' | 'lost' | 'supplierReturn' | 'returned' | 'other';

@Component({
  selector: 'app-stock-out',
  standalone: true,
  imports: [NumericInputDirective, ProductPickerComponent, 
    CommonModule,
    FormsModule,
    TranslatePipe,
    TranslateModule,
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
  private toast = inject(ToastService);
  private translation = inject(TranslationService);

  products = toSignal(this.productService.getProducts(), { initialValue: [] });

  readonly reasons: StockOutReason[] = ['damaged', 'expired', 'lost', 'supplierReturn', 'returned', 'other'];

  /** Signal, not a field: the picker sets it from an event and the page is zoneless. */
  productId = signal('');
  private qtyInput = viewChild<ElementRef<HTMLInputElement>>('qtyInput');
  quantity: number | null = null;
  reason: StockOutReason = 'damaged';
  notes = '';

  submitting = signal(false);
  errorKey = signal<string | null>(null);

  selectedProduct(): Product | undefined {
    return this.products().find((p) => p.id === this.productId());
  }

  onPick(product: Product | null) {
    this.productId.set(product?.id ?? '');
    this.errorKey.set(null);
    if (product) setTimeout(() => this.qtyInput()?.nativeElement.focus());
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

    if (this.submitting()) return;
    this.submitting.set(true);
    this.errorKey.set(null);

    this.stockService
      .stockOut({
        productId: product.id,
        quantity: this.quantity,
        currentQuantity: product.quantity,
        reason: this.reason,
        notes: this.notes || undefined,
        unitCost: product.cost
      })
      .subscribe({
        // Stay on the form for the next item: confirm, and clear it so it can't be sent twice.
        next: () => {
          this.toast.success(`${product.name}: ${this.translation.translate('stock.stockOutSaved')}`);
          this.productId.set('');
          this.quantity = null;
          this.notes = '';
          this.errorKey.set(null);
          this.submitting.set(false);
        },
        error: (err) => {
          console.error('Stock out error:', err);
          this.errorKey.set('messages.error');
          this.submitting.set(false);
        }
      });
  }
}

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
import { SumPipe } from '../../../core/pipes/sum.pipe';
import { NumericInputDirective } from '../../../shared/directives/numeric-input.directive';
import { ProductPickerComponent } from '../../../shared/components/product-picker/product-picker.component';

@Component({
  selector: 'app-stock-adjustment',
  standalone: true,
  imports: [NumericInputDirective, ProductPickerComponent, 
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
  private toast = inject(ToastService);
  private translation = inject(TranslationService);

  products = toSignal(this.productService.getProducts(), { initialValue: [] });

  /** Signal, not a field: the picker sets it from an event and the page is zoneless. */
  productId = signal('');
  private qtyInput = viewChild<ElementRef<HTMLInputElement>>('qtyInput');
  countedQuantity: number | null = null;
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

    if (this.submitting()) return;
    this.submitting.set(true);
    this.errorKey.set(null);

    this.stockService
      .adjustStock({
        productId: product.id,
        countedQuantity: this.countedQuantity,
        currentQuantity: product.quantity,
        notes: this.notes || undefined,
        unitCost: product.cost
      })
      .subscribe({
        // Next product of the count: confirm and clear the form.
        next: () => {
          this.toast.success(`${product.name}: ${this.translation.translate('stock.adjustmentSaved')}`);
          this.productId.set('');
          this.countedQuantity = null;
          this.notes = '';
          this.errorKey.set(null);
          this.submitting.set(false);
        },
        error: (err) => {
          console.error('Stock adjustment error:', err);
          this.errorKey.set('messages.error');
          this.submitting.set(false);
        }
      });
  }
}

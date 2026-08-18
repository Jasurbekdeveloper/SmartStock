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
import { SupplierService } from '../../../core/services/supplier.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';

/** Special mat-select value that reveals the free-text fallback input, for
 *  one-off suppliers that aren't worth adding to the catalog. */
export const MANUAL_SUPPLIER_OPTION = '__manual__';

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
  private supplierService = inject(SupplierService);
  private router = inject(Router);

  readonly manualSupplierOption = MANUAL_SUPPLIER_OPTION;

  products = toSignal(this.productService.getProducts(), { initialValue: [] });
  suppliers = toSignal(this.supplierService.getSuppliers(), { initialValue: [] });

  productId = '';
  quantity: number | null = null;
  /** Bound to the mat-select: either a `suppliers/{id}`, or the manual-entry sentinel. */
  supplierId: string = MANUAL_SUPPLIER_OPTION;
  /** Free-text fallback, used when `supplierId` is the manual sentinel (or no
   *  suppliers exist yet) — keeps one-off suppliers from requiring a catalog entry. */
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

  /** Resolves the mat-select state into what `stockIn()` needs: a catalog
   *  `supplierId` + its name when a real supplier was picked, or just the
   *  free-typed name (no id) for the manual fallback / one-off suppliers. */
  private resolveSupplier(): { supplierId?: string; supplierName: string } {
    if (this.supplierId !== MANUAL_SUPPLIER_OPTION) {
      const supplier = this.suppliers().find((s) => s.id === this.supplierId);
      if (supplier) {
        return { supplierId: supplier.id, supplierName: supplier.name };
      }
    }
    return { supplierId: undefined, supplierName: this.supplier };
  }

  addStock() {
    const product = this.selectedProduct();
    if (!product || !this.quantity || this.quantity <= 0) {
      this.errorKey.set('stock.selectProductAndQuantity');
      return;
    }

    this.submitting.set(true);
    this.errorKey.set(null);

    const { supplierId, supplierName } = this.resolveSupplier();

    this.stockService
      .stockIn({
        productId: product.id,
        quantity: this.quantity,
        currentQuantity: product.quantity,
        supplier: supplierName,
        supplierId,
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

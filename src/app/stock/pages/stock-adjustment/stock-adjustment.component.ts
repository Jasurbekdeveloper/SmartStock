import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Product, ProductService } from '../../../core/services/product.service';
import { StockService } from '../../../core/services/stock.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';
import { PRODUCT_UNITS } from '../../../core/constants/units';
import { roundMoney } from '../../../core/utils/pos-math';
import { ProductPickerComponent } from '../../../shared/components/product-picker/product-picker.component';

interface CountRow {
  product: Product;
  counted: number | null;
}

/**
 * Inventory count document: scan the goods on a shelf (every scan of the same product
 * adds one to its count) or type the counted quantity. Only the listed products are
 * changed; the rest of the catalogue is left as it is.
 */
@Component({
  selector: 'app-stock-adjustment',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, TranslatePipe, SumPipe, CurrencyDisplayPipe, ProductPickerComponent],
  templateUrl: './stock-adjustment.component.html',
  styleUrl: './stock-adjustment.component.css'
})
export class StockAdjustmentComponent {
  private stockService = inject(StockService);
  private productService = inject(ProductService);
  private toast = inject(ToastService);
  private translation = inject(TranslationService);

  products = toSignal(this.productService.getProducts(), { initialValue: [] as Product[] });
  private byId = computed(() => new Map(this.products().map((p) => [p.id, p])));

  rows = signal<CountRow[]>([]);
  notes = signal('');
  saving = signal(false);

  unitLabel(unit: string | undefined): string {
    if (!unit) return '';
    return (PRODUCT_UNITS as readonly string[]).includes(unit) ? this.translation.translate('units.' + unit) : unit;
  }

  current(row: CountRow): Product {
    return this.byId().get(row.product.id) ?? row.product;
  }

  difference(row: CountRow): number | null {
    return row.counted === null ? null : Math.round((Number(row.counted) - this.current(row).quantity) * 1000) / 1000;
  }

  /** Shortage (−) or surplus (+) of all lines, at cost. */
  valueDifference = computed(() =>
    roundMoney(this.rows().reduce((s, r) => s + (this.difference(r) ?? 0) * (this.current(r).cost || 0), 0))
  );

  /** A scan adds one to the count, so a shelf can be counted by scanning every item. */
  add(product: Product | null) {
    if (!product) return;
    const existing = this.rows().find((r) => r.product.id === product.id);
    if (existing) {
      this.patch(product.id, { counted: (Number(existing.counted) || 0) + 1 });
      return;
    }
    this.rows.update((rows) => [{ product, counted: 1 }, ...rows]);
  }

  patch(productId: string, changes: Partial<CountRow>) {
    this.rows.update((rows) => rows.map((r) => (r.product.id === productId ? { ...r, ...changes } : r)));
  }

  setCounted(productId: string, value: string) {
    this.patch(productId, { counted: value === '' ? null : Math.max(0, Number(value) || 0) });
  }

  remove(productId: string) {
    this.rows.update((rows) => rows.filter((r) => r.product.id !== productId));
  }

  canSave = computed(() => !this.saving() && this.rows().some((r) => r.counted !== null));

  async save() {
    if (!this.canSave()) return;
    this.saving.set(true);
    const failed: CountRow[] = [];
    let done = 0;
    for (const row of this.rows()) {
      if (row.counted === null) {
        failed.push(row);
        continue;
      }
      const product = this.current(row);
      try {
        await firstValueFrom(
          this.stockService.adjustStock({
            productId: product.id,
            countedQuantity: Number(row.counted),
            currentQuantity: product.quantity,
            notes: this.notes().trim() || undefined,
            unitCost: product.cost
          })
        );
        done++;
      } catch (err) {
        console.error('Inventory line failed:', product.name, err);
        failed.push(row);
      }
    }
    this.rows.set(failed);
    if (failed.length === 0) this.notes.set('');
    this.saving.set(false);
    if (done > 0) this.toast.success(`${done} — ${this.translation.translate('stock.adjustmentSaved')}`);
    const errors = failed.filter((r) => r.counted !== null);
    if (errors.length > 0) this.toast.error(`${this.translation.translate('messages.error')}: ${errors.map((r) => r.product.name).join(', ')}`);
  }
}

import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Product, ProductService } from '../../../core/services/product.service';
import { NON_LOSS_OUT_REASONS, StockService } from '../../../core/services/stock.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';
import { PRODUCT_UNITS } from '../../../core/constants/units';
import { roundMoney } from '../../../core/utils/pos-math';
import { ProductPickerComponent } from '../../../shared/components/product-picker/product-picker.component';

export type StockOutReason = 'damaged' | 'expired' | 'lost' | 'supplierReturn' | 'returned' | 'other';

interface OutRow {
  product: Product;
  quantity: number | null;
  reason: StockOutReason;
}

/**
 * Stock-out document (write-off / return to supplier): many lines at once, added by
 * scanning or searching like a delivery on the Kirim page. Each line is saved as its
 * own stock movement; lines that fail stay on the form.
 */
@Component({
  selector: 'app-stock-out',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, TranslatePipe, SumPipe, CurrencyDisplayPipe, ProductPickerComponent],
  templateUrl: './stock-out.component.html',
  styleUrl: './stock-out.component.css'
})
export class StockOutComponent {
  private stockService = inject(StockService);
  private productService = inject(ProductService);
  private toast = inject(ToastService);
  private translation = inject(TranslationService);

  products = toSignal(this.productService.getProducts(), { initialValue: [] as Product[] });
  private byId = computed(() => new Map(this.products().map((p) => [p.id, p])));

  readonly reasons: StockOutReason[] = ['damaged', 'expired', 'lost', 'supplierReturn', 'returned', 'other'];

  rows = signal<OutRow[]>([]);
  /** Reason given to newly added lines; each line can still be changed. */
  docReason = signal<StockOutReason>('damaged');
  notes = signal('');
  saving = signal(false);

  /** Cost of what is lost (returns to a supplier are not a loss). */
  lossTotal = computed(() =>
    roundMoney(
      this.rows().reduce(
        (s, r) => s + (NON_LOSS_OUT_REASONS.includes(r.reason) ? 0 : (Number(r.quantity) || 0) * (this.current(r).cost || 0)),
        0
      )
    )
  );

  reasonLabelKey(reason: StockOutReason): string {
    return `stock.reason${reason.charAt(0).toUpperCase()}${reason.slice(1)}`;
  }

  unitLabel(unit: string | undefined): string {
    if (!unit) return '';
    return (PRODUCT_UNITS as readonly string[]).includes(unit) ? this.translation.translate('units.' + unit) : unit;
  }

  /** The product as it is now (stock may have changed since the line was added). */
  current(row: OutRow): Product {
    return this.byId().get(row.product.id) ?? row.product;
  }

  tooMuch(row: OutRow): boolean {
    return (Number(row.quantity) || 0) > this.current(row).quantity;
  }

  add(product: Product | null) {
    if (!product) return;
    const existing = this.rows().find((r) => r.product.id === product.id);
    if (existing) {
      this.patch(product.id, { quantity: (Number(existing.quantity) || 0) + 1 });
      return;
    }
    this.rows.update((rows) => [...rows, { product, quantity: 1, reason: this.docReason() }]);
  }

  patch(productId: string, changes: Partial<OutRow>) {
    this.rows.update((rows) => rows.map((r) => (r.product.id === productId ? { ...r, ...changes } : r)));
  }

  remove(productId: string) {
    this.rows.update((rows) => rows.filter((r) => r.product.id !== productId));
  }

  canSave = computed(
    () => !this.saving() && this.rows().length > 0 && this.rows().every((r) => (Number(r.quantity) || 0) > 0 && !this.tooMuch(r))
  );

  async save() {
    if (!this.canSave()) {
      this.toast.error(this.translation.translate('stock.selectProductAndQuantity'));
      return;
    }
    this.saving.set(true);
    const failed: OutRow[] = [];
    let done = 0;
    for (const row of this.rows()) {
      const product = this.current(row);
      try {
        await firstValueFrom(
          this.stockService.stockOut({
            productId: product.id,
            quantity: Number(row.quantity),
            currentQuantity: product.quantity,
            reason: row.reason,
            notes: this.notes().trim() || undefined,
            unitCost: product.cost
          })
        );
        done++;
      } catch (err) {
        console.error('Stock out line failed:', product.name, err);
        failed.push(row);
      }
    }
    this.rows.set(failed);
    if (failed.length === 0) this.notes.set('');
    this.saving.set(false);
    if (done > 0) this.toast.success(`${done} — ${this.translation.translate('stock.stockOutSaved')}`);
    if (failed.length > 0) this.toast.error(`${this.translation.translate('messages.error')}: ${failed.map((r) => r.product.name).join(', ')}`);
  }
}

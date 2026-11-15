import { Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { Product } from '../../../core/services/product.service';
import { TranslationService } from '../../../core/services/translation.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';
import { PRODUCT_UNITS } from '../../../core/constants/units';
import { findByCode, searchProducts } from '../../../core/utils/product-search';

/**
 * Finds one product by name, barcode or SKU — typed, scanned with a USB scanner
 * (it types the code and Enter) or read with the camera. Used where a single product
 * is picked: stock out, inventory count.
 */
@Component({
  selector: 'app-product-picker',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, TranslatePipe, SumPipe],
  templateUrl: './product-picker.component.html',
  styleUrl: './product-picker.component.css'
})
export class ProductPickerComponent {
  private dialog = inject(MatDialog);
  private translation = inject(TranslationService);

  products = input.required<Product[]>();
  selected = input<Product | undefined>(undefined);
  /** The chosen product, or null when the choice is cleared. */
  picked = output<Product | null>();

  private searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  query = signal('');
  active = signal(0);
  matches = computed(() => searchProducts(this.products(), this.query()));
  notFound = signal(false);

  unitLabel(unit: string | undefined): string {
    if (!unit) return '';
    return (PRODUCT_UNITS as readonly string[]).includes(unit) ? this.translation.translate('units.' + unit) : unit;
  }

  onInput(value: string) {
    this.query.set(value);
    this.active.set(0);
    this.notFound.set(false);
  }

  /** Enter: an exact barcode/SKU wins (scanner), else the highlighted match. */
  onEnter() {
    const exact = findByCode(this.products(), this.query());
    const pick = exact ?? this.matches()[this.active()];
    if (pick) this.choose(pick);
    else if (this.query().trim()) this.notFound.set(true);
  }

  move(step: number) {
    const n = this.matches().length;
    if (n) this.active.set((this.active() + step + n) % n);
  }

  choose(p: Product) {
    this.query.set('');
    // A scanner types the code and Enter faster than Angular redraws, so the [value]
    // binding never sees a change to clear: empty the box directly.
    const el = this.searchInput()?.nativeElement;
    if (el) el.value = '';
    this.notFound.set(false);
    this.picked.emit(p);
  }

  clear() {
    this.picked.emit(null);
    setTimeout(() => this.searchInput()?.nativeElement.focus());
  }

  async scan() {
    const { BarcodeScannerDialogComponent } = await import('../barcode-scanner-dialog/barcode-scanner-dialog.component');
    this.dialog
      .open(BarcodeScannerDialogComponent, { width: '420px' })
      .afterClosed()
      .subscribe((code: string | undefined) => {
        if (!code) return;
        this.query.set(code);
        this.onEnter();
      });
  }
}

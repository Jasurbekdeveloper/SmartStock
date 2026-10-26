import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { Product, ProductService } from '../../../core/services/product.service';
import { CategoryService } from '../../../core/services/category.service';
import { StockService } from '../../../core/services/stock.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';
import { PRODUCT_UNITS } from '../../../core/constants/units';
import { generateStoreBarcode } from '../../../core/utils/product-identifiers';
import { suggestSearchKeywords } from '../../../core/utils/search-keywords';
import { priceMargin } from '../../../core/utils/price-margin';
import { fromDateInput } from '../../../core/utils/product-extras';
import { roundMoney } from '../../../core/utils/pos-math';
import { NumericInputDirective } from '../../../shared/directives/numeric-input.directive';

interface LogRow {
  at: Date;
  kind: 'new' | 'restock';
  name: string;
  quantity: number;
  unit: string;
  cost: number;
  price: number;
}

const STICKY_KEY = 'smartstock_quick_entry';

/**
 * Scanner-first data entry: scan a barcode, and either restock the product it belongs
 * to or create it on the spot — Enter moves on, the barcode field takes focus again.
 * Built for receiving a delivery with a scanner gun in one hand.
 */
@Component({
  selector: 'app-product-quick',
  standalone: true,
  imports: [NumericInputDirective, CommonModule, FormsModule, RouterModule, MatButtonModule, MatIconModule, MatTooltipModule, TranslatePipe, CurrencyDisplayPipe, SumPipe],
  templateUrl: './product-quick.component.html',
  styleUrl: './product-quick.component.css'
})
export class ProductQuickComponent {
  private productService = inject(ProductService);
  private stockService = inject(StockService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private translation = inject(TranslationService);
  private dialog = inject(MatDialog);

  readonly units = PRODUCT_UNITS;
  categories = toSignal(inject(CategoryService).getCategories(), { initialValue: [] });
  products = toSignal(this.productService.getProducts(), { initialValue: [] as Product[] });
  canSeeCost = computed(() => this.authService.can('products.viewCost'));

  private barcodeInput = viewChild<ElementRef<HTMLInputElement>>('barcodeInput');
  private nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private qtyInput = viewChild<ElementRef<HTMLInputElement>>('qtyInput');

  barcode = signal('');
  /** Product the scanned code belongs to (restock mode), null = new product, undefined = nothing scanned yet. */
  match = signal<Product | null | undefined>(undefined);

  name = signal('');
  categoryId = signal('');
  unit = signal<string>('dona');
  cost = signal<number | null>(null);
  price = signal<number | null>(null);
  wholesalePrice = signal<number | null>(null);
  quantity = signal<number | null>(null);
  expiryDate = signal('');
  manufactureDate = signal('');

  /** New product: dated when the category tracks expiry or a date was typed. */
  newTracked = computed(() => !!this.categories().find((c) => c.id === this.categoryId())?.trackExpiry || !!this.expiryDate());

  saving = signal(false);
  log = signal<LogRow[]>([]);

  margin = computed(() => priceMargin(this.cost(), this.price()));

  summary = computed(() => {
    const rows = this.log();
    return {
      created: rows.filter((r) => r.kind === 'new').length,
      restocked: rows.filter((r) => r.kind === 'restock').length,
      costValue: roundMoney(rows.reduce((s, r) => s + r.cost * r.quantity, 0)),
      retailValue: roundMoney(rows.reduce((s, r) => s + r.price * r.quantity, 0))
    };
  });

  constructor() {
    try {
      const sticky = JSON.parse(localStorage.getItem(STICKY_KEY) ?? '{}');
      if (sticky.categoryId) this.categoryId.set(sticky.categoryId);
      if (sticky.unit) this.unit.set(sticky.unit);
    } catch {
      /* no saved defaults */
    }
  }

  unitLabel(unit: string | undefined): string {
    if (!unit) return '';
    return (PRODUCT_UNITS as readonly string[]).includes(unit) ? this.translation.translate('units.' + unit) : unit;
  }

  /** Enter in the barcode field: look the code up and switch to restock or create. */
  lookup() {
    const code = this.barcode().trim();
    if (!code) return;
    const found = this.products().find((p) => p.barcode === code || p.sku === code) ?? null;
    this.match.set(found);
    this.quantity.set(null);
    if (found) {
      this.cost.set(found.cost || null);
      this.price.set(found.price || null);
      this.expiryDate.set('');
      this.manufactureDate.set('');
      setTimeout(() => this.qtyInput()?.nativeElement.focus());
    } else {
      this.name.set('');
      this.cost.set(null);
      this.price.set(null);
      this.wholesalePrice.set(null);
      this.expiryDate.set('');
      this.manufactureDate.set('');
      setTimeout(() => this.nameInput()?.nativeElement.focus());
    }
  }

  async generate() {
    const code = generateStoreBarcode(this.products().flatMap((p) => [p.barcode, p.sku ?? '']));
    this.barcode.set(code);
    this.lookup();
  }

  async scan() {
    const { BarcodeScannerDialogComponent } = await import(
      '../../../shared/components/barcode-scanner-dialog/barcode-scanner-dialog.component'
    );
    this.dialog
      .open(BarcodeScannerDialogComponent, { width: '420px' })
      .afterClosed()
      .subscribe((code: string | undefined) => {
        if (code) {
          this.barcode.set(code);
          this.lookup();
        }
      });
  }

  reset() {
    this.barcode.set('');
    this.match.set(undefined);
    this.quantity.set(null);
    setTimeout(() => this.barcodeInput()?.nativeElement.focus());
  }

  canSave = computed(() => {
    const m = this.match();
    const qty = Number(this.quantity() ?? 0);
    const price = Number(this.price() ?? 0);
    if (m === undefined || this.saving()) return false;
    if (m) return qty > 0 && (!m.trackExpiry || !!this.expiryDate());
    if (this.newTracked() && qty > 0 && !this.expiryDate()) return false;
    return !!this.name().trim() && price > 0 && qty >= 0 && (!this.canSeeCost() || Number(this.cost() ?? 0) > 0);
  });

  async save() {
    if (!this.canSave()) return;
    const m = this.match();
    this.saving.set(true);
    try {
      if (m) await this.restock(m);
      else await this.create();
      this.reset();
    } catch (err) {
      console.error('Quick entry save error:', err);
      this.toast.error(
        this.translation.translate((err as Error)?.message === 'PRODUCT_LIMIT_REACHED' ? 'subscription.productLimitReached' : 'messages.error')
      );
    } finally {
      this.saving.set(false);
    }
  }

  private async restock(p: Product) {
    const quantity = Number(this.quantity());
    const cost = Number(this.cost() ?? p.cost) || p.cost;
    const price = Number(this.price() ?? p.price) || p.price;
    await firstValueFrom(
      this.stockService.stockIn({
        productId: p.id,
        quantity,
        currentQuantity: p.quantity,
        supplier: '',
        costPrice: cost,
        currentCost: p.cost,
        sellingPrice: price,
        batch: p.trackExpiry
          ? { expiryDate: fromDateInput(this.expiryDate())!, manufactureDate: fromDateInput(this.manufactureDate()) }
          : undefined
      })
    );
    this.pushLog({ kind: 'restock', name: p.name, quantity, unit: p.unit, cost, price });
  }

  private async create() {
    const name = this.name().trim();
    const barcode = this.barcode().trim();
    const wholesale = Number(this.wholesalePrice() ?? 0);
    const quantity = Number(this.quantity() ?? 0);
    const product: Omit<Product, 'id'> = {
      name,
      barcode,
      sku: barcode,
      price: Number(this.price()),
      cost: Number(this.cost() ?? 0),
      quantity,
      unit: this.unit(),
      minQuantity: 0,
      categoryId: this.categoryId(),
      familyId: crypto.randomUUID(),
      searchKeywords: suggestSearchKeywords(name),
      wholesalePrice: wholesale > 0 ? wholesale : null,
      trackExpiry: this.newTracked(),
      expiryDate: null,
      mxikCode: null
    };
    const expiry = fromDateInput(this.expiryDate());
    const batch =
      expiry && quantity > 0
        ? { quantity, expiryDate: expiry, manufactureDate: fromDateInput(this.manufactureDate()), costPrice: product.cost || undefined }
        : undefined;
    await firstValueFrom(this.productService.addProducts([product], [batch]));
    try {
      localStorage.setItem(STICKY_KEY, JSON.stringify({ categoryId: this.categoryId(), unit: this.unit() }));
    } catch {
      /* storage unavailable */
    }
    this.pushLog({ kind: 'new', name, quantity, unit: product.unit, cost: product.cost, price: product.price });
  }

  private pushLog(row: Omit<LogRow, 'at'>) {
    this.log.update((rows) => [{ ...row, at: new Date() }, ...rows]);
    this.toast.success(`${row.name} — ${this.translation.translate(row.kind === 'new' ? 'products.saved' : 'quick.restocked')}`);
  }
}

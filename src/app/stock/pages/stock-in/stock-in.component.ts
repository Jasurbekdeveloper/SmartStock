import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, of } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Product, ProductService } from '../../../core/services/product.service';
import { MAX_RECEIVE_LINES, StockService } from '../../../core/services/stock.service';
import { SupplierService } from '../../../core/services/supplier.service';
import { ShiftService, isInsufficientCash } from '../../../core/services/shift.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';
import { fromDateInput, toDateInput } from '../../../core/utils/product-extras';
import { expiryFromShelfLife } from '../../../core/utils/batches';
import { findByCode, searchProducts } from '../../../core/utils/product-search';
import { nextBatchNo, shelfLifeFromBatches } from '../../../core/utils/batch-number';
import { BatchService } from '../../../core/services/batch.service';
import { roundMoney } from '../../../core/utils/pos-math';
import { NumericInputDirective } from '../../../shared/directives/numeric-input.directive';
import { MatDialog } from '@angular/material/dialog';
import { BarcodeLabelDialogComponent } from '../../../shared/components/barcode-label-dialog/barcode-label-dialog.component';

/** Special mat-select value that reveals the free-text fallback input, for
 *  one-off suppliers that aren't worth adding to the catalog. */
export const MANUAL_SUPPLIER_OPTION = '__manual__';

/** How the paid part is paid: from the till's cash, other cash (safe/owner), card or bank. */
export type ReceivePayment = 'drawer' | 'cash' | 'card' | 'bank';

interface ReceiveRow {
  product: Product;
  quantity: number | null;
  costPrice: number | null;
  sellingPrice: number | null;
  manufactureDate: string;
  expiryDate: string;
  batchNo: string;
  expiryTouched: boolean;
}

/**
 * Goods receipt (kirim hujjati / nakladnoy): one supplier delivery with many lines,
 * saved in one atomic write. A delivery not paid in full goes on the supplier's
 * account — stores rarely pay producers in cash on the spot.
 */
@Component({
  selector: 'app-stock-in',
  standalone: true,
  imports: [
    NumericInputDirective,
    CommonModule,
    FormsModule,
    RouterModule,
    TranslatePipe,
    TranslateModule,
    SumPipe,
    CurrencyDisplayPipe,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule
  ],
  templateUrl: './stock-in.component.html',
  styleUrl: './stock-in.component.css'
})
export class StockInComponent {
  private stockService = inject(StockService);
  private productService = inject(ProductService);
  private supplierService = inject(SupplierService);
  private toast = inject(ToastService);
  private translation = inject(TranslationService);
  private router = inject(Router);
  private auth = inject(AuthService);
  private dialog = inject(MatDialog);
  private batchService = inject(BatchService);

  readonly manualSupplierOption = MANUAL_SUPPLIER_OPTION;
  readonly maxLines = MAX_RECEIVE_LINES;

  products = toSignal(this.productService.getProducts(), { initialValue: [] as Product[] });
  suppliers = toSignal(this.supplierService.getSuppliers(), { initialValue: [] });
  private openShift = toSignal(
    inject(ShiftService).getOpenShiftForUser(this.auth.getCurrentUser()?.uid ?? '').pipe(catchError(() => of(undefined))),
    { initialValue: undefined }
  );

  supplierId = signal<string>(MANUAL_SUPPLIER_OPTION);
  supplierName = signal('');
  invoiceNo = signal('');
  rows = signal<ReceiveRow[]>([]);
  query = signal('');
  payment = signal<ReceivePayment>('bank');
  /** null = paid in full; 0 = all on credit; otherwise a partial payment. */
  paidNowInput = signal<number | null>(0);
  dueDate = signal('');
  note = signal('');

  submitting = signal(false);
  errorKey = signal<string | null>(null);

  selectedSupplier = computed(() => this.suppliers().find((s) => s.id === this.supplierId()));
  hasShift = computed(() => !!this.openShift());

  matches = computed(() => searchProducts(this.products(), this.query()));

  total = computed(() => roundMoney(this.rows().reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.costPrice) || 0), 0)));
  paidNow = computed(() => {
    const typed = this.paidNowInput();
    return typed === null ? this.total() : roundMoney(Math.min(Math.max(0, Number(typed) || 0), this.total()));
  });
  payMode = computed<'full' | 'credit' | 'partial'>(() => {
    const typed = this.paidNowInput();
    return typed === null ? 'full' : !(Number(typed) > 0) ? 'credit' : 'partial';
  });
  owed = computed(() => roundMoney(this.total() - this.paidNow()));

  unitLabel(unit: string | undefined): string {
    return unit ? this.translation.translate('units.' + unit) : '';
  }

  /** Enter in the search box: an exact barcode adds at once, else the first match. */
  addFromSearch() {
    const pick = findByCode(this.products(), this.query()) ?? this.matches()[0];
    if (pick) this.addProduct(pick);
  }

  /** Reads a barcode with the camera (phone / tablet without a scanner gun). */
  async scan() {
    const { BarcodeScannerDialogComponent } = await import(
      '../../../shared/components/barcode-scanner-dialog/barcode-scanner-dialog.component'
    );
    this.dialog
      .open(BarcodeScannerDialogComponent, { width: '420px' })
      .afterClosed()
      .subscribe((code: string | undefined) => {
        if (!code) return;
        this.query.set(code);
        this.addFromSearch();
      });
  }

  addProduct(product: Product) {
    this.query.set('');
    this.errorKey.set(null);
    const existing = this.rows().find((r) => r.product.id === product.id);
    if (existing) {
      this.patch(product.id, { quantity: (Number(existing.quantity) || 0) + 1 });
      return;
    }
    if (this.rows().length >= MAX_RECEIVE_LINES) {
      this.errorKey.set('stock.tooManyLines');
      return;
    }
    this.rows.update((rows) => [
      ...rows,
      {
        product,
        quantity: null,
        costPrice: product.cost || null,
        sellingPrice: product.price || null,
        manufactureDate: '',
        expiryDate: '',
        batchNo: '',
        expiryTouched: false
      }
    ]);
    if (product.trackExpiry) void this.prefillBatch(product);
  }

  /**
   * Dated goods: manufacture date today, best-before from the shelf life (the product's,
   * else the latest delivery's), batch number = arrival day + name ("151126-QURT",
   * "-2" for a second delivery the same day). Everything stays editable.
   */
  private async prefillBatch(product: Product) {
    const today = new Date();
    const batches = await this.loadBatches(product.id);
    const row = this.rows().find((r) => r.product.id === product.id);
    if (!row) return;
    const otherRows = this.rows().filter((r) => r !== row).map((r) => r.batchNo);
    const shelf = product.shelfLifeDays || shelfLifeFromBatches(batches);
    const changes: Partial<ReceiveRow> = {};
    if (!row.batchNo) changes.batchNo = nextBatchNo(product.name, today, [...batches.map((b) => b.batchNo), ...otherRows]);
    if (!row.manufactureDate) {
      changes.manufactureDate = toDateInput(today);
      const exp = !row.expiryDate ? expiryFromShelfLife(today, shelf) : null;
      if (exp) changes.expiryDate = toDateInput(exp);
    }
    this.patch(product.id, changes);
  }

  private async loadBatches(productId: string) {
    try {
      return await firstValueFrom(this.batchService.getBatchesForProduct(productId));
    } catch (err) {
      console.error('Stock in: batches not loaded', err);
      return [];
    }
  }

  remove(productId: string) {
    this.rows.update((rows) => rows.filter((r) => r.product.id !== productId));
  }

  patch(productId: string, changes: Partial<ReceiveRow>) {
    this.rows.update((rows) => rows.map((r) => (r.product.id === productId ? { ...r, ...changes } : r)));
  }

  onManufacture(row: ReceiveRow, value: string) {
    const changes: Partial<ReceiveRow> = { manufactureDate: value };
    if (!(row.expiryTouched && row.expiryDate)) {
      const exp = expiryFromShelfLife(fromDateInput(value), row.product.shelfLifeDays);
      if (exp) changes.expiryDate = toDateInput(exp);
    }
    this.patch(row.product.id, changes);
  }

  /** Price stickers for the delivery: one per received unit (whole units), new price if changed. */
  printLabels() {
    const items = this.rows().map((r) => ({
      name: r.product.name,
      barcode: r.product.barcode || r.product.sku || '',
      price: Number(r.sellingPrice) || r.product.price,
      unit: this.unitLabel(r.product.unit) || null,
      copies: Math.max(1, Math.ceil(Number(r.quantity) || 1))
    }));
    this.dialog.open(BarcodeLabelDialogComponent, { data: { items }, maxWidth: '96vw' });
  }

  lineTotal(r: ReceiveRow): number {
    return roundMoney((Number(r.quantity) || 0) * (Number(r.costPrice) || 0));
  }

  marginWarning(r: ReceiveRow): boolean {
    return (Number(r.sellingPrice) || 0) > 0 && (Number(r.sellingPrice) || 0) < (Number(r.costPrice) || 0);
  }

  setPayMode(mode: 'full' | 'credit' | 'partial') {
    this.paidNowInput.set(mode === 'full' ? null : mode === 'credit' ? 0 : Math.round(this.total() / 2));
  }

  private validate(): string | null {
    const rows = this.rows();
    if (rows.length === 0) return 'stock.addLines';
    for (const r of rows) {
      if (!(Number(r.quantity) > 0)) return 'stock.selectProductAndQuantity';
      if (r.product.trackExpiry) {
        const exp = fromDateInput(r.expiryDate);
        if (!exp) return 'products.expiryRequired';
        const mfg = fromDateInput(r.manufactureDate);
        if (mfg && exp.getTime() < mfg.getTime()) return 'products.expiryBeforeManufacture';
      }
    }
    if (this.owed() > 0 && !this.selectedSupplier()) return 'stock.creditNeedsSupplier';
    if (this.payment() === 'drawer' && this.paidNow() > 0 && !this.hasShift()) return 'stock.drawerNeedsShift';
    return null;
  }

  save() {
    const error = this.validate();
    if (error) {
      this.errorKey.set(error);
      return;
    }
    this.submitting.set(true);
    this.errorKey.set(null);
    const supplier = this.selectedSupplier();
    const payment = this.payment();
    const method = payment === 'drawer' ? 'cash' : payment;

    this.stockService
      .receiveGoods({
        supplierId: supplier?.id,
        supplierName: supplier?.name ?? this.supplierName().trim(),
        invoiceNo: this.invoiceNo(),
        paidNow: this.paidNow(),
        method,
        drawerShiftId: payment === 'drawer' ? this.openShift()?.id : undefined,
        dueDate: this.owed() > 0 ? fromDateInput(this.dueDate()) : null,
        note: this.note(),
        lines: this.rows().map((r) => {
          const expiry = fromDateInput(r.expiryDate);
          return {
            productId: r.product.id,
            quantity: Number(r.quantity),
            currentQuantity: r.product.quantity,
            currentCost: r.product.cost,
            costPrice: Number(r.costPrice) || 0,
            sellingPrice: Number(r.sellingPrice) || r.product.price,
            batch:
              r.product.trackExpiry && expiry
                ? { expiryDate: expiry, manufactureDate: fromDateInput(r.manufactureDate), batchNo: r.batchNo }
                : undefined
          };
        })
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.toast.success(this.translation.translate('stock.receiptSaved'));
          this.router.navigate(supplier ? ['/suppliers', supplier.id] : ['/stock/history']);
        },
        error: (err) => {
          console.error('Receive goods error:', err);
          this.errorKey.set(isInsufficientCash(err) ? 'finance.insufficientCash' : 'messages.error');
          this.submitting.set(false);
        }
      });
  }
}

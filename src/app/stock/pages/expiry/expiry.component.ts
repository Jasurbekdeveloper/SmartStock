import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';
import { Product, ProductService } from '../../../core/services/product.service';
import { AuthService } from '../../../core/services/auth.service';
import { TranslationService } from '../../../core/services/translation.service';
import { ToastService } from '../../../core/services/toast.service';
import { BatchService, LEGACY_PREFIX } from '../../../core/services/batch.service';
import { PRODUCT_UNITS } from '../../../core/constants/units';
import { ExpiryState, daysUntilExpiry, expiryState } from '../../../core/utils/price-tier';
import { StockBatch } from '../../../core/utils/batches';
import { roundMoney } from '../../../core/utils/pos-math';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ExpiryDateDialogComponent, ExpiryDateDialogData } from '../../components/expiry-date-dialog/expiry-date-dialog.component';
import { formatNumber } from '../../../core/utils/format-number';

type ExpiryFilter = 'expired' | 'soon' | 'all';

export interface ExpiryRow {
  batch: StockBatch;
  product: Product;
  days: number;
  state: ExpiryState;
  /** Purchase cost of what is left in this batch. */
  value: number;
}

/**
 * Dated stock, one row per delivery (batch): what has expired, what expires soon,
 * and a one-click write-off that books the loss as an expense. Works the same for a
 * grocery (milk, meat), a household shop (detergent) or building materials (cement,
 * paint, sealant) — only products with expiry tracking appear here.
 */
@Component({
  selector: 'app-expiry',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule, MatTooltipModule, TranslatePipe, CurrencyDisplayPipe, SumPipe],
  templateUrl: './expiry.component.html'
})
export class ExpiryComponent {
  private translation = inject(TranslationService);
  private auth = inject(AuthService);
  private batchService = inject(BatchService);
  private toast = inject(ToastService);
  private dialog = inject(MatDialog);

  canSeeCost = computed(() => this.auth.can('products.viewCost'));
  canWriteOff = computed(() => this.auth.can('stock.manage'));
  products = toSignal(inject(ProductService).getProducts(), { initialValue: [] as Product[] });
  private batches = toSignal(this.batchService.getActiveBatches().pipe(catchError(() => of([] as StockBatch[]))), {
    initialValue: [] as StockBatch[]
  });

  warnDays = signal(30);
  filter = signal<ExpiryFilter>('soon');
  search = signal('');
  /** Batch ids being written off right now (button spinner, no double submit). */
  busy = signal<ReadonlySet<string>>(new Set());

  private tracked = computed<ExpiryRow[]>(() => {
    const byId = new Map(this.products().map((p) => [p.id, p]));
    const withBatches = new Set<string>();
    const rows: ExpiryRow[] = [];
    const warn = this.warnDays();

    const push = (batch: StockBatch, product: Product) =>
      rows.push({
        batch,
        product,
        days: daysUntilExpiry(batch.expiryDate) as number,
        state: expiryState(batch.expiryDate, warn),
        value: roundMoney(batch.quantity * (batch.costPrice ?? product.cost ?? 0))
      });

    for (const b of this.batches()) {
      const product = byId.get(b.productId);
      if (!product || b.quantity <= 0) continue;
      withBatches.add(product.id);
      push(b, product);
    }
    // Products dated the old way (one date on the product itself) until they are re-saved.
    for (const p of this.products()) {
      if (!p.expiryDate || withBatches.has(p.id) || p.quantity <= 0) continue;
      push(
        { id: LEGACY_PREFIX + p.id, productId: p.id, quantity: p.quantity, initialQuantity: p.quantity, expiryDate: p.expiryDate, batchNo: p.batchNo ?? null },
        p
      );
    }
    return rows.sort((a, b) => a.days - b.days);
  });

  private matching = computed(() => {
    const q = this.search().trim().toLocaleLowerCase();
    if (!q) return this.tracked();
    return this.tracked().filter(
      (r) =>
        r.product.name.toLocaleLowerCase().includes(q) ||
        r.product.barcode?.toLocaleLowerCase().includes(q) ||
        (r.batch.batchNo ?? '').toLocaleLowerCase().includes(q)
    );
  });

  expired = computed(() => this.matching().filter((r) => r.state === 'expired'));
  soon = computed(() => this.matching().filter((r) => r.state === 'soon'));

  rows = computed(() => {
    switch (this.filter()) {
      case 'expired':
        return this.expired();
      case 'soon':
        return [...this.expired(), ...this.soon()];
      default:
        return this.matching();
    }
  });

  private total = (rows: ExpiryRow[]) => roundMoney(rows.reduce((s, r) => s + r.value, 0));
  expiredValue = computed(() => this.total(this.expired()));
  soonValue = computed(() => this.total(this.soon()));
  trackedProducts = computed(() => new Set(this.tracked().map((r) => r.product.id)).size);

  unitLabel(unit: string | undefined): string {
    if (!unit) return '';
    return (PRODUCT_UNITS as readonly string[]).includes(unit) ? this.translation.translate('units.' + unit) : unit;
  }

  isLegacy(row: ExpiryRow): boolean {
    return row.batch.id.startsWith(LEGACY_PREFIX);
  }

  writeOff(row: ExpiryRow) {
    if (!this.canWriteOff() || this.busy().has(row.batch.id)) return;
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          titleKey: 'expiry.writeOff',
          messageKey: 'expiry.writeOffConfirm',
          detail: `${row.product.name} — ${row.batch.quantity} ${this.unitLabel(row.product.unit)}${
            this.canSeeCost() && row.value > 0 ? ` (${formatNumber(row.value, 0)})` : ''
          }`
        }
      })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.setBusy(row.batch.id, true);
        this.batchService
          .writeOff({
            batch: row.batch,
            productName: row.product.name,
            fallbackCost: row.product.cost || 0,
            currentQuantity: row.product.quantity
          })
          .subscribe({
            next: () => {
              this.setBusy(row.batch.id, false);
              this.toast.success(`${row.product.name} — ${this.translation.translate('expiry.writtenOff')}`);
            },
            error: (err) => {
              console.error('Write-off error:', err);
              this.setBusy(row.batch.id, false);
              this.toast.error(this.translation.translate('messages.error'));
            }
          });
      });
  }

  /** Extend (or correct) the best-before date of one batch on a calendar. */
  changeDate(row: ExpiryRow) {
    if (!this.canWriteOff() || this.busy().has(row.batch.id)) return;
    const data: ExpiryDateDialogData = {
      productName: row.product.name,
      expiryDate: row.batch.expiryDate,
      manufactureDate: row.batch.manufactureDate,
      detail: `${row.batch.batchNo ? '#' + row.batch.batchNo + ' · ' : ''}${formatNumber(row.batch.quantity)} ${this.unitLabel(row.product.unit)}`
    };
    this.dialog
      .open(ExpiryDateDialogComponent, { data, width: '380px', autoFocus: false })
      .afterClosed()
      .subscribe((date: Date | undefined) => {
        if (!date) return;
        this.setBusy(row.batch.id, true);
        this.batchService.updateExpiry(row.batch, date).subscribe({
          next: () => {
            this.setBusy(row.batch.id, false);
            this.toast.success(`${row.product.name} — ${this.translation.translate('expiry.dateChanged')}`);
          },
          error: (err) => {
            console.error('Change expiry error:', err);
            this.setBusy(row.batch.id, false);
            this.toast.error(this.translation.translate('messages.error'));
          }
        });
      });
  }

  private setBusy(id: string, on: boolean) {
    this.busy.update((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}

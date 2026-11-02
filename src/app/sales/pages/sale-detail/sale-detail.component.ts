import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Sale, SalesService, saleCardIn, saleCashIn } from '../../../core/services/sales.service';
import { DebtService } from '../../../core/services/debt.service';
import { AuthService } from '../../../core/services/auth.service';
import { Shift, ShiftService, insufficientCashMessage } from '../../../core/services/shift.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';
import { firstValueFrom, take } from 'rxjs';
import { FiscalReceipt, FiscalService } from '../../../core/services/fiscal.service';
import { ProductService } from '../../../core/services/product.service';
import { FiscalLineInput, buildVcrPositions, fiscalProblems, toTiyin } from '../../../core/utils/vcr-receipt';
import { SettingsService } from '../../../core/services/settings.service';
import { ReturnDialogComponent, ReturnDialogData, ReturnDialogResult } from '../../components/return-dialog/return-dialog.component';

@Component({
  selector: 'app-sale-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe, SumPipe, CurrencyDisplayPipe, MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './sale-detail.component.html',
  styleUrl: './sale-detail.component.css'
})
export class SaleDetailComponent {
  private salesService = inject(SalesService);
  private debtService = inject(DebtService);
  private authService = inject(AuthService);
  private shiftService = inject(ShiftService);
  private toast = inject(ToastService);
  private translation = inject(TranslationService);
  private dialog = inject(MatDialog);
  private fiscal = inject(FiscalService);
  private productService = inject(ProductService);
  private settingsService = inject(SettingsService);
  private route = inject(ActivatedRoute);

  private saleId = this.route.snapshot.paramMap.get('id') ?? '';

  sale = toSignal(this.salesService.getSaleById(this.saleId), { initialValue: undefined });
  returns = toSignal(this.salesService.getReturnsForSale(this.saleId), { initialValue: [] });
  customers = toSignal(this.debtService.getCustomers(), { initialValue: [] });
  private currentUser = toSignal(this.authService.currentUser$, { initialValue: null });

  cash = saleCashIn;
  card = saleCardIn;

  returnedQty = computed(() => {
    const map = new Map<string, number>();
    for (const r of this.returns()) {
      for (const item of r.items) map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantity);
    }
    return map;
  });

  canReturn = computed(() => {
    const sale = this.sale();
    if (!sale || !this.authService.can('sales.refund')) return false;
    // Mirrors firestore.rules: a cashier returns their own sales; roles that see every sale, any.
    if (!this.authService.can('sales.viewAll') && sale.cashierId !== this.currentUser()?.uid) return false;
    const returned = this.returnedQty();
    const soldByProduct = new Map<string, number>();
    for (const item of sale.items) soldByProduct.set(item.productId, (soldByProduct.get(item.productId) ?? 0) + item.quantity);
    return [...soldByProduct].some(([id, qty]) => qty > (returned.get(id) ?? 0));
  });

  customerName(customerId: string): string {
    return this.customers().find((c) => c.id === customerId)?.name ?? customerId;
  }

  printReceipt() {
    const sale = this.sale();
    if (!sale) return;
    // Separate route so the receipt's narrow @page print CSS stays isolated.
    window.open(`/sales/${sale.id}/receipt`, '_blank');
  }

  openReturnDialog() {
    const sale = this.sale();
    if (!sale) return;

    const data: ReturnDialogData = { sale, previousReturns: this.returns() };
    this.dialog
      .open(ReturnDialogComponent, { width: '560px', maxWidth: '96vw', data })
      .afterClosed()
      .subscribe((result: ReturnDialogResult | undefined) => {
        if (result) this.saveReturn(result);
      });
  }

  /**
   * Fiscal refund receipt for a sale that had a fiscal receipt: same MXIK / package as
   * the sale, the returned units' marking codes, and the money going back the way it is
   * actually paid out (cash or card).
   */
  private async fiscalRefund(sale: Sale, result: ReturnDialogResult): Promise<FiscalReceipt | undefined> {
    if (!this.fiscal.enabled() || !sale.fiscal?.qrCodeUrl) return undefined;
    const products = new Map((await firstValueFrom(this.productService.getProducts())).map((p) => [p.id, p]));
    const usedCodes = new Set(this.returns().flatMap((r) => r.items.flatMap((i) => i.markingCodes ?? [])));
    const lines: FiscalLineInput[] = result.items.map((item) => {
      const sold = sale.items.find((s) => s.productId === item.productId);
      const product = products.get(item.productId);
      const codes = (sold?.markingCodes ?? []).filter((c) => !usedCodes.has(c)).slice(0, Math.ceil(item.quantity));
      item.markingCodes = codes.length ? codes : undefined;
      return {
        productId: item.productId,
        name: item.productName,
        barcode: product?.barcode,
        mxikCode: product?.mxikCode,
        packageCode: product?.packageCode,
        unit: sold?.unit,
        quantity: item.quantity,
        paid: item.refund,
        discount: 0,
        markingCodes: codes.length ? codes : undefined
      };
    });
    const problems = fiscalProblems(lines);
    if (problems.length) throw new Error(`${problems[0].name}: ${this.translation.translate(problems[0].key)}`);
    const vatRate = this.settingsService.vatRate();
    const positions = buildVcrPositions(lines, vatRate);
    const total = positions.reduce((s, p) => s + p.amount - p.discount, 0);
    return this.fiscal.refund({
      code: `${sale.receiptNo ?? sale.id}-R${this.returns().length + 1}`,
      positions,
      payments: [{ type: result.refundMethod === 'card' ? 2 : 1, value: Math.min(total, toTiyin(result.refundAmount)) }],
      original: sale.fiscal,
      cashierName: this.currentUser()?.displayName
    });
  }

  private async saveReturn(result: ReturnDialogResult) {
    const sale = this.sale();
    const user = this.currentUser();
    if (!sale) return;

    // Refunds are booked on the shift of whoever gives the money back, so their
    // Z-report nets the cash out of the drawer — which must hold that much cash.
    let shift: Shift | undefined;
    try {
      shift = user ? await firstValueFrom(this.shiftService.getOpenShiftForUser(user.uid).pipe(take(1))) : undefined;
      if (shift && result.refundMethod === 'cash') await this.shiftService.ensureCash(shift.id, result.refundAmount);
    } catch (err) {
      console.error('Return cash check error:', err);
      this.toast.error(insufficientCashMessage(err, (k) => this.translation.translate(k)) ?? this.translation.translate('messages.error'));
      return;
    }

    let fiscal: FiscalReceipt | undefined;
    try {
      fiscal = await this.fiscalRefund(sale, result);
    } catch (err) {
      const msg = (err as Error).message === 'VCR_UNREACHABLE' ? this.translation.translate('fiscal.unreachable') : (err as Error).message;
      this.toast.error(`${this.translation.translate('fiscal.refundFailed')}: ${msg}`);
      return;
    }

    this.salesService
      .createReturn({
        saleId: sale.id,
        ...(sale.receiptNo ? { receiptNo: sale.receiptNo } : {}),
        items: result.items,
        refundAmount: result.refundAmount,
        refundMethod: result.refundMethod,
        ...(result.reason ? { reason: result.reason } : {}),
        ...(shift ? { shiftId: shift.id } : {}),
        ...(user ? { cashierId: user.uid, cashierName: user.displayName } : {}),
        ...(fiscal ? { fiscal } : {})
      })
      .subscribe({
        next: () => this.toast.success(this.translation.translate('returns.saved')),
        error: (err) => {
          console.error('Create return error:', err);
          this.toast.error(this.translation.translate('messages.error'));
        }
      });
  }
}

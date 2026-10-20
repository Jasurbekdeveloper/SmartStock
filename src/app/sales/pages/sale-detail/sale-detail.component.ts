import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SalesService, saleCardIn, saleCashIn } from '../../../core/services/sales.service';
import { DebtService } from '../../../core/services/debt.service';
import { AuthService } from '../../../core/services/auth.service';
import { ShiftService } from '../../../core/services/shift.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';
import { of, switchMap, take } from 'rxjs';
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
    if (!sale) return false;
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

  private saveReturn(result: ReturnDialogResult) {
    const sale = this.sale();
    const user = this.currentUser();
    if (!sale) return;

    // Refunds are booked on the shift of whoever gives the money back, so their
    // Z-report nets the cash out of the drawer.
    const shift$ = user ? this.shiftService.getOpenShiftForUser(user.uid).pipe(take(1)) : of(undefined);

    shift$
      .pipe(
        switchMap((shift) =>
          this.salesService.createReturn({
            saleId: sale.id,
            ...(sale.receiptNo ? { receiptNo: sale.receiptNo } : {}),
            items: result.items,
            refundAmount: result.refundAmount,
            refundMethod: result.refundMethod,
            ...(result.reason ? { reason: result.reason } : {}),
            ...(shift ? { shiftId: shift.id } : {}),
            ...(user ? { cashierId: user.uid, cashierName: user.displayName } : {})
          })
        )
      )
      .subscribe({
        next: () => this.toast.success(this.translation.translate('returns.saved')),
        error: (err) => {
          console.error('Create return error:', err);
          this.toast.error(this.translation.translate('messages.error'));
        }
      });
  }
}

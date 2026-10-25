import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ShiftService, computeShiftTotals } from '../../../core/services/shift.service';
import { SalesService } from '../../../core/services/sales.service';
import { CashMovementService } from '../../../core/services/cash-movement.service';
import { roundMoney } from '../../../core/utils/pos-math';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';

@Component({
  selector: 'app-shift-close',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TranslatePipe,
    CurrencyDisplayPipe,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule
  ],
  templateUrl: './shift-close.component.html',
  styleUrl: './shift-close.component.css'
})
export class ShiftCloseComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private shiftService = inject(ShiftService);
  private salesService = inject(SalesService);
  private toast = inject(ToastService);
  private translation = inject(TranslationService);

  private shiftId = this.route.snapshot.paramMap.get('id') ?? '';

  shift = toSignal(this.shiftService.getShiftById(this.shiftId), { initialValue: undefined });
  sales = toSignal(this.shiftService.getShiftSales(this.shiftId), { initialValue: [] });
  returns = toSignal(this.salesService.getReturnsForShift(this.shiftId), { initialValue: [] });
  movements = toSignal(inject(CashMovementService).getForShift(this.shiftId), { initialValue: [] });

  /** Signal, not a plain field: `variance` below is a computed and would never
   *  recompute off a plain field in this zoneless app. */
  countedCash = signal<number | null>(null);
  submitting = signal(false);

  alreadyClosed = computed(() => this.shift()?.status === 'closed');

  /** Same function ShiftService.closeShift() uses, so the preview always matches the saved Z-report. */
  totals = computed(() => computeShiftTotals(this.sales(), this.returns(), this.movements()));

  expectedCash = computed(() => roundMoney((this.shift()?.startingCash ?? 0) + this.totals().cashDrawerDelta));

  variance = computed(() => roundMoney((this.countedCash() ?? 0) - this.expectedCash()));

  confirmClose() {
    const counted = this.countedCash();
    if (counted === null || counted < 0 || !this.shiftId) return;

    this.submitting.set(true);
    this.shiftService.closeShift(this.shiftId, counted).subscribe({
      next: () => {
        this.submitting.set(false);
        this.toast.success(this.translation.translate('shifts.shiftClosed'));
        this.router.navigate(['/shifts/history']);
      },
      error: (err) => {
        console.error('Close shift error:', err);
        this.submitting.set(false);
        this.toast.error(this.translation.translate('messages.error'));
      }
    });
  }
}

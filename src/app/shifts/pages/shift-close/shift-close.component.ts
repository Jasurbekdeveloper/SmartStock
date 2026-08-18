import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ShiftService } from '../../../core/services/shift.service';
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
  private toast = inject(ToastService);
  private translation = inject(TranslationService);

  private shiftId = this.route.snapshot.paramMap.get('id') ?? '';

  shift = toSignal(this.shiftService.getShiftById(this.shiftId), { initialValue: undefined });
  sales = toSignal(this.shiftService.getShiftSales(this.shiftId), { initialValue: [] });

  countedCash: number | null = null;
  submitting = signal(false);

  alreadyClosed = computed(() => this.shift()?.status === 'closed');

  salesCount = computed(() => this.sales().length);
  totalRevenue = computed(() => this.sales().reduce((sum, s) => sum + s.total, 0));

  cashTotal = computed(() => this.sales().filter((s) => s.paymentMethod === 'cash').reduce((sum, s) => sum + s.total, 0));
  cardTotal = computed(() => this.sales().filter((s) => s.paymentMethod === 'card').reduce((sum, s) => sum + s.total, 0));

  /** Net cash added to the drawer: amount tendered minus change handed back — mirrors
   * ShiftService.closeShift()'s calculation, shown here live before confirming. */
  private cashDrawerDelta = computed(() =>
    this.sales()
      .filter((s) => s.paymentMethod === 'cash')
      .reduce((sum, s) => sum + (s.paidAmount - s.change), 0)
  );

  expectedCash = computed(() => (this.shift()?.startingCash ?? 0) + this.cashDrawerDelta());

  variance = computed(() => (this.countedCash ?? 0) - this.expectedCash());

  confirmClose() {
    if (this.countedCash === null || this.countedCash < 0 || !this.shiftId) return;

    this.submitting.set(true);
    this.shiftService.closeShift(this.shiftId, this.countedCash).subscribe({
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

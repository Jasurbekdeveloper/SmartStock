import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { CurrencyDisplayPipe } from '../../core/pipes/currency-display.pipe';
import { CashMovement, CashMovementService } from '../../core/services/cash-movement.service';
import { AuthService } from '../../core/services/auth.service';
import { ShiftService } from '../../core/services/shift.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslationService } from '../../core/services/translation.service';
import { PeriodKey, periodRange } from '../../core/utils/period';
import { roundMoney } from '../../core/utils/pos-math';
import { startOfDay } from '../../core/utils/date-range';
import { PeriodPickerComponent } from '../../shared/components/period-picker/period-picker.component';
import { CashMovementDialogComponent } from '../../shared/components/cash-movement-dialog/cash-movement-dialog.component';

/** Every cash movement outside sales (float, collections, till expenses), by day. */
@Component({
  selector: 'app-cashbook',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule, TranslatePipe, CurrencyDisplayPipe, PeriodPickerComponent],
  templateUrl: './cashbook.component.html'
})
export class CashbookComponent {
  private cashMovements = inject(CashMovementService);
  private shiftService = inject(ShiftService);
  private authService = inject(AuthService);
  private dialog = inject(MatDialog);
  private toast = inject(ToastService);
  private translation = inject(TranslationService);

  period = signal<PeriodKey>('7d');
  typeFilter = signal<'all' | 'in' | 'out'>('all');
  range = computed(() => periodRange(this.period()));

  movements = toSignal(
    toObservable(this.range).pipe(
      switchMap((r) =>
        this.cashMovements.getSince(r.from).pipe(
          map((list) => list.filter((m) => !m.createdAt || new Date(m.createdAt) <= r.to)),
          catchError((err) => {
            console.error('Load cash movements error:', err);
            return of([] as CashMovement[]);
          })
        )
      )
    ),
    { initialValue: [] as CashMovement[] }
  );

  openShift = toSignal(
    this.authService.currentUser$.pipe(
      switchMap((u) => (u ? this.shiftService.getOpenShiftForUser(u.uid) : of(undefined))),
      catchError(() => of(undefined))
    ),
    { initialValue: undefined }
  );

  private sum = (list: CashMovement[]) => roundMoney(list.reduce((s, m) => s + m.amount, 0));
  totalIn = computed(() => this.sum(this.movements().filter((m) => m.type === 'in')));
  totalOut = computed(() => this.sum(this.movements().filter((m) => m.type === 'out')));
  collections = computed(() => this.sum(this.movements().filter((m) => m.reason === 'collection')));
  tillExpenses = computed(() => this.sum(this.movements().filter((m) => m.reason === 'expense')));

  /** Filtered movements grouped by calendar day, newest first. */
  days = computed(() => {
    const filter = this.typeFilter();
    const list = filter === 'all' ? this.movements() : this.movements().filter((m) => m.type === filter);
    const groups = new Map<number, { date: Date; items: CashMovement[]; net: number }>();
    for (const m of list) {
      const day = startOfDay(m.createdAt ? new Date(m.createdAt) : new Date());
      const g = groups.get(day.getTime()) ?? { date: day, items: [], net: 0 };
      g.items.push(m);
      g.net += m.type === 'in' ? m.amount : -m.amount;
      groups.set(day.getTime(), g);
    }
    return [...groups.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
  });

  record() {
    const shift = this.openShift();
    if (!shift) return;
    this.dialog
      .open(CashMovementDialogComponent, { width: '440px', maxWidth: '96vw', data: {} })
      .afterClosed()
      .subscribe((input) => {
        if (!input) return;
        this.cashMovements.add(shift.id, input).subscribe({
          next: () => this.toast.success(this.translation.translate('finance.cashMovementSaved')),
          error: (err) => {
            console.error('Cash movement error:', err);
            this.toast.error(this.translation.translate('messages.error'));
          }
        });
      });
  }
}

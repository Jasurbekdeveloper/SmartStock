import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { CurrencyDisplayPipe } from '../../core/pipes/currency-display.pipe';
import { Expense, ExpenseService } from '../../core/services/expense.service';
import { AuthService } from '../../core/services/auth.service';
import { ShiftService } from '../../core/services/shift.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslationService } from '../../core/services/translation.service';
import { AuditLogService } from '../../core/services/audit-log.service';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_ICONS, ExpenseCategory, groupExpenses, percentChange } from '../../core/utils/finance';
import { PeriodKey, daysInRange, periodRange, previousRange } from '../../core/utils/period';
import { roundMoney } from '../../core/utils/pos-math';
import { exportToExcel } from '../../core/utils/excel-export';
import { PeriodPickerComponent } from '../../shared/components/period-picker/period-picker.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { ExpenseDialogComponent, ExpenseDialogData, ExpenseDialogResult } from '../components/expense-dialog.component';

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatMenuModule, TranslatePipe, CurrencyDisplayPipe, PeriodPickerComponent],
  templateUrl: './expenses.component.html',
  styleUrl: './expenses.component.css'
})
export class ExpensesComponent {
  private expenseService = inject(ExpenseService);
  private authService = inject(AuthService);
  private dialog = inject(MatDialog);
  private toast = inject(ToastService);
  private translation = inject(TranslationService);
  private auditLog = inject(AuditLogService);
  private shiftService = inject(ShiftService);

  readonly icons = EXPENSE_CATEGORY_ICONS;
  readonly categories = EXPENSE_CATEGORIES;

  period = signal<PeriodKey>('month');
  categoryFilter = signal<ExpenseCategory | null>(null);
  range = computed(() => periodRange(this.period()));

  private load = (range: { from: Date; to: Date }) =>
    this.expenseService.getExpenses(range.from, range.to).pipe(catchError((err) => {
      console.error('Load expenses error:', err);
      return of([] as Expense[]);
    }));

  expenses = toSignal(toObservable(this.range).pipe(switchMap((r) => this.load(r))), { initialValue: [] as Expense[] });
  private previous = toSignal(toObservable(this.range).pipe(switchMap((r) => this.load(previousRange(r)))), {
    initialValue: [] as Expense[]
  });

  openShift = toSignal(
    this.authService.currentUser$.pipe(
      switchMap((u) => (u ? this.shiftService.getOpenShiftForUser(u.uid) : of(undefined))),
      catchError(() => of(undefined))
    ),
    { initialValue: undefined }
  );

  visible = computed(() => {
    const cat = this.categoryFilter();
    return cat ? this.expenses().filter((e) => e.category === cat) : this.expenses();
  });

  visibleTotal = computed(() => roundMoney(this.visible().reduce((s, e) => s + e.amount, 0)));
  total = computed(() => roundMoney(this.expenses().reduce((s, e) => s + e.amount, 0)));
  previousTotal = computed(() => this.previous().reduce((s, e) => s + e.amount, 0));
  change = computed(() => percentChange(this.total(), this.previousTotal()));
  perDay = computed(() => roundMoney(this.total() / daysInRange(this.range())));
  byCategory = computed(() => groupExpenses(this.expenses()));
  fromTill = computed(() => roundMoney(this.expenses().filter((e) => e.cashMovementId).reduce((s, e) => s + e.amount, 0)));

  add() {
    this.openDialog({ openShiftId: this.openShift()?.id });
  }

  edit(expense: Expense) {
    this.openDialog({ expense });
  }

  private openDialog(data: ExpenseDialogData) {
    this.dialog
      .open(ExpenseDialogComponent, { width: '560px', maxWidth: '96vw', data, autoFocus: 'first-tabbable' })
      .afterClosed()
      .subscribe((result: ExpenseDialogResult | undefined) => {
        if (!result) return;
        const done = () => this.toast.success(this.translation.translate('finance.expenseSaved'));
        const fail = (err: unknown) => {
          console.error('Save expense error:', err);
          this.toast.error(this.translation.translate('messages.error'));
        };
        if (data.expense) {
          const patch = data.expense.cashMovementId ? { ...result.input, amount: data.expense.amount, method: data.expense.method } : result.input;
          this.expenseService.updateExpense(data.expense.id, patch).subscribe({ next: done, error: fail });
        } else {
          const shiftId = result.fromShift ? data.openShiftId : undefined;
          this.expenseService.addExpense(result.input, shiftId).subscribe({ next: done, error: fail });
        }
      });
  }

  remove(expense: Expense) {
    this.dialog
      .open(ConfirmDialogComponent, { data: { titleKey: 'finance.deleteExpense', messageKey: 'finance.deleteExpenseConfirm' } })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.expenseService.deleteExpense(expense.id).subscribe({
          next: () => {
            this.auditLog.log({ action: 'expense.delete', entityType: 'expense', entityId: expense.id, before: expense }).subscribe({ error: () => {} });
            this.toast.success(this.translation.translate('finance.expenseDeleted'));
          },
          error: (err) => {
            console.error('Delete expense error:', err);
            this.toast.error(this.translation.translate('messages.error'));
          }
        });
      });
  }

  export() {
    const t = (k: string) => this.translation.translate(k);
    exportToExcel(
      'xarajatlar',
      t('navigation.expenses'),
      this.visible().map((e) => ({
        [t('finance.date')]: new Date(e.date).toLocaleDateString(),
        [t('finance.category')]: t('finance.cat.' + e.category),
        [t('finance.amount')]: e.amount,
        [t('finance.method')]: t('finance.methods.' + e.method),
        [t('finance.note')]: e.note ?? '',
        [t('finance.createdBy')]: e.createdByName
      }))
    );
  }
}

import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Supplier, SupplierService, SupplierTransaction } from '../../../core/services/supplier.service';
import { StockEntry, StockService } from '../../../core/services/stock.service';
import { ShiftService } from '../../../core/services/shift.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';
import { NumericInputDirective } from '../../../shared/directives/numeric-input.directive';
import { roundMoney } from '../../../core/utils/pos-math';

type PayMethod = 'bank' | 'card' | 'cash' | 'drawer';

/** A supplier's account: what the store owes, deliveries and payments, and paying. */
@Component({
  selector: 'app-supplier-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe, SumPipe, CurrencyDisplayPipe, NumericInputDirective, MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './supplier-detail.component.html',
  styleUrl: './supplier-detail.component.css'
})
export class SupplierDetailComponent implements OnInit {
  private supplierService = inject(SupplierService);
  private stockService = inject(StockService);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private translation = inject(TranslationService);

  supplier = signal<Supplier | null>(null);
  stockEntries = signal<StockEntry[]>([]);
  transactions = signal<SupplierTransaction[]>([]);
  private openShift = toSignal(
    inject(ShiftService).getOpenShiftForUser(this.auth.getCurrentUser()?.uid ?? '').pipe(catchError(() => of(undefined))),
    { initialValue: undefined }
  );
  hasShift = computed(() => !!this.openShift());

  paying = signal(false);
  payAmount = signal<number | null>(null);
  payMethod = signal<PayMethod>('bank');
  payNote = signal('');
  saving = signal(false);

  balance = computed(() => roundMoney(this.supplier()?.balance ?? 0));
  totalPurchased = computed(() => this.stockEntries().reduce((sum, e) => sum + (e.totalCost ?? 0), 0));
  totalPaid = computed(() =>
    roundMoney(
      this.transactions().reduce((s, t) => s + (t.type === 'payment' ? t.amount : t.type === 'purchase' ? t.paidNow ?? 0 : 0), 0)
    )
  );
  overdue = computed(() => {
    const now = Date.now();
    return this.balance() > 0 && this.transactions().some((t) => t.type === 'purchase' && t.dueDate && new Date(t.dueDate).getTime() < now);
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.supplierService.getSupplierById(id).subscribe({ next: (s) => this.supplier.set(s ?? null) });
    this.stockService.getStockEntriesBySupplierId(id).subscribe({ next: (e) => this.stockEntries.set(e) });
    this.supplierService.getTransactions(id).subscribe({ next: (t) => this.transactions.set(t), error: () => this.transactions.set([]) });
  }

  startPay() {
    this.paying.set(true);
    this.payAmount.set(this.balance() > 0 ? this.balance() : null);
  }

  pay() {
    const s = this.supplier();
    const amount = Number(this.payAmount()) || 0;
    if (!s || amount <= 0 || this.saving()) return;
    const method = this.payMethod();
    this.saving.set(true);
    this.supplierService
      .pay({
        supplierId: s.id,
        supplierName: s.name,
        amount,
        method: method === 'drawer' ? 'cash' : method,
        drawerShiftId: method === 'drawer' ? this.openShift()?.id : undefined,
        note: this.payNote()
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.paying.set(false);
          this.payNote.set('');
          this.toast.success(this.translation.translate('suppliers.paymentSaved'));
        },
        error: (err) => {
          console.error('Supplier payment error:', err);
          this.saving.set(false);
          this.toast.error(this.translation.translate('messages.error'));
        }
      });
  }
}

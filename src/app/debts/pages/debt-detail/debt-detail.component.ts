import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialog } from '@angular/material/dialog';
import { DebtPaymentDialogComponent } from '../../../shared/components/debt-payment-dialog/debt-payment-dialog.component';
import { Customer, Debt, DebtService } from '../../../core/services/debt.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { TranslationService } from '../../../core/services/translation.service';
import { ToastService } from '../../../core/services/toast.service';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';

@Component({
  selector: 'app-debt-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    TranslatePipe,
    CurrencyDisplayPipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule
  ],
  templateUrl: './debt-detail.component.html',
  styleUrl: './debt-detail.component.css'
})
export class DebtDetailComponent implements OnInit {
  private debtService: DebtService = inject(DebtService);
  private route: ActivatedRoute = inject(ActivatedRoute);
  private translation: TranslationService = inject(TranslationService);
  private toast: ToastService = inject(ToastService);
  private dialog = inject(MatDialog);

  customer = signal<Customer | null>(null);
  debts = signal<Debt[]>([]);


  totalRemaining = computed(() => this.debts().reduce((sum, d) => sum + d.remainingAmount, 0));

  ngOnInit() {
    const customerId = this.route.snapshot.paramMap.get('id');
    if (!customerId) return;

    this.debtService.getCustomers().subscribe((customers) => {
      this.customer.set(customers.find((c) => c.id === customerId) ?? null);
    });

    this.debtService.getCustomerDebts(customerId).subscribe((debts) => {
      this.debts.set(debts);
    });
  }

  itemsSummary(debt: Debt): string {
    return (debt.items ?? []).map((item) => `${item.productName} x${item.quantity}`).join(', ');
  }

  /** One debt, or (no id) the customer's whole balance, oldest debts first. */
  openPayment(debtId?: string) {
    const customerId = this.customer()?.id ?? this.route.snapshot.paramMap.get('id') ?? undefined;
    if (!customerId) return;
    this.dialog.open(DebtPaymentDialogComponent, { data: { customerId, debtId }, width: '760px', maxWidth: '96vw', autoFocus: false });
  }
}

import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Customer, Debt, DebtService } from '../../../core/services/debt.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { TranslationService } from '../../../core/services/translation.service';
import { ToastService } from '../../../core/services/toast.service';
import { SumPipe } from '../../../core/pipes/sum.pipe';

@Component({
  selector: 'app-debt-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslatePipe, SumPipe],
  templateUrl: './debt-detail.component.html',
  styleUrl: './debt-detail.component.css'
})
export class DebtDetailComponent implements OnInit {
  private debtService: DebtService = inject(DebtService);
  private route: ActivatedRoute = inject(ActivatedRoute);
  private translation: TranslationService = inject(TranslationService);
  private toast: ToastService = inject(ToastService);

  customer = signal<Customer | null>(null);
  debts = signal<Debt[]>([]);

  payingDebtId = signal<string | null>(null);
  paymentAmount = signal(0);
  submitting = signal(false);

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

  startPayment(debt: Debt) {
    this.payingDebtId.set(debt.id);
    this.paymentAmount.set(debt.remainingAmount);
  }

  cancelPayment() {
    this.payingDebtId.set(null);
    this.paymentAmount.set(0);
  }

  confirmPayment(debt: Debt) {
    const amount = this.paymentAmount();
    if (amount <= 0) return;

    this.submitting.set(true);
    this.debtService.payDebt(debt.id, amount).subscribe({
      next: () => {
        this.submitting.set(false);
        this.payingDebtId.set(null);
        this.paymentAmount.set(0);
        this.toast.success(this.translation.translate('debts.paymentSuccess'));
      },
      error: (err) => {
        console.error('Pay debt error:', err);
        this.submitting.set(false);
        this.toast.error(this.translation.translate('messages.error'));
      }
    });
  }
}

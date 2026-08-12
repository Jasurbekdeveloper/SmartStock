import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { DebtService, Debt } from '../../../core/services/debt.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { TranslationService } from '../../../core/services/translation.service';

@Component({
  selector: 'app-debt-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './debt-detail.component.html',
  styleUrl: './debt-detail.component.css'
})
export class DebtDetailComponent implements OnInit {
  private debtService: DebtService = inject(DebtService);
  private route: ActivatedRoute = inject(ActivatedRoute);
  private translation: TranslationService = inject(TranslationService);

  debt = signal<Debt | null>(null);
  paymentAmount = 0;
  submitting = signal(false);

  customers = toSignal(this.debtService.getCustomers(), { initialValue: [] });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.debtService.getDebtById(id).subscribe(debt => {
        this.debt.set(debt ?? null);
      });
    }
  }

  customerName(customerId: string): string {
    return this.customers().find((c) => c.id === customerId)?.name ?? customerId;
  }

  payDebt() {
    const debt = this.debt();
    if (!debt || this.paymentAmount <= 0) return;

    this.submitting.set(true);
    this.debtService.payDebt(debt.id, this.paymentAmount).subscribe({
      next: () => {
        this.submitting.set(false);
        this.paymentAmount = 0;
        alert(this.translation.translate('debts.paymentSuccess'));
      },
      error: (err) => {
        console.error('Pay debt error:', err);
        this.submitting.set(false);
        alert(this.translation.translate('messages.error'));
      }
    });
  }
}

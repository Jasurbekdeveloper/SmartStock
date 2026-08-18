import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule } from '@angular/material/paginator';
import { DebtService } from '../../../core/services/debt.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';
import { createPagination } from '../../../core/utils/pagination';
import { normalizeForSearch } from '../../../core/utils/uzbek-transliteration';

interface CustomerDebtSummary {
  customerId: string;
  customerName: string;
  customerPhone: string;
  totalRemaining: number;
  lastDebtDate: Date;
  lastDebtAmount: number;
}

@Component({
  selector: 'app-debt-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    TranslatePipe,
    CurrencyDisplayPipe,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatPaginatorModule
  ],
  templateUrl: './debt-list.component.html',
  styleUrl: './debt-list.component.css'
})
export class DebtListComponent {
  private debtService = inject(DebtService);

  debts = toSignal(this.debtService.getDebts(), { initialValue: [] });
  customers = toSignal(this.debtService.getCustomers(), { initialValue: [] });
  searchQuery = signal('');

  /** One row per customer who has at least one debt — total owed + most recent debt. */
  summaries = computed<CustomerDebtSummary[]>(() => {
    const customers = this.customers();
    const byCustomer = new Map<string, CustomerDebtSummary>();

    for (const debt of this.debts()) {
      const customer = customers.find((c) => c.id === debt.customerId);
      const existing = byCustomer.get(debt.customerId);

      if (!existing) {
        byCustomer.set(debt.customerId, {
          customerId: debt.customerId,
          customerName: customer?.name ?? debt.customerId,
          customerPhone: customer?.phone ?? '',
          totalRemaining: debt.remainingAmount,
          lastDebtDate: debt.createdAt,
          lastDebtAmount: debt.totalAmount
        });
      } else {
        existing.totalRemaining += debt.remainingAmount;
        if (new Date(debt.createdAt) > new Date(existing.lastDebtDate)) {
          existing.lastDebtDate = debt.createdAt;
          existing.lastDebtAmount = debt.totalAmount;
        }
      }
    }

    return Array.from(byCustomer.values()).sort(
      (a, b) => new Date(b.lastDebtDate).getTime() - new Date(a.lastDebtDate).getTime()
    );
  });

  filteredSummaries = computed(() => {
    const query = this.searchQuery().trim();
    if (!query) return this.summaries();
    // Cross-script normalization (13-band, bonus fix) — same underlying bug as the
    // product/customer/supplier search sites.
    const normalizedQuery = normalizeForSearch(query);
    return this.summaries().filter((s) => normalizeForSearch(s.customerName).includes(normalizedQuery));
  });

  pagination = createPagination(this.filteredSummaries);

  onSearchChange(value: string) {
    this.searchQuery.set(value);
    this.pagination.reset();
  }
}

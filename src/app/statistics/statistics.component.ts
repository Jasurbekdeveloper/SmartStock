import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Sale, SalesService } from '../core/services/sales.service';
import { Debt, DebtService } from '../core/services/debt.service';
import { TranslationService } from '../core/services/translation.service';
import { TranslatePipe } from '../core/pipes/translate.pipe';
import { SumPipe } from '../core/pipes/sum.pipe';
import { exportToExcel } from '../core/utils/excel-export';

interface MonthlyReportRow {
  month: string;
  ordersCount: number;
  revenue: number;
}

interface TopProductRow {
  productName: string;
  quantity: number;
  revenue: number;
}

interface TopDebtorRow {
  customerName: string;
  customerPhone: string;
  remainingAmount: number;
}

@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [CommonModule, TranslatePipe, TranslateModule, SumPipe, MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './statistics.component.html',
  styleUrl: './statistics.component.css'
})
export class StatisticsComponent {
  private salesService: SalesService = inject(SalesService);
  private debtService: DebtService = inject(DebtService);
  private translation: TranslationService = inject(TranslationService);

  sales = toSignal(this.salesService.getSales(), { initialValue: [] as Sale[] });
  debts = toSignal(this.debtService.getDebts(), { initialValue: [] as Debt[] });
  customers = toSignal(this.debtService.getCustomers(), { initialValue: [] });

  totalSales = computed(() => this.sales().length);

  totalRevenue = computed(() => this.sales().reduce((sum, s) => sum + s.total, 0));

  averageOrderValue = computed(() => (this.totalSales() > 0 ? this.totalRevenue() / this.totalSales() : 0));

  topPaymentMethod = computed(() => {
    const counts = new Map<string, number>();
    for (const sale of this.sales()) {
      counts.set(sale.paymentMethod, (counts.get(sale.paymentMethod) ?? 0) + 1);
    }
    let maxMethod = '';
    let maxCount = 0;
    counts.forEach((count, method) => {
      if (count > maxCount) {
        maxCount = count;
        maxMethod = method;
      }
    });
    return maxMethod || 'N/A';
  });

  /** One row per calendar month that has at least one sale, most recent first. */
  monthlyReport = computed<MonthlyReportRow[]>(() => {
    const byMonth = new Map<string, MonthlyReportRow>();
    for (const sale of this.sales()) {
      const date = new Date(sale.createdAt);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const row = byMonth.get(month);
      if (row) {
        row.ordersCount++;
        row.revenue += sale.total;
      } else {
        byMonth.set(month, { month, ordersCount: 1, revenue: sale.total });
      }
    }
    return Array.from(byMonth.values()).sort((a, b) => (a.month < b.month ? 1 : -1));
  });

  recentSales = computed(() => this.sales().slice(0, 10));

  /** Aggregated across every sale's line items, most units sold first. */
  topProducts = computed<TopProductRow[]>(() => {
    const byProduct = new Map<string, TopProductRow>();
    for (const sale of this.sales()) {
      for (const item of sale.items) {
        const row = byProduct.get(item.productId);
        if (row) {
          row.quantity += item.quantity;
          row.revenue += item.total;
        } else {
          byProduct.set(item.productId, { productName: item.productName, quantity: item.quantity, revenue: item.total });
        }
      }
    }
    return Array.from(byProduct.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);
  });

  totalOutstanding = computed(() => this.debts().reduce((sum, d) => sum + d.remainingAmount, 0));

  totalCollected = computed(() => this.debts().reduce((sum, d) => sum + d.paidAmount, 0));

  customersWithDebtCount = computed(() => new Set(this.debts().filter((d) => d.remainingAmount > 0).map((d) => d.customerId)).size);

  /** One row per customer with an outstanding balance, largest debt first. */
  topDebtors = computed<TopDebtorRow[]>(() => {
    const byCustomer = new Map<string, number>();
    for (const debt of this.debts()) {
      byCustomer.set(debt.customerId, (byCustomer.get(debt.customerId) ?? 0) + debt.remainingAmount);
    }
    const customers = this.customers();
    return Array.from(byCustomer.entries())
      .filter(([, remaining]) => remaining > 0)
      .map(([customerId, remainingAmount]) => {
        const customer = customers.find((c) => c.id === customerId);
        return {
          customerName: customer?.name ?? customerId,
          customerPhone: customer?.phone ?? '',
          remainingAmount
        };
      })
      .sort((a, b) => b.remainingAmount - a.remainingAmount)
      .slice(0, 10);
  });

  exportMonthlyReport() {
    const t = (key: string) => this.translation.translate(key);
    exportToExcel(
      t('statistics.monthlyReport'),
      t('statistics.monthlyReport'),
      this.monthlyReport().map((row) => ({
        [t('statistics.month')]: row.month,
        [t('statistics.ordersCount')]: row.ordersCount,
        [t('statistics.revenue')]: row.revenue
      }))
    );
  }

  exportRecentSales() {
    const t = (key: string) => this.translation.translate(key);
    exportToExcel(
      t('statistics.recentSales'),
      t('statistics.recentSales'),
      this.recentSales().map((sale) => ({
        [t('table.saleId')]: sale.id,
        [t('table.items')]: sale.items.length,
        [t('table.total')]: sale.total,
        [t('table.date')]: new Date(sale.createdAt).toLocaleString()
      }))
    );
  }

  exportTopProducts() {
    const t = (key: string) => this.translation.translate(key);
    exportToExcel(
      t('statistics.topProducts'),
      t('statistics.topProducts'),
      this.topProducts().map((row) => ({
        [t('table.name')]: row.productName,
        [t('statistics.quantitySold')]: row.quantity,
        [t('statistics.revenue')]: row.revenue
      }))
    );
  }

  exportDebtStatistics() {
    const t = (key: string) => this.translation.translate(key);
    exportToExcel(
      t('statistics.debtStatistics'),
      t('statistics.topDebtors'),
      this.topDebtors().map((row) => ({
        [t('debts.customer')]: row.customerName,
        [t('debts.customerPhone')]: row.customerPhone,
        [t('debts.remainingAmount')]: row.remainingAmount
      }))
    );
  }
}

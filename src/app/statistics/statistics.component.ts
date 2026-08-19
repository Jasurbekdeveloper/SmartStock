import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { ChartConfiguration } from 'chart.js';
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { Sale, SalesService } from '../core/services/sales.service';
import { Debt, DebtService } from '../core/services/debt.service';
import { TranslationService } from '../core/services/translation.service';
import { TranslatePipe } from '../core/pipes/translate.pipe';
import { SumPipe } from '../core/pipes/sum.pipe';
import { CurrencyDisplayPipe } from '../core/pipes/currency-display.pipe';
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

interface PaymentMethodStat {
  method: string;
  count: number;
  amount: number;
}

const CHART_COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#f97316', '#ef4444', '#06b6d4', '#eab308', '#ec4899'];

@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslatePipe,
    TranslateModule,
    SumPipe,
    CurrencyDisplayPipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatTooltipModule,
    BaseChartDirective
  ],
  // Registered here (component-level) rather than in app.config.ts so that chart.js
  // is only pulled into the lazy `statistics` route chunk, not the eager main bundle
  // — verified empirically against the production build output.
  providers: [provideCharts(withDefaultRegisterables())],
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

  fromDate = signal<Date | null>(null);
  toDate = signal<Date | null>(null);

  onFromDateChange(value: Date | null) {
    this.fromDate.set(value);
  }

  onToDateChange(value: Date | null) {
    this.toDate.set(value);
  }

  clearDateRange() {
    this.fromDate.set(null);
    this.toDate.set(null);
  }

  /** Every KPI/table/chart on this page reads from this (and `filteredDebts`)
   *  instead of the raw `sales()`/`debts()` signals, so the selected date range
   *  is reflected consistently across the whole page. */
  filteredSales = computed(() => {
    const from = this.fromDate();
    const to = this.toDate();
    if (!from && !to) return this.sales();

    return this.sales().filter((sale) => {
      const createdAt = new Date(sale.createdAt);
      if (from && createdAt < from) return false;
      if (to) {
        const toEnd = new Date(to);
        toEnd.setHours(23, 59, 59, 999);
        if (createdAt > toEnd) return false;
      }
      return true;
    });
  });

  filteredDebts = computed(() => {
    const from = this.fromDate();
    const to = this.toDate();
    if (!from && !to) return this.debts();

    return this.debts().filter((debt) => {
      const createdAt = new Date(debt.createdAt);
      if (from && createdAt < from) return false;
      if (to) {
        const toEnd = new Date(to);
        toEnd.setHours(23, 59, 59, 999);
        if (createdAt > toEnd) return false;
      }
      return true;
    });
  });

  totalSales = computed(() => this.filteredSales().length);

  totalRevenue = computed(() => this.filteredSales().reduce((sum, s) => sum + s.total, 0));

  averageOrderValue = computed(() => (this.totalSales() > 0 ? this.totalRevenue() / this.totalSales() : 0));

  /** Sum of every filtered sale's `totalNetProfit`. Older sales made before net-profit
   *  tracking existed simply omit the field, so `?? 0` treats them as contributing zero
   *  rather than poisoning the sum with `NaN` — see the `profitCaveat` note in the template. */
  totalNetProfit = computed(() => this.filteredSales().reduce((sum, s) => sum + (s.totalNetProfit ?? 0), 0));

  profitMargin = computed(() => (this.totalRevenue() > 0 ? (this.totalNetProfit() / this.totalRevenue()) * 100 : 0));

  /** Full per-method breakdown (count + amount) — feeds the payment-method pie
   *  chart; `topPaymentMethod` below is just its first (largest) entry. */
  paymentMethodBreakdown = computed<PaymentMethodStat[]>(() => {
    const stats = new Map<string, PaymentMethodStat>();
    for (const sale of this.filteredSales()) {
      const row = stats.get(sale.paymentMethod);
      if (row) {
        row.count++;
        row.amount += sale.total;
      } else {
        stats.set(sale.paymentMethod, { method: sale.paymentMethod, count: 1, amount: sale.total });
      }
    }
    return Array.from(stats.values()).sort((a, b) => b.amount - a.amount);
  });

  topPaymentMethod = computed(() => this.paymentMethodBreakdown()[0]?.method ?? 'N/A');

  /** One row per calendar month that has at least one sale, most recent first. */
  monthlyReport = computed<MonthlyReportRow[]>(() => {
    const byMonth = new Map<string, MonthlyReportRow>();
    for (const sale of this.filteredSales()) {
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

  recentSales = computed(() => this.filteredSales().slice(0, 10));

  /** Aggregated across every sale's line items, most units sold first. */
  topProducts = computed<TopProductRow[]>(() => {
    const byProduct = new Map<string, TopProductRow>();
    for (const sale of this.filteredSales()) {
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

  totalOutstanding = computed(() => this.filteredDebts().reduce((sum, d) => sum + d.remainingAmount, 0));

  totalCollected = computed(() => this.filteredDebts().reduce((sum, d) => sum + d.paidAmount, 0));

  customersWithDebtCount = computed(
    () => new Set(this.filteredDebts().filter((d) => d.remainingAmount > 0).map((d) => d.customerId)).size
  );

  /** One row per customer with an outstanding balance, largest debt first. */
  topDebtors = computed<TopDebtorRow[]>(() => {
    const byCustomer = new Map<string, number>();
    for (const debt of this.filteredDebts()) {
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

  /** Revenue-over-time (line chart). Buckets daily within the selected range;
   *  falls back to monthly buckets when the span exceeds ~60 days so the chart
   *  doesn't render hundreds of unreadable daily points. */
  revenueChartData = computed<ChartConfiguration<'line'>['data']>(() => {
    this.translation.currentLanguage$();
    const sales = this.filteredSales();
    const label = this.translation.translate('statistics.revenue');

    if (sales.length === 0) {
      return { labels: [], datasets: [{ data: [], label, borderColor: CHART_COLORS[0], backgroundColor: CHART_COLORS[0] + '33', fill: true, tension: 0.3 }] };
    }

    const timestamps = sales.map((s) => new Date(s.createdAt).getTime());
    const spanDays = (Math.max(...timestamps) - Math.min(...timestamps)) / 86400000;
    const monthly = spanDays > 60;

    const buckets = new Map<string, number>();
    for (const sale of sales) {
      const d = new Date(sale.createdAt);
      const key = monthly
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      buckets.set(key, (buckets.get(key) ?? 0) + sale.total);
    }
    const sortedKeys = Array.from(buckets.keys()).sort();

    return {
      labels: sortedKeys,
      datasets: [
        {
          data: sortedKeys.map((k) => buckets.get(k) ?? 0),
          label,
          borderColor: CHART_COLORS[0],
          backgroundColor: CHART_COLORS[0] + '33',
          fill: true,
          tension: 0.3
        }
      ]
    };
  });

  revenueChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true } }
  };

  /** Top-selling products (bar chart) — re-renders `topProducts` as a chart. */
  topProductsChartData = computed<ChartConfiguration<'bar'>['data']>(() => {
    this.translation.currentLanguage$();
    const rows = this.topProducts();
    return {
      labels: rows.map((r) => r.productName),
      datasets: [
        {
          data: rows.map((r) => r.quantity),
          label: this.translation.translate('statistics.quantitySold'),
          backgroundColor: CHART_COLORS[1]
        }
      ]
    };
  });

  topProductsChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: { x: { beginAtZero: true } }
  };

  /** Payment-method breakdown (doughnut chart), by amount. */
  paymentMethodChartData = computed<ChartConfiguration<'doughnut'>['data']>(() => {
    this.translation.currentLanguage$();
    const rows = this.paymentMethodBreakdown();
    return {
      labels: rows.map((r) => this.translation.translate(`pos.${r.method}`) || r.method),
      datasets: [
        {
          data: rows.map((r) => r.amount),
          backgroundColor: CHART_COLORS
        }
      ]
    };
  });

  paymentMethodChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' } }
  };

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

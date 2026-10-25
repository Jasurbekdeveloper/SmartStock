import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import type { ChartConfiguration } from 'chart.js';
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { CurrencyDisplayPipe } from '../../core/pipes/currency-display.pipe';
import { Sale, SalesService } from '../../core/services/sales.service';
import { Expense, ExpenseService } from '../../core/services/expense.service';
import { TranslationService } from '../../core/services/translation.service';
import { EXPENSE_CATEGORY_ICONS, PnlDay, PnlReport, computePnl, percentChange, pnlByDay } from '../../core/utils/finance';
import { DateRange, PeriodKey, periodRange, previousRange } from '../../core/utils/period';
import { formatNumber } from '../../core/utils/format-number';
import { exportReportsToExcel } from '../../core/utils/excel-export';
import { PeriodPickerComponent } from '../../shared/components/period-picker/period-picker.component';

interface PeriodData {
  sales: Sale[];
  expenses: Expense[];
  loading: boolean;
}

const EMPTY: PeriodData = { sales: [], expenses: [], loading: true };

/** Profit & loss: revenue → cost of goods → gross profit → expenses → net profit. */
@Component({
  selector: 'app-pnl',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule, MatTooltipModule, TranslatePipe, CurrencyDisplayPipe, PeriodPickerComponent, BaseChartDirective],
  providers: [provideCharts(withDefaultRegisterables())],
  templateUrl: './pnl.component.html',
  styleUrl: './pnl.component.css'
})
export class PnlComponent {
  private salesService = inject(SalesService);
  private expenseService = inject(ExpenseService);
  private translation = inject(TranslationService);

  readonly icons = EXPENSE_CATEGORY_ICONS;
  period = signal<PeriodKey>('month');
  range = computed(() => periodRange(this.period()));

  private load(range: DateRange) {
    return combineLatest([
      this.salesService.getSalesInRange(range.from, range.to).pipe(catchError(() => of([] as Sale[]))),
      this.expenseService.getExpenses(range.from, range.to).pipe(catchError(() => of([] as Expense[])))
    ]).pipe(
      // The sales query is a cursor window; trim to the exact range (offline pending sales included).
      map(([sales, expenses]) => ({
        sales: sales.filter((s) => !s.createdAt || new Date(s.createdAt) <= range.to),
        expenses,
        loading: false
      }))
    );
  }

  private current = toSignal(toObservable(this.range).pipe(switchMap((r) => this.load(r))), { initialValue: EMPTY });
  private previous = toSignal(toObservable(this.range).pipe(switchMap((r) => this.load(previousRange(r)))), {
    initialValue: EMPTY
  });

  loading = computed(() => this.current().loading);
  report = computed<PnlReport>(() => computePnl(this.current().sales, this.current().expenses));
  prevReport = computed<PnlReport>(() => computePnl(this.previous().sales, this.previous().expenses));

  readonly netPick = (r: PnlReport) => r.netProfit;
  readonly revenuePick = (r: PnlReport) => r.netRevenue;
  readonly expensePick = (r: PnlReport) => r.expensesTotal;

  delta(pick: (r: PnlReport) => number): number | null {
    return percentChange(pick(this.report()), pick(this.prevReport()));
  }

  /** Daily rows, or monthly ones for spans over two months. */
  trend = computed<PnlDay[]>(() => {
    const { from, to } = this.range();
    const days = pnlByDay(this.current().sales, this.current().expenses, from, to);
    if (days.length <= 62) return days;
    const byMonth = new Map<string, PnlDay>();
    for (const d of days) {
      const key = `${d.date.getFullYear()}-${d.date.getMonth()}`;
      const row = byMonth.get(key) ?? { date: new Date(d.date.getFullYear(), d.date.getMonth(), 1), revenue: 0, grossProfit: 0, expenses: 0, netProfit: 0 };
      row.revenue += d.revenue;
      row.grossProfit += d.grossProfit;
      row.expenses += d.expenses;
      row.netProfit += d.netProfit;
      byMonth.set(key, row);
    }
    return [...byMonth.values()];
  });

  private monthly = computed(() => this.trend().length > 0 && this.trend().length !== Math.round((this.range().to.getTime() - this.range().from.getTime()) / 86_400_000) + 1);

  chartData = computed<ChartConfiguration<'bar'>['data']>(() => {
    const rows = this.trend();
    const fmt = new Intl.DateTimeFormat(undefined, this.monthly() ? { month: 'short' } : { day: '2-digit', month: '2-digit' });
    return {
      labels: rows.map((r) => fmt.format(r.date)),
      datasets: [
        { label: this.translation.translate('finance.revenue'), data: rows.map((r) => r.revenue), backgroundColor: '#36c1ae', borderRadius: 6, maxBarThickness: 28, order: 2 },
        { label: this.translation.translate('navigation.expenses'), data: rows.map((r) => r.expenses), backgroundColor: '#f87171', borderRadius: 6, maxBarThickness: 28, order: 3 },
        {
          type: 'line' as never,
          label: this.translation.translate('finance.netProfit'),
          data: rows.map((r) => r.netProfit),
          borderColor: '#2563eb',
          backgroundColor: '#2563eb',
          borderWidth: 2.5,
          pointRadius: rows.length > 40 ? 0 : 3,
          tension: 0.35,
          order: 1
        }
      ]
    };
  });

  chartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, color: '#8a959e' } },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatNumber(ctx.parsed.y as number, 0)}` } }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#8a959e', maxRotation: 0, autoSkipPadding: 12 } },
      y: { grid: { color: 'rgba(138,149,158,0.15)' }, border: { display: false }, ticks: { color: '#8a959e', callback: (v) => formatNumber(Number(v), 0) } }
    }
  };

  /** Rows of the statement, in reading order. */
  statement = computed(() => {
    const r = this.report();
    type Row = { key: string; value: number; kind: 'plain' | 'minus' | 'subtotal' | 'total'; hint?: string };
    const rows: Row[] = [{ key: 'finance.grossRevenue', value: r.grossRevenue, kind: 'plain' }];
    if (r.refunds > 0) rows.push({ key: 'finance.refunds', value: r.refunds, kind: 'minus' });
    rows.push({ key: 'finance.netRevenue', value: r.netRevenue, kind: 'subtotal' });
    if (r.vat > 0) {
      rows.push({ key: 'finance.vat', value: r.vat, kind: 'minus' });
      rows.push({ key: 'finance.revenueExVat', value: r.revenueExVat, kind: 'subtotal' });
    }
    rows.push({ key: 'finance.cogs', value: r.cogs, kind: 'minus', hint: 'finance.cogsHint' });
    rows.push({ key: 'finance.grossProfit', value: r.grossProfit, kind: 'subtotal' });
    rows.push({ key: 'finance.totalExpenses', value: r.expensesTotal, kind: 'minus' });
    rows.push({ key: 'finance.netProfit', value: r.netProfit, kind: 'total' });
    return rows;
  });

  export() {
    const t = (k: string) => this.translation.translate(k);
    const r = this.report();
    exportReportsToExcel(`foyda-zarar-${this.period()}`, [
      { name: t('navigation.pnl'), rows: this.statement().map((row) => ({ [t('finance.item')]: t(row.key), [t('finance.amount')]: row.kind === 'minus' ? -row.value : row.value })) },
      { name: t('navigation.expenses'), rows: r.expensesByCategory.map((c) => ({ [t('finance.category')]: t('finance.cat.' + c.category), [t('finance.amount')]: c.amount })) },
      {
        name: t('finance.byDay'),
        rows: this.trend().map((d) => ({
          [t('finance.date')]: d.date.toLocaleDateString(),
          [t('finance.revenue')]: d.revenue,
          [t('finance.grossProfit')]: d.grossProfit,
          [t('navigation.expenses')]: d.expenses,
          [t('finance.netProfit')]: d.netProfit
        }))
      }
    ]);
  }
}

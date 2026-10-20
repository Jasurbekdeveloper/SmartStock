import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { Sale, SalesService, saleCardIn, saleCashIn, saleNetProfit, saleNetTotal } from '../core/services/sales.service';
import { roundMoney } from '../core/utils/pos-math';
import { Product, ProductService } from '../core/services/product.service';
import { SettingsService } from '../core/services/settings.service';
import { Customer, Debt, DebtService } from '../core/services/debt.service';
import { NotificationStateService } from '../core/services/notification-state.service';
import { TelegramNotificationService } from '../core/services/telegram-notification.service';
import { ToastService } from '../core/services/toast.service';
import { TranslatePipe } from '../core/pipes/translate.pipe';
import { SumPipe } from '../core/pipes/sum.pipe';
import { CurrencyDisplayPipe } from '../core/pipes/currency-display.pipe';
import { formatNumber } from '../core/utils/format-number';
import {
  debtDueToastStorageKey,
  debtsNeedingTelegramAlert,
  isLowStock,
  isOverdueDebt,
  lowStockToastStorageKey,
  markToastShown,
  productsNeedingTelegramAlert,
  shouldShowToast
} from '../core/utils/low-stock-alert.util';

interface StatCard {
  label: string;
  value: string;
  icon: string;
  /** Full literal Tailwind classes (dynamically built class names get purged). */
  tone: string;
  /** Secondary line under the value, e.g. change vs. yesterday. */
  hint?: string;
  caveat?: string;
}

interface DayBar {
  label: string;
  value: number;
  /** 0–100, relative to the best day in the window. */
  pct: number;
  isToday: boolean;
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    TranslatePipe,
    TranslateModule,
    SumPipe,
    CurrencyDisplayPipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  private settingsService = inject(SettingsService);
  private debtService = inject(DebtService);
  private notificationStateService = inject(NotificationStateService);
  private telegramService = inject(TelegramNotificationService);
  private toastService = inject(ToastService);
  private translateService = inject(TranslateService);

  sales = signal<Sale[]>([]);
  lowStockProducts = signal<Product[]>([]);

  /** Latest snapshots kept around only to drive the one-time low-stock/debt-due alert
   *  check below (`null` until each collection's first snapshot arrives) — not
   *  rendered anywhere, so they stay private. */
  private latestProducts = signal<Product[] | null>(null);
  private latestDebts = signal<Debt[] | null>(null);
  private latestCustomers = signal<Customer[] | null>(null);
  /** Ensures the check (in-app toast + Telegram) runs once per dashboard visit, not
   *  on every subsequent live snapshot update — dedup windows already prevent spam,
   *  but there's no reason to re-run the whole check on every Firestore update. */
  private alertsChecked = false;

  /** One sale = one receipt. Revenue figures are net of returns. */
  todaySales = computed(() => this.sales().filter((s) => sameDay(new Date(s.createdAt), new Date())));
  private yesterdaySales = computed(() => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return this.sales().filter((s) => sameDay(new Date(s.createdAt), y));
  });
  receiptsToday = computed(() => this.todaySales().length);
  todayRevenue = computed(() => roundMoney(this.todaySales().reduce((sum, s) => sum + saleNetTotal(s), 0)));
  private yesterdayRevenue = computed(() => this.yesterdaySales().reduce((sum, s) => sum + saleNetTotal(s), 0));
  avgReceiptValue = computed(() => {
    const count = this.receiptsToday();
    return count > 0 ? this.todayRevenue() / count : 0;
  });
  todayNetProfit = computed(() => this.todaySales().reduce((sum, s) => sum + saleNetProfit(s), 0));

  todayPayments = computed(() => {
    const sales = this.todaySales();
    const cash = sales.reduce((s, x) => s + saleCashIn(x), 0);
    const card = sales.reduce((s, x) => s + saleCardIn(x), 0);
    const debt = sales.reduce((s, x) => s + (x.debtAmount ?? 0), 0);
    const total = cash + card + debt || 1;
    return [
      { key: 'pos.cash', value: cash, pct: (cash / total) * 100, bar: 'bg-emerald-500' },
      { key: 'pos.card', value: card, pct: (card / total) * 100, bar: 'bg-sky-500' },
      { key: 'pos.debit', value: debt, pct: (debt / total) * 100, bar: 'bg-amber-500' }
    ];
  });

  /** Revenue for each of the last 7 days, oldest first. */
  last7Days = computed<DayBar[]>(() => {
    const days: { date: Date; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push({ date: d, value: 0 });
    }
    const first = days[0].date.getTime();
    for (const sale of this.sales()) {
      const t = new Date(sale.createdAt);
      if (t.getTime() < first) continue;
      const day = days.find((d) => sameDay(d.date, t));
      if (day) day.value += saleNetTotal(sale);
    }
    const max = Math.max(1, ...days.map((d) => d.value));
    return days.map((d, i) => ({
      label: d.date.toLocaleDateString(undefined, { weekday: 'short' }),
      value: d.value,
      pct: Math.max(2, (d.value / max) * 100),
      isToday: i === days.length - 1
    }));
  });

  outstandingDebt = computed(() =>
    (this.latestDebts() ?? []).reduce((sum, d) => sum + Math.max(0, d.remainingAmount), 0)
  );

  /** `computed()` rather than a signal set imperatively from `ngOnInit`'s subscribe —
   *  this must also recompute if the currency symbol changes in Settings without a
   *  fresh sale coming in, not only when `sales()` changes. */
  stats = computed<StatCard[]>(() => {
    const symbol = this.settingsService.currencySymbol();
    const money = (v: number) => `${formatNumber(v, 0)} ${symbol}`;
    const yesterday = this.yesterdayRevenue();
    const change = yesterday > 0 ? ((this.todayRevenue() - yesterday) / yesterday) * 100 : null;
    const changeHint = change === null ? undefined : `${change >= 0 ? '▲' : '▼'} ${formatNumber(Math.abs(change), 1)}%`;

    return [
      {
        label: 'dashboard.todayRevenue',
        value: money(this.todayRevenue()),
        icon: 'payments',
        tone: 'bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300',
        hint: changeHint
      },
      {
        label: 'dashboard.receiptsToday',
        value: formatNumber(this.receiptsToday(), 0),
        icon: 'receipt_long',
        tone: 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300'
      },
      {
        label: 'dashboard.avgReceiptValue',
        value: money(this.avgReceiptValue()),
        icon: 'shopping_basket',
        tone: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300'
      },
      {
        label: 'dashboard.todayNetProfit',
        value: money(this.todayNetProfit()),
        icon: 'savings',
        tone: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300',
        caveat: 'dashboard.profitCaveat'
      },
      {
        label: 'dashboard.outstandingDebt',
        value: money(this.outstandingDebt()),
        icon: 'account_balance_wallet',
        tone: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300'
      }
    ];
  });

  constructor(
    private salesService: SalesService,
    private productService: ProductService
  ) {}

  ngOnInit() {
    this.salesService.getSales().subscribe(sales => {
      this.sales.set(sales);
    });

    this.productService.getProducts().subscribe(products => {
      this.lowStockProducts.set(products.filter(isLowStock));
      this.latestProducts.set(products);
      this.tryRunAlertCheck();
    });

    this.debtService.getDebts().subscribe(debts => {
      this.latestDebts.set(debts);
      this.tryRunAlertCheck();
    });

    this.debtService.getCustomers().subscribe(customers => {
      this.latestCustomers.set(customers);
      this.tryRunAlertCheck();
    });
  }

  itemNames(sale: Sale): string {
    return sale.items.map((item) => `${item.productName} x${item.quantity}`).join(', ');
  }

  /** Runs the low-stock/debt-due alert check once products, debts AND customers (for
   *  readable names in the alert text) have all delivered their first snapshot. */
  private tryRunAlertCheck(): void {
    if (this.alertsChecked) return;
    const products = this.latestProducts();
    const debts = this.latestDebts();
    const customers = this.latestCustomers();
    if (products === null || debts === null || customers === null) return;

    this.alertsChecked = true;
    this.showInAppAlerts(products, debts, customers);
    void this.sendTelegramAlerts(products, debts, customers);
  }

  private customerName(customerId: string, customers: Customer[]): string {
    return customers.find(c => c.id === customerId)?.name ?? customerId;
  }

  /** In-app toast, deduped via `localStorage` (inherently per-device, which is fine —
   *  the toast is only ever seen by whoever's browser it fires in). */
  private showInAppAlerts(products: Product[], debts: Debt[], customers: Customer[]): void {
    for (const product of products.filter(isLowStock)) {
      const key = lowStockToastStorageKey(product.id);
      if (!shouldShowToast(key)) continue;
      this.toastService.error(
        this.translateService.instant('dashboard.lowStockAlert', {
          name: product.name,
          quantity: formatNumber(product.quantity, 2),
          unit: this.translateService.instant('units.' + product.unit)
        })
      );
      markToastShown(key);
    }

    for (const debt of debts.filter(isOverdueDebt)) {
      const key = debtDueToastStorageKey(debt.id);
      if (!shouldShowToast(key)) continue;
      this.toastService.error(
        this.translateService.instant('dashboard.debtDueAlert', {
          name: this.customerName(debt.customerId, customers),
          amount: formatNumber(debt.remainingAmount, 0)
        })
      );
      markToastShown(key);
    }
  }

  /** Telegram alert, deduped via the shared `notificationState/telegram` Firestore doc
   *  (so multiple cashiers opening the dashboard the same day don't spam the chat).
   *
   *  This whole check is wrapped in a try/catch: it's a best-effort background
   *  notification, not core functionality, and the dedup doc's one-shot `getDoc()`
   *  rejects outright (rather than silently falling back to a cached/stale read, the
   *  way a live `onSnapshot` listener would) whenever the device has no network and
   *  nothing cached yet -- e.g. a cashier's very first dashboard load of the day
   *  happening while offline. Left unguarded, that rejection surfaces as an unhandled
   *  promise rejection (this `void`-called method has no caller to catch it) on every
   *  such load, even though the rest of the dashboard renders fine from cache. */
  private async sendTelegramAlerts(products: Product[], debts: Debt[], customers: Customer[]): Promise<void> {
    try {
      const state = await this.notificationStateService.getState();

      for (const product of productsNeedingTelegramAlert(products, state)) {
        const sent = await this.telegramService.sendMessage(
          `Kam qoldiq: "${product.name}" — qoldiq ${formatNumber(product.quantity, 2)} ${product.unit} ` +
            `(minimal: ${formatNumber(product.minQuantity ?? 0, 2)}).`
        );
        // Only recorded as "sent" in the shared dedup doc if the message actually went
        // out — a no-op (no token configured yet) must not be treated as sent, or a
        // later-configured token would silently skip it for the rest of the window.
        if (sent) await this.notificationStateService.markLowStockSent(product.id);
      }

      for (const debt of debtsNeedingTelegramAlert(debts, state)) {
        const sent = await this.telegramService.sendMessage(
          `Qarz muddati o'tdi: ${this.customerName(debt.customerId, customers)} — ` +
            `qoldiq ${formatNumber(debt.remainingAmount, 0)} so'm.`
        );
        if (sent) await this.notificationStateService.markDebtDueSent(debt.id);
      }
    } catch (err) {
      console.debug('Telegram alert check skipped (likely offline):', err);
    }
  }
}

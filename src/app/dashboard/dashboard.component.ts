import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Sale, SalesService } from '../core/services/sales.service';
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
  value: string | number;
  icon: string;
  color: string;
  /** i18n key for a caveat tooltip shown next to the label, e.g. clarifying that a
   *  figure only covers data tracked after a feature was added. Omitted for cards
   *  that need no caveat. */
  caveat?: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    TranslatePipe,
    TranslateModule,
    SumPipe,
    CurrencyDisplayPipe,
    MatCardModule,
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

  /** Today's sale documents == today's receipts (one sale = one receipt). */
  todaySales = computed(() =>
    this.sales().filter(s => new Date(s.createdAt).toDateString() === new Date().toDateString())
  );
  receiptsToday = computed(() => this.todaySales().length);
  todayRevenue = computed(() => this.todaySales().reduce((sum, s) => sum + s.total, 0));
  /** Today's total revenue divided by today's receipt count; guards against divide-by-zero. */
  avgReceiptValue = computed(() => {
    const count = this.receiptsToday();
    return count > 0 ? this.todayRevenue() / count : 0;
  });
  /** Sum of today's sales' `totalNetProfit`; `?? 0` keeps pre-feature sales (which
   *  omit the field) from turning the sum into `NaN`. */
  todayNetProfit = computed(() => this.todaySales().reduce((sum, s) => sum + (s.totalNetProfit ?? 0), 0));

  /** `computed()` rather than a signal set imperatively from `ngOnInit`'s subscribe —
   *  this must also recompute if the currency symbol changes in Settings without a
   *  fresh sale coming in, not only when `sales()` changes. */
  stats = computed<StatCard[]>(() => {
    const symbol = this.settingsService.currencySymbol();
    const totalRevenue = this.sales().reduce((sum, s) => sum + s.total, 0);

    return [
      { label: 'dashboard.receiptsToday', value: formatNumber(this.receiptsToday(), 0), icon: 'receipt_long', color: 'blue' },
      { label: 'dashboard.todayRevenue', value: `${formatNumber(this.todayRevenue())} ${symbol}`, icon: 'payments', color: 'green' },
      { label: 'dashboard.totalRevenue', value: `${formatNumber(totalRevenue)} ${symbol}`, icon: 'bar_chart', color: 'purple' },
      { label: 'dashboard.avgReceiptValue', value: `${formatNumber(this.avgReceiptValue())} ${symbol}`, icon: 'trending_up', color: 'orange' },
      {
        label: 'dashboard.todayNetProfit',
        value: `${formatNumber(this.todayNetProfit())} ${symbol}`,
        icon: 'savings',
        color: 'teal',
        caveat: 'dashboard.profitCaveat'
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

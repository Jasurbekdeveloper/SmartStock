import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { AuthService } from '../../core/services/auth.service';
import { homePath, Permission, roleCan } from '../../core/auth/permissions';
import { SidebarStateService } from './sidebar-state.service';
import { SettingsService } from '../../core/services/settings.service';

interface MenuItem {
  label: string;
  path: string;
  icon?: string;
  /** Shown only to roles with this permission (core/auth/permissions.ts). */
  permission?: Permission;
  /** routerLinkActive exact match (for paths that prefix others, e.g. /settings). */
  exact?: boolean;
  /** Marks a recently added section with a small "new" pill. */
  badge?: boolean;
  children?: MenuItem[];
}

interface MenuGroup {
  /** i18n key; empty for the ungrouped top entries. */
  label: string;
  items: MenuItem[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, TranslatePipe],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css'
})
export class SidebarComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  sidebarState = inject(SidebarStateService);
  storeName = inject(SettingsService).storeName;
  storeInitial = computed(() => (this.storeName() || 'M').trim().charAt(0).toUpperCase());

  /** Connection indicator — the POS keeps working offline (Firestore cache), this
   *  just tells the cashier that sales are queued rather than synced. */
  online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  private url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  /** Explicitly toggled submenu; null falls back to the one containing the current page. */
  private manualExpanded = signal<string | null | undefined>(undefined);

  constructor() {
    const update = () => this.online.set(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    });
  }

  private currentUser = toSignal(this.authService.currentUser$, { initialValue: null });

  homePath = computed(() => homePath(this.currentUser()?.role));

  readonly groups: MenuGroup[] = [
    {
      label: '',
      items: [{ label: 'navigation.dashboard', path: '/dashboard', icon: 'space_dashboard', permission: 'reports.view' }]
    },
    {
      label: 'navigation.groupSales',
      items: [
        { label: 'sales.salesHistory', path: '/sales/history', icon: 'receipt_long', permission: 'sales.viewOwn' },
        { label: 'shifts.shiftHistory', path: '/shifts/history', icon: 'schedule', permission: 'shifts.own' },
        { label: 'navigation.debts', path: '/debts/list', icon: 'account_balance_wallet', permission: 'debts.manage' },
        { label: 'navigation.customers', path: '/customers/list', icon: 'groups', permission: 'customers.manage' }
      ]
    },
    {
      label: 'navigation.groupCatalog',
      items: [
        { label: 'navigation.products', path: '/products/list', icon: 'inventory_2', permission: 'products.view' },
        { label: 'categories.title', path: '/products/categories', icon: 'category', permission: 'products.manage' },
        {
          label: 'navigation.stock',
          path: '/stock',
          icon: 'warehouse',
          permission: 'stock.manage',
          children: [
            { label: 'stock.stockIn', path: '/stock/in' },
            { label: 'stock.stockOut', path: '/stock/out' },
            { label: 'stock.adjustment', path: '/stock/adjustment' },
            { label: 'buttons.history', path: '/stock/history' }
          ]
        },
        { label: 'navigation.expiry', path: '/stock/expiry', icon: 'event_busy', permission: 'stock.manage', badge: true },
        { label: 'navigation.suppliers', path: '/suppliers/list', icon: 'local_shipping', permission: 'suppliers.manage' }
      ]
    },
    {
      label: 'navigation.groupFinance',
      items: [
        { label: 'navigation.pnl', path: '/finance/pnl', icon: 'query_stats', permission: 'finance.manage', badge: true },
        { label: 'navigation.expenses', path: '/finance/expenses', icon: 'payments', permission: 'finance.manage', badge: true },
        { label: 'navigation.cashbook', path: '/finance/cash', icon: 'account_balance', permission: 'finance.manage', badge: true },
        { label: 'navigation.statistics', path: '/statistics', icon: 'bar_chart', permission: 'reports.view' }
      ]
    },
    {
      label: 'navigation.groupAdmin',
      items: [
        { label: 'navigation.users', path: '/users', icon: 'badge', permission: 'users.manage' },
        { label: 'navigation.auditLog', path: '/audit-log', icon: 'history', permission: 'auditLog.view' },
        { label: 'navigation.storeSettings', path: '/settings', icon: 'settings', permission: 'settings.manage', exact: true },
        { label: 'subscription.title', path: '/settings/subscription', icon: 'workspace_premium', permission: 'subscription.manage' }
      ]
    }
  ];

  visibleGroups = computed(() => {
    const role = this.currentUser()?.role;
    const canSee = (item: MenuItem) => !item.permission || roleCan(role, item.permission);
    return this.groups
      .map((group) => ({
        ...group,
        items: group.items
          .filter(canSee)
          .map((item) => (item.children ? { ...item, children: item.children.filter(canSee) } : item))
          .filter((item) => !item.children || item.children.length > 0)
      }))
      .filter((group) => group.items.length > 0);
  });

  isExpanded(item: MenuItem): boolean {
    const manual = this.manualExpanded();
    if (manual !== undefined) return manual === item.path;
    return this.url().startsWith(item.path + '/');
  }

  toggle(item: MenuItem) {
    this.manualExpanded.set(this.isExpanded(item) ? null : item.path);
  }

  onNavigate() {
    this.sidebarState.closeMobile();
  }
}

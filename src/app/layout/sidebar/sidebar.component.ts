import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
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
  children?: MenuItem[];
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
  sidebarState = inject(SidebarStateService);
  storeName = inject(SettingsService).storeName;

  /** Connection indicator — the POS keeps working offline (Firestore cache), this
   *  just tells the cashier that sales are queued rather than synced. */
  online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  constructor() {
    const update = () => this.online.set(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    });
  }

  expandedMenu = signal<string | null>(null);

  private currentUser = toSignal(this.authService.currentUser$, { initialValue: null });

  homePath = computed(() => homePath(this.currentUser()?.role));

  visibleMenuItems = computed(() => {
    const role = this.currentUser()?.role;
    const canSee = (item: MenuItem) => !item.permission || roleCan(role, item.permission);
    return this.menuItems
      .filter(canSee)
      .map((item) => (item.children ? { ...item, children: item.children.filter(canSee) } : item))
      .filter((item) => !item.children || item.children.length > 0);
  });

  menuItems: MenuItem[] = [
    { label: 'navigation.dashboard', path: '/dashboard', icon: 'dashboard', permission: 'reports.view' },
    {
      label: 'sales.title',
      path: '/sales',
      icon: 'receipt_long',
      children: [
        { label: 'sales.salesHistory', path: '/sales/history', permission: 'sales.viewOwn' },
        { label: 'shifts.shiftHistory', path: '/shifts/history', permission: 'shifts.own' }
      ]
    },
    {
      label: 'navigation.products',
      path: '/products',
      icon: 'inventory_2',
      children: [
        { label: 'buttons.list', path: '/products/list', permission: 'products.view' },
        { label: 'categories.title', path: '/products/categories', permission: 'products.manage' }
      ]
    },
    {
      label: 'navigation.stock',
      path: '/stock',
      icon: 'move_to_inbox',
      permission: 'stock.manage',
      children: [
        { label: 'stock.stockIn', path: '/stock/in' },
        { label: 'stock.stockOut', path: '/stock/out' },
        { label: 'stock.adjustment', path: '/stock/adjustment' },
        { label: 'buttons.history', path: '/stock/history' }
      ]
    },
    { label: 'navigation.debts', path: '/debts/list', icon: 'credit_card', permission: 'debts.manage' },
    { label: 'navigation.customers', path: '/customers/list', icon: 'people', permission: 'customers.manage' },
    { label: 'navigation.suppliers', path: '/suppliers/list', icon: 'local_shipping', permission: 'suppliers.manage' },
    { label: 'navigation.statistics', path: '/statistics', icon: 'bar_chart', permission: 'reports.view' },
    { label: 'navigation.users', path: '/users', icon: 'group', permission: 'users.manage' },
    { label: 'navigation.auditLog', path: '/audit-log', icon: 'history', permission: 'auditLog.view' },
    {
      label: 'navigation.settings',
      path: '/settings',
      icon: 'settings',
      children: [
        { label: 'navigation.storeSettings', path: '/settings', permission: 'settings.manage' },
        { label: 'subscription.title', path: '/settings/subscription', permission: 'subscription.manage' }
      ]
    }
  ];

  onItemClick(item: MenuItem) {
    if (item.children) {
      this.expandedMenu.set(this.expandedMenu() === item.label ? null : item.label);
    } else {
      this.onNavigate();
    }
  }

  onNavigate() {
    this.sidebarState.closeMobile();
  }
}

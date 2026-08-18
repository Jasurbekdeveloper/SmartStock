import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { AuthService, UserRole } from '../../core/services/auth.service';
import { SidebarStateService } from './sidebar-state.service';

interface MenuItem {
  label: string;
  path: string;
  icon?: string;
  roles?: UserRole[];
  children?: MenuItem[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, MatListModule, MatIconModule, TranslatePipe],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css'
})
export class SidebarComponent {
  private authService = inject(AuthService);
  sidebarState = inject(SidebarStateService);

  expandedMenu = signal<string | null>(null);

  private currentUser = toSignal(this.authService.currentUser$, { initialValue: null });

  visibleMenuItems = computed(() => {
    const role = this.currentUser()?.role;
    const canSee = (item: MenuItem) => !item.roles || (!!role && item.roles.includes(role));
    return this.menuItems
      .filter(canSee)
      .map((item) => (item.children ? { ...item, children: item.children.filter(canSee) } : item));
  });

  menuItems: MenuItem[] = [
    { label: 'navigation.dashboard', path: '/dashboard', icon: 'dashboard' },
    {
      label: 'navigation.pos',
      path: '/pos',
      icon: 'shopping_cart',
      children: [
        { label: 'navigation.pos', path: '/pos' },
        { label: 'sales.salesHistory', path: '/sales/history' },
        { label: 'shifts.shiftHistory', path: '/shifts/history' }
      ]
    },
    {
      label: 'navigation.products',
      path: '/products',
      icon: 'inventory_2',
      children: [
        { label: 'buttons.list', path: '/products/list' },
        { label: 'categories.title', path: '/products/categories', roles: ['admin', 'manager'] }
      ]
    },
    {
      label: 'navigation.stock',
      path: '/stock',
      icon: 'move_to_inbox',
      roles: ['admin', 'manager'],
      children: [
        { label: 'stock.stockIn', path: '/stock/in' },
        { label: 'stock.stockOut', path: '/stock/out' },
        { label: 'stock.adjustment', path: '/stock/adjustment' },
        { label: 'buttons.history', path: '/stock/history' }
      ]
    },
    { label: 'navigation.debts', path: '/debts/list', icon: 'credit_card' },
    { label: 'navigation.customers', path: '/customers/list', icon: 'people' },
    { label: 'navigation.suppliers', path: '/suppliers/list', icon: 'local_shipping', roles: ['admin', 'manager'] },
    { label: 'navigation.statistics', path: '/statistics', icon: 'bar_chart' },
    { label: 'navigation.users', path: '/users', icon: 'group', roles: ['admin'] },
    { label: 'navigation.auditLog', path: '/audit-log', icon: 'history', roles: ['admin', 'manager'] },
    { label: 'navigation.settings', path: '/settings', icon: 'settings', roles: ['admin'] }
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

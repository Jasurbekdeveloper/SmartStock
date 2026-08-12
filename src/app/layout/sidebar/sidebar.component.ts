import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { AuthService, UserRole } from '../../core/services/auth.service';
import { LucideAngularModule, ChartColumn, CreditCard, Inbox, LayoutDashboard, Package, ShoppingCart, Users, Menu } from 'lucide-angular';

interface MenuItem {
  label: string;
  path: string;
  icon?: any;
  roles?: UserRole[];
  children?: MenuItem[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe, LucideAngularModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css'
})
export class SidebarComponent {
  private authService = inject(AuthService);

  isOpen = signal(true);
  expandedMenu = signal<string | null>(null);

  readonly MenuIcon = Menu;

  private currentUser = toSignal(this.authService.currentUser$, { initialValue: null });

  visibleMenuItems = computed(() => {
    const role = this.currentUser()?.role;
    const canSee = (item: MenuItem) => !item.roles || (!!role && item.roles.includes(role));
    return this.menuItems
      .filter(canSee)
      .map((item) => (item.children ? { ...item, children: item.children.filter(canSee) } : item));
  });

  menuItems: MenuItem[] = [
    { label: 'navigation.dashboard', path: '/dashboard', icon: LayoutDashboard },
    {
      label: 'navigation.pos',
      path: '/pos',
      icon: ShoppingCart,
      children: [
        { label: 'navigation.pos', path: '/pos' },
        { label: 'sales.salesHistory', path: '/sales/history' }
      ]
    },
    {
      label: 'navigation.products',
      path: '/products',
      icon: Package,
      children: [
        { label: 'buttons.list', path: '/products/list' },
        { label: 'form.createProduct', path: '/products/create' },
        { label: 'categories.title', path: '/products/categories', roles: ['admin', 'manager'] }
      ]
    },
    {
      label: 'navigation.stock',
      path: '/stock',
      icon: Inbox,
      roles: ['admin', 'manager'],
      children: [
        { label: 'stock.stockIn', path: '/stock/in' },
        { label: 'stock.stockOut', path: '/stock/out' },
        { label: 'stock.adjustment', path: '/stock/adjustment' },
        { label: 'buttons.history', path: '/stock/history' }
      ]
    },
    {
      label: 'navigation.debts',
      path: '/debts',
      icon: CreditCard,
      children: [
        { label: 'buttons.list', path: '/debts/list' },
        { label: 'debts.addDebt', path: '/debts/create' }
      ]
    },
    { label: 'navigation.statistics', path: '/statistics', icon: ChartColumn },
    { label: 'navigation.users', path: '/users', icon: Users, roles: ['admin'] }
  ];

    toggleMenu(item: MenuItem) {
    if (!this.isOpen()) {
      this.isOpen.set(true);
    }

    if (item.children) {
      this.expandedMenu.set(
        this.expandedMenu() === item.label ? null : item.label
      );
    }
  }

  toggleSidebar() {
    this.isOpen.set(!this.isOpen());
  }
}

import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { LucideAngularModule, ChartColumn, CreditCard, Inbox, LayoutDashboard, Package, ShoppingCart, Menu } from 'lucide-angular';

interface MenuItem {
  label: string;
  path: string;
  icon?: any;
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
  isOpen = signal(true);
  expandedMenu = signal<string | null>(null);

  readonly MenuIcon = Menu;

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
        { label: 'form.createProduct', path: '/products/create' }
      ]
    },
    {
      label: 'navigation.stock',
      path: '/stock',
      icon: Inbox,
      children: [
        { label: 'stock.stockIn', path: '/stock/in' },
        { label: 'buttons.history', path: '/stock/history' }
      ]
    },
    { label: 'navigation.debts', path: '/debts', icon: CreditCard },
    { label: 'navigation.statistics', path: '/statistics', icon: ChartColumn }
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

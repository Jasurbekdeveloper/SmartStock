import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslatePipe } from '../../core/pipes/translate.pipe';

interface MenuItem {
  label: string;
  path: string;
  icon?: string;
  children?: MenuItem[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css'
})
export class SidebarComponent {
  isOpen = signal(true);
  expandedMenu = signal<string | null>(null);

  menuItems: MenuItem[] = [
    { label: 'navigation.dashboard', path: '/dashboard', icon: '📊' },
    {
      label: 'navigation.pos',
      path: '/pos',
      icon: '🛒',
      children: [
        { label: 'navigation.pos', path: '/pos' },
        { label: 'sales.salesHistory', path: '/sales/history' }
      ]
    },
    {
      label: 'navigation.products',
      path: '/products',
      icon: '📦',
      children: [
        { label: 'buttons.list', path: '/products/list' },
        { label: 'form.createProduct', path: '/products/create' }
      ]
    },
    {
      label: 'navigation.stock',
      path: '/stock',
      icon: '📥',
      children: [
        { label: 'stock.stockIn', path: '/stock/in' },
        { label: 'buttons.history', path: '/stock/history' }
      ]
    },
    { label: 'navigation.debts', path: '/debts', icon: '💳' },
    { label: 'navigation.statistics', path: '/statistics', icon: '📈' }
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

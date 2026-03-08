import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Sale, SalesService } from '../core/services/sales.service';
import { TranslatePipe } from '../core/pipes/translate.pipe';

interface StatCard {
  label: string;
  value: string | number;
  icon: string;
  color: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  sales = signal<Sale[]>([]);
  stats = signal<StatCard[]>([]);

  constructor(private salesService: SalesService) {}

  ngOnInit() {
    this.salesService.getSales().subscribe(sales => {
      this.sales.set(sales);
      this.calculateStats(sales);
    });
  }

  calculateStats(sales: Sale[]) {
    const todaySales = sales.filter(s =>
      new Date(s.createdAt).toDateString() === new Date().toDateString()
    );

    const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
    const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);

    this.stats.set([
      { label: 'dashboard.todaySales', value: todaySales.length, icon: '🛒', color: 'blue' },
      { label: 'dashboard.todayRevenue', value: '$' + todayRevenue.toFixed(2), icon: '💰', color: 'green' },
      { label: 'dashboard.totalRevenue', value: '$' + totalRevenue.toFixed(2), icon: '📊', color: 'purple' },
      { label: 'dashboard.totalOrders', value: sales.length, icon: '📦', color: 'orange' }
    ]);
  }
}

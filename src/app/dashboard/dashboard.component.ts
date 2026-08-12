import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Sale, SalesService } from '../core/services/sales.service';
import { Product, ProductService } from '../core/services/product.service';
import { TranslatePipe } from '../core/pipes/translate.pipe';
import { SumPipe } from '../core/pipes/sum.pipe';
import { formatNumber } from '../core/utils/format-number';

interface StatCard {
  label: string;
  value: string | number;
  icon: string;
  color: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, TranslatePipe, TranslateModule, SumPipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  sales = signal<Sale[]>([]);
  stats = signal<StatCard[]>([]);
  lowStockProducts = signal<Product[]>([]);

  constructor(
    private salesService: SalesService,
    private productService: ProductService
  ) {}

  ngOnInit() {
    this.salesService.getSales().subscribe(sales => {
      this.sales.set(sales);
      this.calculateStats(sales);
    });

    this.productService.getProducts().subscribe(products => {
      this.lowStockProducts.set(
        products.filter(p => !!p.minQuantity && p.quantity <= p.minQuantity)
      );
    });
  }

  calculateStats(sales: Sale[]) {
    const todaySales = sales.filter(s =>
      new Date(s.createdAt).toDateString() === new Date().toDateString()
    );

    const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
    const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);

    this.stats.set([
      { label: 'dashboard.todaySales', value: formatNumber(todaySales.length, 0), icon: '🛒', color: 'blue' },
      { label: 'dashboard.todayRevenue', value: formatNumber(todayRevenue) + " so'm", icon: '💰', color: 'green' },
      { label: 'dashboard.totalRevenue', value: formatNumber(totalRevenue) + " so'm", icon: '📊', color: 'purple' },
      { label: 'dashboard.totalOrders', value: formatNumber(sales.length, 0), icon: '📦', color: 'orange' }
    ]);
  }
}

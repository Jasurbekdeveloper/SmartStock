import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Sale, SalesService } from '../core/services/sales.service';
import { TranslatePipe } from '../core/pipes/translate.pipe';

@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './statistics.component.html',
  styleUrl: './statistics.component.css'
})
export class StatisticsComponent implements OnInit {
  totalSales = signal(0);
  totalRevenue = signal(0);
  averageOrderValue = signal(0);
  topPaymentMethod = signal('');
  monthlyData = signal<any[]>([]);

  private salesService: SalesService = inject(SalesService);

  ngOnInit() {
    this.salesService.getSales().subscribe(sales => {
      this.calculateStatistics(sales);
    });
  }

  calculateStatistics(sales: Sale[]) {
    this.totalSales.set(sales.length);
    const revenue = sales.reduce((sum, s) => sum + s.total, 0);
    this.totalRevenue.set(revenue);
    this.averageOrderValue.set(
      sales.length > 0 ? revenue / sales.length : 0
    );

    const paymentMethods = new Map<string, number>();
    sales.forEach(s => {
      paymentMethods.set(
        s.paymentMethod,
        (paymentMethods.get(s.paymentMethod) || 0) + 1
      );
    });

    let maxMethod = '';
    let maxCount = 0;
    paymentMethods.forEach((count, method) => {
      if (count > maxCount) {
        maxCount = count;
        maxMethod = method;
      }
    });
    this.topPaymentMethod.set(maxMethod || 'N/A');
  }
}

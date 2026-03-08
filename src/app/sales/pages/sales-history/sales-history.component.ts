import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';import { TranslateModule } from '@ngx-translate/core';import { SalesService, Sale } from '../../../core/services/sales.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-sales-history',
  standalone: true,
  imports: [CommonModule, TranslatePipe, TranslateModule],
  templateUrl: './sales-history.component.html',
  styleUrl: './sales-history.component.css'
})
export class SalesHistoryComponent implements OnInit {
  sales = signal<Sale[]>([]);
  startDate = signal(new Date(new Date().setDate(new Date().getDate() - 30)));
  endDate = signal(new Date());

  constructor(private salesService: SalesService) {}

  ngOnInit() {
    this.loadSales();
  }

  loadSales() {
    this.salesService.getSales().subscribe(sales => {
      this.sales.set(sales);
    });
  }

  exportToCSV() {
    const csv = ['Date,Items,Payment,Total'].concat(
      this.sales().map(s =>
        `${new Date(s.createdAt).toLocaleDateString()},${s.items.length},${s.paymentMethod},$${s.total.toFixed(2)}`
      )
    ).join('\n');

    const link = document.createElement('a');
    link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    link.download = 'sales-history.csv';
    link.click();
  }
}

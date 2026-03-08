import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StockService, StockEntry } from '../../../core/services/stock.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-stock-history',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './stock-history.component.html',
  styleUrl: './stock-history.component.css'
})
export class StockHistoryComponent implements OnInit {
  stockEntries = signal<StockEntry[]>([]);

  private stockService: StockService = inject(StockService);

  ngOnInit() {
    this.stockService.getStockEntries().subscribe(entries => {
      this.stockEntries.set(entries);
    });
  }
}

import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StockService, StockEntry } from '../../../core/services/stock.service';

@Component({
  selector: 'app-stock-in',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './stock-in.component.html',
  styleUrl: './stock-in.component.css'
})
export class StockInComponent {
  newEntry: Partial<StockEntry> = {
    productId: '',
    quantity: 0,
    supplier: '',
    costPrice: 0
  };

  private stockService: StockService = inject(StockService);

  addStock() {
    if (!this.newEntry.productId || !this.newEntry.quantity) {
      alert('Please fill all fields');
      return;
    }

    const entry: StockEntry = {
      id: '',
      productId: this.newEntry.productId!,
      quantity: this.newEntry.quantity!,
      supplier: this.newEntry.supplier || '',
      costPrice: this.newEntry.costPrice || 0,
      totalCost: (this.newEntry.quantity || 0) * (this.newEntry.costPrice || 0),
      createdAt: new Date()
    };

    this.stockService.addStockEntry(entry).subscribe(() => {
      this.newEntry = { productId: '', quantity: 0, supplier: '', costPrice: 0 };
      alert('Stock added successfully');
    });
  }
}

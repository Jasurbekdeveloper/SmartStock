import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Supplier, SupplierService } from '../../../core/services/supplier.service';
import { StockEntry, StockService } from '../../../core/services/stock.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';

@Component({
  selector: 'app-supplier-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    TranslatePipe,
    SumPipe,
    CurrencyDisplayPipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule
  ],
  templateUrl: './supplier-detail.component.html',
  styleUrl: './supplier-detail.component.css'
})
export class SupplierDetailComponent implements OnInit {
  private supplierService = inject(SupplierService);
  private stockService = inject(StockService);
  private route = inject(ActivatedRoute);

  supplier = signal<Supplier | null>(null);
  stockEntries = signal<StockEntry[]>([]);

  totalPurchased = computed(() => this.stockEntries().reduce((sum, e) => sum + (e.totalCost ?? 0), 0));

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    this.supplierService.getSupplierById(id).subscribe({
      next: (supplier) => this.supplier.set(supplier ?? null)
    });

    this.stockService.getStockEntriesBySupplierId(id).subscribe({
      next: (entries) => this.stockEntries.set(entries)
    });
  }
}

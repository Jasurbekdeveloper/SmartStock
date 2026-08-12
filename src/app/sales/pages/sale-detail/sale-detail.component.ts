import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { SalesService, Sale } from '../../../core/services/sales.service';
import { DebtService } from '../../../core/services/debt.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';

@Component({
  selector: 'app-sale-detail',
  standalone: true,
  imports: [CommonModule, TranslatePipe, SumPipe],
  templateUrl: './sale-detail.component.html',
  styleUrl: './sale-detail.component.css'
})
export class SaleDetailComponent implements OnInit {
  private debtService = inject(DebtService);

  sale = signal<Sale | null>(null);
  customers = toSignal(this.debtService.getCustomers(), { initialValue: [] });

  constructor(
    private salesService: SalesService,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.salesService.getSaleById(id).subscribe(sale => {
        this.sale.set(sale ?? null);
      });
    }
  }

  customerName(customerId: string): string {
    return this.customers().find((c) => c.id === customerId)?.name ?? customerId;
  }

  printReceipt() {
    window.print();
  }
}

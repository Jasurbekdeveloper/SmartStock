import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Customer, CustomerService } from '../../../core/services/customer.service';
import { Sale } from '../../../core/services/sales.service';
import { SalesService } from '../../../core/services/sales.service';
import { DebtService } from '../../../core/services/debt.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';

@Component({
  selector: 'app-customer-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    TranslatePipe,
    CurrencyDisplayPipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule
  ],
  templateUrl: './customer-detail.component.html',
  styleUrl: './customer-detail.component.css'
})
export class CustomerDetailComponent implements OnInit {
  private customerService = inject(CustomerService);
  private salesService = inject(SalesService);
  private debtService = inject(DebtService);
  private route = inject(ActivatedRoute);

  customer = signal<Customer | null>(null);
  sales = signal<Sale[]>([]);
  totalRemainingDebt = signal(0);

  purchaseTotal = computed(() => this.sales().reduce((sum, s) => sum + s.total, 0));

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    this.customerService.getCustomerById(id).subscribe({
      next: (customer) => this.customer.set(customer ?? null)
    });

    this.salesService.getSalesByCustomerId(id).subscribe({
      next: (sales) => this.sales.set(sales)
    });

    this.debtService.getCustomerDebts(id).subscribe({
      next: (debts) => this.totalRemainingDebt.set(debts.reduce((sum, d) => sum + d.remainingAmount, 0))
    });
  }
}

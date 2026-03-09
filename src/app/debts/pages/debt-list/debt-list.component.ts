import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DebtService, Debt, Customer } from '../../../core/services/debt.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-debt-list',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './debt-list.component.html',
  styleUrl: './debt-list.component.css'
})
export class DebtListComponent implements OnInit {
  debts = signal<Debt[]>([]);
  private debtService = inject(DebtService);

  ngOnInit() {
    console.log('DebtListComponent initialized');
    this.debtService.getDebts().subscribe(debts => {
      this.debts.set(debts);
    });
    console.log(this.debts());
  }
}
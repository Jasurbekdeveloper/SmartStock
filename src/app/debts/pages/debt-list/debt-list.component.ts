import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { DebtService, Debt } from '../../../core/services/debt.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-debt-list',
  standalone: true,
  imports: [CommonModule, TranslatePipe, TranslateModule],
  templateUrl: './debt-list.component.html',
  styleUrl: './debt-list.component.css'
})
export class DebtListComponent implements OnInit {
  debts = signal<Debt[]>([]);

  private debtService: DebtService = inject(DebtService);

  ngOnInit() {
    this.debtService.getDebts().subscribe(debts => {
      this.debts.set(debts);
    });
  }
}

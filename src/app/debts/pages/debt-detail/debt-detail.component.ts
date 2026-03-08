import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { DebtService, Debt } from '../../../core/services/debt.service';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-debt-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './debt-detail.component.html',
  styleUrl: './debt-detail.component.css'
})
export class DebtDetailComponent implements OnInit {
  debt: Debt | null = null;
  paymentAmount = 0;


  
    private debtService: DebtService = inject(DebtService);
    private route: ActivatedRoute = inject(ActivatedRoute);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.debtService.getDebtById(id).subscribe(debt => {
        this.debt = debt || null;
      });
    }
  }

  payDebt() {
    if (this.debt && this.paymentAmount > 0) {
      this.debtService.payDebt(this.debt.id, this.paymentAmount).subscribe(updatedDebt => {
        this.debt = updatedDebt;
        this.paymentAmount = 0;
        alert('Payment processed successfully');
      });
    }
  }
}

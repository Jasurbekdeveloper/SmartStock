import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { switchMap } from 'rxjs/operators';
import { of } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DebtService } from '../../../core/services/debt.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-debt-create',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TranslatePipe,
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule
  ],
  templateUrl: './debt-create.component.html',
  styleUrl: './debt-create.component.css'
})
export class DebtCreateComponent {
  private debtService = inject(DebtService);
  private router = inject(Router);

  customers = toSignal(this.debtService.getCustomers(), { initialValue: [] });

  isNewCustomer = signal(true);
  selectedCustomerId = '';

  customerName = '';
  customerPhone = '';
  customerAddress = '';

  totalAmount: number | null = null;
  notes = '';
  /** Optional "pay by" date — used later by the dashboard low-stock/debt-due alert
   *  check to flag this debt once it's overdue. */
  dueDate: Date | null = null;

  submitting = signal(false);
  errorKey = signal<string | null>(null);

  submit() {
    if (!this.totalAmount || this.totalAmount <= 0) {
      this.errorKey.set('messages.error');
      return;
    }
    if (this.isNewCustomer() && !this.customerName.trim()) {
      this.errorKey.set('messages.error');
      return;
    }
    if (!this.isNewCustomer() && !this.selectedCustomerId) {
      this.errorKey.set('messages.error');
      return;
    }

    this.submitting.set(true);
    this.errorKey.set(null);

    const customerId$ = this.isNewCustomer()
      ? this.debtService.addCustomer({
          name: this.customerName.trim(),
          phone: this.customerPhone.trim(),
          address: this.customerAddress.trim() || undefined
        })
      : of(this.selectedCustomerId);

    customerId$
      .pipe(
        switchMap((customerId) =>
          this.debtService.createDebt({
            customerId,
            totalAmount: this.totalAmount!,
            notes: this.notes.trim() || undefined,
            dueDate: this.dueDate || undefined
          })
        )
      )
      .subscribe({
        next: () => {
          this.router.navigate(['/debts/list']);
        },
        error: (err) => {
          console.error('Create debt error:', err);
          this.errorKey.set('messages.error');
          this.submitting.set(false);
        }
      });
  }
}

import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Customer, CustomerService } from '../../../core/services/customer.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-customer-create',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TranslatePipe,
    TranslateModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule
  ],
  templateUrl: './customer-create.component.html',
  styleUrl: './customer-create.component.css'
})
export class CustomerCreateComponent {
  private customerService = inject(CustomerService);
  private router = inject(Router);

  submitting = signal(false);
  errorKey = signal<string | null>(null);

  customer: Omit<Customer, 'id'> = {
    name: '',
    phone: '',
    address: '',
    email: ''
  };

  createCustomer() {
    this.submitting.set(true);
    this.errorKey.set(null);

    this.customerService.addCustomer(this.customer).subscribe({
      next: () => {
        this.router.navigate(['/customers/list']);
      },
      error: (err) => {
        console.error('Create customer error:', err);
        this.errorKey.set('messages.error');
        this.submitting.set(false);
      }
    });
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Customer, CustomerService } from '../../../core/services/customer.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-customer-edit',
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
  templateUrl: './customer-edit.component.html',
  styleUrl: './customer-edit.component.css'
})
export class CustomerEditComponent implements OnInit {
  private customerService = inject(CustomerService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  customer = signal<Customer | null>(null);

  submitting = signal(false);
  errorKey = signal<string | null>(null);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.customerService.getCustomerById(id).subscribe({
        next: (customer) => {
          this.customer.set(customer ?? null);
        },
        error: (err) => {
          console.error('Load customer error:', err);
          this.errorKey.set('messages.error');
        }
      });
    }
  }

  updateCustomer() {
    const customer = this.customer();
    if (!customer) return;

    this.submitting.set(true);
    this.errorKey.set(null);

    this.customerService.updateCustomer(customer.id, customer).subscribe({
      next: () => {
        this.router.navigate(['/customers/list']);
      },
      error: (err) => {
        console.error('Update customer error:', err);
        this.errorKey.set('messages.error');
        this.submitting.set(false);
      }
    });
  }
}

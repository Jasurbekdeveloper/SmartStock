import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Supplier, SupplierService } from '../../../core/services/supplier.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-supplier-create',
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
  templateUrl: './supplier-create.component.html',
  styleUrl: './supplier-create.component.css'
})
export class SupplierCreateComponent {
  private supplierService = inject(SupplierService);
  private router = inject(Router);

  submitting = signal(false);
  errorKey = signal<string | null>(null);

  supplier: Omit<Supplier, 'id'> = {
    name: '',
    phone: '',
    address: '',
    contactPerson: '',
    notes: ''
  };

  createSupplier() {
    this.submitting.set(true);
    this.errorKey.set(null);

    this.supplierService.addSupplier(this.supplier).subscribe({
      next: () => {
        this.router.navigate(['/suppliers/list']);
      },
      error: (err) => {
        console.error('Create supplier error:', err);
        this.errorKey.set('messages.error');
        this.submitting.set(false);
      }
    });
  }
}

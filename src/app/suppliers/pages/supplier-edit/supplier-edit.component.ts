import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Supplier, SupplierService } from '../../../core/services/supplier.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-supplier-edit',
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
  templateUrl: './supplier-edit.component.html',
  styleUrl: './supplier-edit.component.css'
})
export class SupplierEditComponent implements OnInit {
  private supplierService = inject(SupplierService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  supplier = signal<Supplier | null>(null);

  submitting = signal(false);
  errorKey = signal<string | null>(null);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.supplierService.getSupplierById(id).subscribe({
        next: (supplier) => {
          this.supplier.set(supplier ?? null);
        },
        error: (err) => {
          console.error('Load supplier error:', err);
          this.errorKey.set('messages.error');
        }
      });
    }
  }

  updateSupplier() {
    const supplier = this.supplier();
    if (!supplier) return;

    this.submitting.set(true);
    this.errorKey.set(null);

    this.supplierService.updateSupplier(supplier.id, supplier).subscribe({
      next: () => {
        this.router.navigate(['/suppliers/list']);
      },
      error: (err) => {
        console.error('Update supplier error:', err);
        this.errorKey.set('messages.error');
        this.submitting.set(false);
      }
    });
  }
}

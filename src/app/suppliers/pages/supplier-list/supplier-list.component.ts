import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatDialog } from '@angular/material/dialog';
import { SupplierService } from '../../../core/services/supplier.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { createPagination } from '../../../core/utils/pagination';
import { normalizeForSearch } from '../../../core/utils/uzbek-transliteration';

@Component({
  selector: 'app-supplier-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TranslatePipe,
    TranslateModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule
  ],
  templateUrl: './supplier-list.component.html',
  styleUrl: './supplier-list.component.css'
})
export class SupplierListComponent {
  private supplierService = inject(SupplierService);
  private router = inject(Router);
  private dialog = inject(MatDialog);

  suppliers = toSignal(this.supplierService.getSuppliers(), { initialValue: [] });

  searchQuery = signal('');

  filteredSuppliers = computed(() => {
    const rawQuery = this.searchQuery().trim();
    const query = rawQuery.toLowerCase();
    if (!query) return this.suppliers();
    // Cross-script normalization (13-band) for name/contact person — phone stays a
    // plain lowercased substring check (numeric, unaffected by script).
    const normalizedQuery = normalizeForSearch(rawQuery);
    return this.suppliers().filter((s) => {
      const matchesName = normalizeForSearch(s.name).includes(normalizedQuery);
      const matchesPhone = s.phone?.toLowerCase().includes(query);
      const matchesContact = s.contactPerson ? normalizeForSearch(s.contactPerson).includes(normalizedQuery) : false;
      return matchesName || matchesPhone || matchesContact;
    });
  });

  pagination = createPagination(this.filteredSuppliers);

  onSearchChange(value: string) {
    this.searchQuery.set(value);
    this.pagination.reset();
  }

  clearFilters() {
    this.searchQuery.set('');
    this.pagination.reset();
  }

  viewSupplier(id: string) {
    this.router.navigate(['/suppliers', id]);
  }

  editSupplier(id: string) {
    this.router.navigate(['/suppliers/edit', id]);
  }

  deleteSupplier(id: string) {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: { titleKey: 'buttons.delete', messageKey: 'suppliers.deleteConfirm' }
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) {
          this.supplierService.deleteSupplier(id).subscribe();
        }
      });
  }
}

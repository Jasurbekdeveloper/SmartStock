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
import { CustomerService } from '../../../core/services/customer.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { createPagination } from '../../../core/utils/pagination';
import { normalizeForSearch } from '../../../core/utils/uzbek-transliteration';

@Component({
  selector: 'app-customer-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TranslatePipe,
    TranslateModule,
    CurrencyDisplayPipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule
  ],
  templateUrl: './customer-list.component.html',
  styleUrl: './customer-list.component.css'
})
export class CustomerListComponent {
  private customerService = inject(CustomerService);
  private router = inject(Router);
  private dialog = inject(MatDialog);

  customers = toSignal(this.customerService.getCustomers(), { initialValue: [] });

  searchQuery = signal('');

  filteredCustomers = computed(() => {
    const rawQuery = this.searchQuery().trim();
    const query = rawQuery.toLowerCase();
    if (!query) return this.customers();
    // Cross-script normalization (13-band) for the name only — phone stays a plain
    // lowercased substring check (it's numeric, unaffected by script).
    const normalizedQuery = normalizeForSearch(rawQuery);
    return this.customers().filter((c) => {
      const matchesName = normalizeForSearch(c.name).includes(normalizedQuery);
      const matchesPhone = c.phone?.toLowerCase().includes(query);
      return matchesName || matchesPhone;
    });
  });

  pagination = createPagination(this.filteredCustomers);

  onSearchChange(value: string) {
    this.searchQuery.set(value);
    this.pagination.reset();
  }

  clearFilters() {
    this.searchQuery.set('');
    this.pagination.reset();
  }

  viewCustomer(id: string) {
    this.router.navigate(['/customers', id]);
  }

  editCustomer(id: string) {
    this.router.navigate(['/customers/edit', id]);
  }

  deleteCustomer(id: string) {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: { titleKey: 'buttons.delete', messageKey: 'customers.deleteConfirm' }
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) {
          this.customerService.deleteCustomer(id).subscribe();
        }
      });
  }
}

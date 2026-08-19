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
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatDialog } from '@angular/material/dialog';
import { Product, ProductService } from '../../../core/services/product.service';
import { CategoryService } from '../../../core/services/category.service';
import { AuthService } from '../../../core/services/auth.service';
import { AuditLogService } from '../../../core/services/audit-log.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';
import { BarcodeLabelDialogComponent } from '../../../shared/components/barcode-label-dialog/barcode-label-dialog.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { createPagination } from '../../../core/utils/pagination';
import { normalizeForSearch } from '../../../core/utils/uzbek-transliteration';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TranslatePipe,
    TranslateModule,
    SumPipe,
    CurrencyDisplayPipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatPaginatorModule
  ],
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.css'
})
export class ProductListComponent {
  private productService = inject(ProductService);
  private categoryService = inject(CategoryService);
  private authService = inject(AuthService);
  private auditLogService = inject(AuditLogService);
  private router = inject(Router);
  private dialog = inject(MatDialog);

  products = toSignal(this.productService.getProducts(), { initialValue: [] });
  categories = toSignal(this.categoryService.getCategories(), { initialValue: [] });

  private currentUser = toSignal(this.authService.currentUser$, { initialValue: null });
  /** Cost price is purchasing/margin data — cashiers only need the selling price. */
  canSeeCost = computed(() => this.currentUser()?.role !== 'cashier');
  /** Bulk import creates/edits products in full (name/price/etc.), which
   *  `firestore.rules`' isStaff() restricts to admin/manager — same gating as
   *  the /products/import route's roleGuard. */
  canImport = computed(() => {
    const role = this.currentUser()?.role;
    return role === 'admin' || role === 'manager';
  });

  searchQuery = signal('');
  fromDate = signal<Date | null>(null);
  toDate = signal<Date | null>(null);

  filteredProducts = computed(() => {
    const rawQuery = this.searchQuery().trim();
    const query = rawQuery.toLowerCase();
    // Cross-script normalization (13-band) so a query typed in Cyrillic matches a
    // Latin product name and vice versa. Barcode matching is unaffected — still a
    // plain lowercased substring check.
    const normalizedQuery = normalizeForSearch(rawQuery);
    const from = this.fromDate();
    const to = this.toDate();

    return this.products().filter((product) => {
      if (query) {
        const matchesName = normalizeForSearch(product.name).includes(normalizedQuery);
        const matchesBarcode = product.barcode?.toLowerCase().includes(query);
        // Optional per-product synonyms/loanwords (e.g. "truba" tagged on a product
        // actually named "quvur") — same cross-script normalization as the name match.
        const matchesKeyword =
          product.searchKeywords?.some((keyword) => normalizeForSearch(keyword).includes(normalizedQuery)) ?? false;
        if (!matchesName && !matchesBarcode && !matchesKeyword) return false;
      }

      if (from || to) {
        if (!product.createdAt) return false;
        const createdAt = new Date(product.createdAt);
        if (from && createdAt < from) return false;
        if (to) {
          const toEnd = new Date(to);
          toEnd.setHours(23, 59, 59, 999);
          if (createdAt > toEnd) return false;
        }
      }

      return true;
    });
  });

  pagination = createPagination(this.filteredProducts);

  clearFilters() {
    this.searchQuery.set('');
    this.fromDate.set(null);
    this.toDate.set(null);
    this.pagination.reset();
  }

  onSearchChange(value: string) {
    this.searchQuery.set(value);
    this.pagination.reset();
  }

  onFromDateChange(value: Date | null) {
    this.fromDate.set(value);
    this.pagination.reset();
  }

  onToDateChange(value: Date | null) {
    this.toDate.set(value);
    this.pagination.reset();
  }

  categoryName(categoryId: string): string {
    return this.categories().find((c) => c.id === categoryId)?.name ?? '';
  }

  showBarcode(product: Product) {
    this.dialog.open(BarcodeLabelDialogComponent, {
      data: { title: product.name, subtitle: product.barcode, value: product.barcode || product.id }
    });
  }

  isLowStock(product: Product): boolean {
    return !!product.minQuantity && product.quantity <= product.minQuantity;
  }

  deleteProduct(product: Product) {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: { titleKey: 'buttons.delete', messageKey: 'products.deleteConfirm' }
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) {
          // Log right after the delete actually succeeds — a delete that fails
          // shouldn't produce a log entry claiming it happened.
          this.productService.deleteProduct(product.id).subscribe(() => {
            this.auditLogService
              .log({
                action: 'product_delete',
                entityType: 'product',
                entityId: product.id,
                before: product,
                after: undefined
              })
              .subscribe();
          });
        }
      });
  }

  editProduct(id: string) {
    this.router.navigate(['/products/edit', id]);
  }
}

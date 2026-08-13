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
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { SumPipe } from '../../../core/pipes/sum.pipe';
import { QrCodeDialogComponent } from '../../../shared/components/qr-code-dialog/qr-code-dialog.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { createPagination } from '../../../core/utils/pagination';

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
  private router = inject(Router);
  private dialog = inject(MatDialog);

  products = toSignal(this.productService.getProducts(), { initialValue: [] });
  categories = toSignal(this.categoryService.getCategories(), { initialValue: [] });

  private currentUser = toSignal(this.authService.currentUser$, { initialValue: null });
  /** Cost price is purchasing/margin data — cashiers only need the selling price. */
  canSeeCost = computed(() => this.currentUser()?.role !== 'cashier');

  searchQuery = signal('');
  fromDate = signal<Date | null>(null);
  toDate = signal<Date | null>(null);

  filteredProducts = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const from = this.fromDate();
    const to = this.toDate();

    return this.products().filter((product) => {
      if (query) {
        const matchesName = product.name.toLowerCase().includes(query);
        const matchesBarcode = product.barcode?.toLowerCase().includes(query);
        if (!matchesName && !matchesBarcode) return false;
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

  showQr(product: Product) {
    this.dialog.open(QrCodeDialogComponent, {
      data: { title: product.name, subtitle: product.barcode, value: product.barcode || product.id }
    });
  }

  isLowStock(product: Product): boolean {
    return !!product.minQuantity && product.quantity <= product.minQuantity;
  }

  deleteProduct(id: string) {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: { titleKey: 'buttons.delete', messageKey: 'products.deleteConfirm' }
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) {
          this.productService.deleteProduct(id).subscribe();
        }
      });
  }

  editProduct(id: string) {
    this.router.navigate(['/products/edit', id]);
  }
}

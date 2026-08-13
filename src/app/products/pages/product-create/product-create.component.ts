import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Product, ProductService } from '../../../core/services/product.service';
import { CategoryService } from '../../../core/services/category.service';
import { AuthService } from '../../../core/services/auth.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { PRODUCT_UNITS } from '../../../core/constants/units';

@Component({
  selector: 'app-product-create',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TranslatePipe,
    TranslateModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule
  ],
  templateUrl: './product-create.component.html',
  styleUrl: './product-create.component.css'
})
export class ProductCreateComponent {
  private productService = inject(ProductService);
  private categoryService = inject(CategoryService);
  private authService = inject(AuthService);
  private router = inject(Router);

  categories = toSignal(this.categoryService.getCategories(), { initialValue: [] });
  readonly units = PRODUCT_UNITS;

  private currentUser = toSignal(this.authService.currentUser$, { initialValue: null });
  /** Cost price is purchasing/margin data — cashiers only need the selling price. */
  canSeeCost = computed(() => this.currentUser()?.role !== 'cashier');

  submitting = signal(false);
  errorKey = signal<string | null>(null);

  product: Omit<Product, 'id'> = {
    name: '',
    barcode: '',
    price: 0,
    cost: 0,
    quantity: 0,
    unit: 'dona',
    minQuantity: 0,
    categoryId: ''
  };

  createProduct() {
    this.submitting.set(true);
    this.errorKey.set(null);

    this.productService.addProduct(this.product).subscribe({
      next: () => {
        this.router.navigate(['/products/list']);
      },
      error: (err) => {
        console.error('Create product error:', err);
        this.errorKey.set('messages.error');
        this.submitting.set(false);
      }
    });
  }
}

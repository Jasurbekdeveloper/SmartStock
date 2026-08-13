import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
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
  selector: 'app-product-edit',
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
  templateUrl: './product-edit.component.html',
  styleUrl: './product-edit.component.css'
})
export class ProductEditComponent implements OnInit {
  private productService = inject(ProductService);
  private categoryService = inject(CategoryService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  categories = toSignal(this.categoryService.getCategories(), { initialValue: [] });
  readonly units = PRODUCT_UNITS;
  product = signal<Product | null>(null);

  private currentUser = toSignal(this.authService.currentUser$, { initialValue: null });
  /** Cost price is purchasing/margin data — cashiers only need the selling price. */
  canSeeCost = computed(() => this.currentUser()?.role !== 'cashier');

  submitting = signal(false);
  errorKey = signal<string | null>(null);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.productService.getProductById(id).subscribe({
        next: (product) => {
          this.product.set(product ?? null);
        },
        error: (err) => {
          console.error('Load product error:', err);
          this.errorKey.set('messages.error');
        }
      });
    }
  }

  updateProduct() {
    const product = this.product();
    if (!product) return;

    this.submitting.set(true);
    this.errorKey.set(null);

    this.productService.updateProduct(product.id, product).subscribe({
      next: () => {
        this.router.navigate(['/products/list']);
      },
      error: (err) => {
        console.error('Update product error:', err);
        this.errorKey.set('messages.error');
        this.submitting.set(false);
      }
    });
  }
}

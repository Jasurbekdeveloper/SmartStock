import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Product, ProductService } from '../../../core/services/product.service';
import { CategoryService } from '../../../core/services/category.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe, TranslateModule],
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.css'
})
export class ProductListComponent {
  private productService = inject(ProductService);
  private categoryService = inject(CategoryService);
  private router = inject(Router);

  products = toSignal(this.productService.getProducts(), { initialValue: [] });
  categories = toSignal(this.categoryService.getCategories(), { initialValue: [] });

  categoryName(categoryId: string): string {
    return this.categories().find((c) => c.id === categoryId)?.name ?? '';
  }

  isLowStock(product: Product): boolean {
    return !!product.minQuantity && product.quantity <= product.minQuantity;
  }

  deleteProduct(id: string) {
    if (confirm('Are you sure?')) {
      this.productService.deleteProduct(id).subscribe();
    }
  }

  editProduct(id: string) {
    this.router.navigate(['/products/edit', id]);
  }
}

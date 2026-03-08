import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';import { TranslateModule } from '@ngx-translate/core';import { Product, ProductService } from '../../../core/services/product.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe, TranslateModule],
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.css'
})
export class ProductListComponent implements OnInit {
  products = signal<Product[]>([]);

  constructor(
    private productService: ProductService,
    private router: Router
  ) {}

  ngOnInit() {
    this.productService.getProducts().subscribe(products => {
      this.products.set(products);
    });
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

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Product, ProductService } from '../../../core/services/product.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-product-create',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, TranslateModule],
  templateUrl: './product-create.component.html',
  styleUrl: './product-create.component.css'
})
export class ProductCreateComponent {
  product: Product = {
    id: '',
    name: '',
    barcode: '',
    price: 0,
    cost: 0,
    quantity: 0,
    unit: 'pcs',
    category: ''
  };

  constructor(
    private productService: ProductService,
    private router: Router
  ) {}

  createProduct() {
    this.productService.addProduct(this.product).subscribe(() => {
      this.router.navigate(['/products/list']);
    });
  }
}

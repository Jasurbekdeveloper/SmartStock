import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Product, ProductService } from '../core/services/product.service';

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './pos.component.html',
  styleUrl: './pos.component.css'
})
export class PosComponent implements OnInit {
  products = signal<Product[]>([]);
  cart = signal<CartItem[]>([]);
  searchQuery = signal('');
  filteredProducts = signal<Product[]>([]);
  selectedPaymentMethod = signal<'cash' | 'card' | 'check'>('cash');
  showPaymentModal = signal(false);
  paidAmount = signal(0);

  constructor(private productService: ProductService) {}

  ngOnInit() {
    this.productService.getProducts().subscribe(products => {
      this.products.set(products);
      this.filteredProducts.set(products);
    });
  }

  searchProducts() {
    const query = this.searchQuery().toLowerCase();
    const filtered = this.products().filter(p =>
      p.name.toLowerCase().includes(query) || p.barcode.includes(query)
    );
    this.filteredProducts.set(filtered);
  }

  addToCart(product: Product) {
    const existingItem = this.cart().find(item => item.productId === product.id);

    if (existingItem) {
      existingItem.quantity++;
      existingItem.total = existingItem.quantity * existingItem.price;
    } else {
      this.cart.update(cart => [...cart, {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        price: product.price,
        total: product.price
      }]);
      return;
    }

    this.cart.set([...this.cart()]);
  }

  removeFromCart(productId: string) {
    this.cart.set(this.cart().filter(item => item.productId !== productId));
  }

  updateQuantity(productId: string, quantity: number) {
    const item = this.cart().find(i => i.productId === productId);
    if (item && quantity > 0) {
      item.quantity = quantity;
      item.total = quantity * item.price;
      this.cart.set([...this.cart()]);
    }
  }

  updatePrice(productId: string, price: number) {
    const item = this.cart().find(i => i.productId === productId);
    if (item && price > 0) {
      item.price = price;
      item.total = item.quantity * price;
      this.cart.set([...this.cart()]);
    }
  }

  getSubtotal() {
    return this.cart().reduce((sum, item) => sum + item.total, 0);
  }

  getTax() {
    return this.getSubtotal() * 0.1;
  }

  getTotal() {
    return this.getSubtotal() + this.getTax();
  }

  getChange() {
    return Math.max(0, this.paidAmount() - this.getTotal());
  }

  completeSale() {
    if (this.cart().length === 0) {
      alert('Cart is empty');
      return;
    }

    if (this.paidAmount() < this.getTotal()) {
      alert('Insufficient payment');
      return;
    }

    alert('Sale completed! Change: $' + this.getChange().toFixed(2));
    this.clearCart();
  }

  clearCart() {
    this.cart.set([]);
    this.searchQuery.set('');
    this.paidAmount.set(0);
    this.showPaymentModal.set(false);
  }
}

interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
}

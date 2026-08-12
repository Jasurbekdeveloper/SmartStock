import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Product, ProductService } from '../core/services/product.service';
import { Sale, SaleItem, SalesService } from '../core/services/sales.service';
import { TranslationService } from '../core/services/translation.service';

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
  selectedPaymentMethod = signal<'cash' | 'card' | 'debit'>('cash');
  showPaymentModal = signal(false);
  paidAmount = signal(0);
  submitting = signal(false);

  private productService: ProductService = inject(ProductService);
  private salesService: SalesService = inject(SalesService);
  private translation: TranslationService = inject(TranslationService);

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

  subtotal = computed(() => 
  this.cart().reduce((sum, item) => sum + item.total, 0)
);

  /** O'zbekiston QQS (VAT) stavkasi. */
  private readonly taxRate = 0.12;

  tax = computed(() => this.subtotal() * this.taxRate);

  total = computed(() => this.subtotal() + this.tax());

  change = computed(() =>
    Math.max(0, this.paidAmount() - this.total())
  );

  insufficient = computed(() => this.paidAmount() < this.total());

  quickAmounts = computed(() => {
    const total = this.total();
    if (total <= 0) return [];
    const roundUp = (value: number, step: number) => Math.ceil(value / step) * step;
    const amounts = [total, roundUp(total, 10000), roundUp(total, 50000), roundUp(total, 100000)];
    return Array.from(new Set(amounts.map(a => Math.round(a)))).sort((a, b) => a - b);
  });

  openPaymentModal() {
    this.paidAmount.set(Math.ceil(this.total()));
    this.showPaymentModal.set(true);
  }

  setPaidAmount(amount: number) {
    this.paidAmount.set(amount);
  }

  completeSale() {
    if (this.cart().length === 0 || this.insufficient()) {
      return;
    }

    this.submitting.set(true);

    const items: SaleItem[] = this.cart().map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      price: item.price,
      total: item.total
    }));

    const sale: Omit<Sale, 'id' | 'createdAt'> = {
      items,
      subtotal: this.subtotal(),
      tax: this.tax(),
      total: this.total(),
      paymentMethod: this.selectedPaymentMethod(),
      paidAmount: this.paidAmount(),
      change: this.change()
    };

    this.salesService.createSale(sale).subscribe({
      next: () => {
        this.reduceStock(items);
        this.submitting.set(false);
        alert(this.translation.translate('pos.saleCompleted') + ': ' + this.change().toFixed(2) + " so'm");
        this.clearCart();
      },
      error: (err) => {
        console.error('Create sale error:', err);
        this.submitting.set(false);
        alert(this.translation.translate('pos.saleError'));
      }
    });
  }

  private reduceStock(items: SaleItem[]) {
    for (const item of items) {
      this.productService.adjustQuantity(item.productId, -item.quantity).subscribe({
        error: (err) => console.error('Reduce stock error:', err)
      });
    }
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

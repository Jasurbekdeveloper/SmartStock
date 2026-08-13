import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Product, ProductService } from '../core/services/product.service';
import { Category, CategoryService } from '../core/services/category.service';
import { Sale, SaleDebtInput, SaleItem, SalesService } from '../core/services/sales.service';
import { DebtService } from '../core/services/debt.service';
import { TranslationService } from '../core/services/translation.service';
import { ToastService } from '../core/services/toast.service';
import { SumPipe } from '../core/pipes/sum.pipe';
import { formatNumber } from '../core/utils/format-number';
import { PosPaymentDialogComponent, PosPaymentDialogResult } from './pos-payment-dialog/pos-payment-dialog.component';

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, SumPipe, MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './pos.component.html',
  styleUrl: './pos.component.css'
})
export class PosComponent implements OnInit {
  products = signal<Product[]>([]);
  cart = signal<CartItem[]>([]);
  searchQuery = signal('');
  selectedCategoryId = signal<string | null>(null);
  selectedPaymentMethod = signal<'cash' | 'card'>('cash');
  paidAmount = signal(0);
  discount = signal(0);
  submitting = signal(false);

  private productService: ProductService = inject(ProductService);
  private categoryService: CategoryService = inject(CategoryService);
  private salesService: SalesService = inject(SalesService);
  private debtService: DebtService = inject(DebtService);
  private translation: TranslationService = inject(TranslationService);
  private toast: ToastService = inject(ToastService);
  private dialog: MatDialog = inject(MatDialog);

  categories = toSignal(this.categoryService.getCategories(), { initialValue: [] });
  sales = toSignal(this.salesService.getSales(), { initialValue: [] });

  customers = toSignal(this.debtService.getCustomers(), { initialValue: [] });
  isNewCustomer = signal(true);
  selectedCustomerId = signal('');
  customerName = signal('');
  customerPhone = signal('');

  ngOnInit() {
    this.productService.getProducts().subscribe(products => {
      this.products.set(products);
    });
  }

  /** How many units of each category have ever sold — drives the "most sold first" card order. */
  private categorySoldQty = computed(() => {
    const counts = new Map<string, number>();
    for (const sale of this.sales()) {
      for (const item of sale.items) {
        if (!item.categoryId) continue;
        counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + item.quantity);
      }
    }
    return counts;
  });

  sortedCategories = computed(() => {
    const counts = this.categorySoldQty();
    return this.categories()
      .slice()
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  });

  /** Category cards are shown only when browsing (no search, no category picked yet). */
  showCategoryCards = computed(() => !this.searchQuery().trim() && !this.selectedCategoryId());

  displayedProducts = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (query) {
      return this.products().filter(
        (p) => p.name.toLowerCase().includes(query) || p.barcode.includes(query)
      );
    }
    if (this.selectedCategoryId()) {
      return this.products().filter((p) => p.categoryId === this.selectedCategoryId());
    }
    return [];
  });

  selectedCategoryName(): string {
    return this.categories().find((c) => c.id === this.selectedCategoryId())?.name ?? '';
  }

  selectCategory(category: Category) {
    this.selectedCategoryId.set(category.id);
  }

  backToCategories() {
    this.selectedCategoryId.set(null);
    this.searchQuery.set('');
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
        categoryId: product.categoryId,
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

  /** What's actually owed once the cashier's discount is applied at checkout. */
  finalTotal = computed(() => Math.max(0, this.total() - this.discount()));

  change = computed(() =>
    Math.max(0, this.paidAmount() - this.finalTotal())
  );

  /** Unpaid remainder that would need to go on a customer's debt. */
  debtAmount = computed(() => Math.max(0, this.finalTotal() - this.paidAmount()));

  hasDebtPortion = computed(() => this.debtAmount() > 0);

  canSubmit = computed(() => this.cart().length > 0 && !this.submitting());

  openPaymentDialog() {
    this.dialog
      .open(PosPaymentDialogComponent, {
        width: '420px',
        data: { total: this.total(), customers: this.customers() }
      })
      .afterClosed()
      .subscribe((result: PosPaymentDialogResult | undefined) => {
        if (!result) return;

        this.selectedPaymentMethod.set(result.paymentMethod);
        this.paidAmount.set(result.paidAmount);
        this.discount.set(result.discount);
        this.isNewCustomer.set(result.isNewCustomer);
        this.selectedCustomerId.set(result.customerId ?? '');
        this.customerName.set(result.customerName ?? '');
        this.customerPhone.set(result.customerPhone ?? '');

        this.completeSale();
      });
  }

  completeSale() {
    if (!this.canSubmit()) {
      return;
    }

    this.submitting.set(true);

    const items: SaleItem[] = this.cart().map((item) => ({
      productId: item.productId,
      productName: item.productName,
      categoryId: item.categoryId,
      quantity: item.quantity,
      price: item.price,
      total: item.total
    }));

    const debtPortion = this.debtAmount();
    const change = this.change();

    const discount = this.discount();

    const sale: Omit<Sale, 'id' | 'createdAt'> = {
      items,
      subtotal: this.subtotal(),
      tax: this.tax(),
      total: this.finalTotal(),
      paymentMethod: this.selectedPaymentMethod(),
      paidAmount: this.paidAmount(),
      change,
      ...(discount > 0 ? { discount } : {})
    };

    let debt: SaleDebtInput | undefined;
    if (debtPortion > 0) {
      debt = this.isNewCustomer()
        ? { amount: debtPortion, newCustomer: { name: this.customerName().trim(), phone: this.customerPhone().trim() } }
        : { amount: debtPortion, customerId: this.selectedCustomerId() };
    }

    this.salesService.createSale(sale, debt).subscribe({
      next: () => {
        this.reduceStock(items);
        this.submitting.set(false);
        this.toast.success(this.translation.translate('pos.saleCompleted') + ': ' + formatNumber(change) + " so'm");
        this.clearCart();
      },
      error: (err) => {
        console.error('Create sale error:', err);
        this.submitting.set(false);
        this.toast.error(this.translation.translate('pos.saleError'));
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
    this.selectedCategoryId.set(null);
    this.paidAmount.set(0);
    this.discount.set(0);
    this.isNewCustomer.set(true);
    this.selectedCustomerId.set('');
    this.customerName.set('');
    this.customerPhone.set('');
  }
}

interface CartItem {
  productId: string;
  productName: string;
  categoryId: string;
  quantity: number;
  price: number;
  total: number;
}

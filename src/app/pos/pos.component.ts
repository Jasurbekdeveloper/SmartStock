import { Component, ElementRef, HostListener, OnInit, ViewChild, signal, inject, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { Product, ProductService } from '../core/services/product.service';
import { Category, CategoryService } from '../core/services/category.service';
import { Sale, SaleDebtInput, SaleItem, SalesService } from '../core/services/sales.service';
import { DebtService } from '../core/services/debt.service';
import { AuthService } from '../core/services/auth.service';
import { Shift, ShiftService } from '../core/services/shift.service';
import { TranslationService } from '../core/services/translation.service';
import { ToastService } from '../core/services/toast.service';
import { SettingsService } from '../core/services/settings.service';
import { SumPipe } from '../core/pipes/sum.pipe';
import { CurrencyDisplayPipe } from '../core/pipes/currency-display.pipe';
import { formatNumber } from '../core/utils/format-number';
import { PosPaymentDialogComponent, PosPaymentDialogResult } from './pos-payment-dialog/pos-payment-dialog.component';
import { ConfirmDialogComponent } from '../shared/components/confirm-dialog/confirm-dialog.component';
import { createScannerGunDetector } from '../core/utils/scanner-input.util';
import { normalizeForSearch } from '../core/utils/uzbek-transliteration';

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TranslateModule,
    SumPipe,
    CurrencyDisplayPipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatMenuModule,
    MatBadgeModule
  ],
  templateUrl: './pos.component.html',
  styleUrl: './pos.component.css'
})
export class PosComponent implements OnInit {
  products = signal<Product[]>([]);
  cart = signal<CartItem[]>([]);

  /** Carts a cashier has "held" mid-sale (e.g. a customer stepped away) so another
   *  customer can be served without losing the in-progress cart. Local-first by
   *  design (per plan) — persisted to localStorage only, not Firestore, since this
   *  is a single-device convenience feature. */
  heldCarts = signal<HeldCart[]>(this.loadHeldCartsFromStorage());

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
  private authService: AuthService = inject(AuthService);
  private shiftService: ShiftService = inject(ShiftService);
  private translation: TranslationService = inject(TranslationService);
  private toast: ToastService = inject(ToastService);
  private settingsService: SettingsService = inject(SettingsService);
  private dialog: MatDialog = inject(MatDialog);

  private scannerGun = createScannerGunDetector();
  /** Suppresses the global scanner listener while a dialog (payment/camera-scanner/confirm) is open. */
  private dialogOpen = signal(false);

  /** Keeps held carts in sync with localStorage on every change, so they survive a
   *  page reload (zoneless-safe: reacts off the signal, never a plain field write). */
  private readonly persistHeldCartsEffect = effect(() => {
    try {
      localStorage.setItem(HELD_CARTS_STORAGE_KEY, JSON.stringify(this.heldCarts()));
    } catch (err) {
      console.error('Persist held carts error:', err);
    }
  });

  /** Search input, so F2 can jump focus to it from anywhere on the page. */
  @ViewChild('searchInput') private searchInputRef?: ElementRef<HTMLInputElement>;

  categories = toSignal(this.categoryService.getCategories(), { initialValue: [] });
  sales = toSignal(this.salesService.getSales(), { initialValue: [] });

  customers = toSignal(this.debtService.getCustomers(), { initialValue: [] });
  isNewCustomer = signal(true);
  selectedCustomerId = signal('');
  customerName = signal('');
  customerPhone = signal('');

  currentUser = toSignal(this.authService.currentUser$, { initialValue: null });

  /** The cashier's currently open shift, if any. Soft enforcement only (see banner in
   * the template) — checkout is never hard-blocked by a missing shift, per the plan. */
  activeShift = signal<Shift | undefined>(undefined);
  startingCashInput = signal(0);
  openingShift = signal(false);

  ngOnInit() {
    this.productService.getProducts().subscribe(products => {
      this.products.set(products);
    });

    this.authService.currentUser$
      .pipe(switchMap((user) => (user ? this.shiftService.getOpenShiftForUser(user.uid) : of(undefined))))
      .subscribe((shift) => this.activeShift.set(shift));
  }

  openShiftInline() {
    const user = this.currentUser();
    if (!user || this.startingCashInput() < 0) return;

    this.openingShift.set(true);
    this.shiftService.openShift(user.uid, user.displayName, this.startingCashInput()).subscribe({
      next: () => {
        this.openingShift.set(false);
        this.startingCashInput.set(0);
        // activeShift updates on its own — getOpenShiftForUser() is a live onSnapshot query.
      },
      error: (err) => {
        console.error('Open shift error:', err);
        this.openingShift.set(false);
        this.toast.error(this.translation.translate('shifts.shiftOpenError'));
      }
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
    const query = this.searchQuery().trim();
    if (query) {
      // Name matching goes through cross-script normalization (13-band) so a query
      // typed in Cyrillic matches a Latin product name and vice versa. Barcode
      // matching stays the original plain numeric substring check, unaffected.
      const normalizedQuery = normalizeForSearch(query);
      const barcodeQuery = query.toLowerCase();
      return this.products().filter(
        (p) => normalizeForSearch(p.name).includes(normalizedQuery) || p.barcode.includes(barcodeQuery)
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
      // Barcode scans/repeat clicks always add 1 primary unit, regardless of which
      // unit the line is currently displayed in.
      existingItem.quantity++;
      existingItem.total = this.computeLineTotal(existingItem.quantity, existingItem.price, existingItem.discount);
    } else {
      this.cart.update(cart => [...cart, {
        productId: product.id,
        productName: product.name,
        categoryId: product.categoryId,
        quantity: 1,
        price: product.price,
        total: product.price,
        discount: 0,
        unit: product.unit,
        altUnit: product.altUnit,
        altUnitFactor: product.altUnitFactor,
        useAltUnit: false
      }]);
      return;
    }

    this.cart.set([...this.cart()]);
  }

  removeFromCart(productId: string) {
    this.cart.set(this.cart().filter(item => item.productId !== productId));
  }

  /** `enteredQty` is in whichever unit the line is currently displayed in (see
   *  `useAltUnit`) — converted back to the primary unit here so `CartItem.quantity`
   *  (used for pricing/stock-reduction everywhere else) always stays canonical. */
  updateQuantity(productId: string, enteredQty: number) {
    const item = this.cart().find(i => i.productId === productId);
    if (item && enteredQty > 0) {
      const factor = item.useAltUnit ? (item.altUnitFactor || 1) : 1;
      const quantity = enteredQty * factor;
      item.quantity = quantity;
      item.total = this.computeLineTotal(quantity, item.price, item.discount);
      this.cart.set([...this.cart()]);
    }
  }

  /** The quantity value to show in the line's input box, in whichever unit
   *  (`unit` or `altUnit`) is currently toggled on for that line. */
  cartLineDisplayQty(item: CartItem): number {
    if (item.useAltUnit && item.altUnitFactor) {
      return item.quantity / item.altUnitFactor;
    }
    return item.quantity;
  }

  cartLineUnitLabel(item: CartItem): string {
    return (item.useAltUnit ? item.altUnit : item.unit) ?? '';
  }

  /** Switches a cart line between entering quantity in the primary vs. alt unit.
   *  The canonical (primary-unit) `quantity` itself never changes here — only how
   *  it's displayed/edited — so the toggle round-trips without losing precision. */
  toggleCartLineUnit(productId: string) {
    const item = this.cart().find(i => i.productId === productId);
    if (!item || !item.altUnit || !item.altUnitFactor) return;
    item.useAltUnit = !item.useAltUnit;
    this.cart.set([...this.cart()]);
  }

  updatePrice(productId: string, price: number) {
    const item = this.cart().find(i => i.productId === productId);
    if (item && price > 0) {
      item.price = price;
      item.total = this.computeLineTotal(item.quantity, price, item.discount);
      this.cart.set([...this.cart()]);
    }
  }

  /** Per-line discount (12-band) — a separate, additional discount from the
   *  existing cart-level one applied at checkout. Absolute currency amount,
   *  clamped so it can never exceed the line's own quantity*price and so the
   *  resulting total can never go negative. */
  updateLineDiscount(productId: string, discount: number) {
    const item = this.cart().find(i => i.productId === productId);
    if (!item) return;
    const clampedDiscount = Math.max(0, Math.min(discount || 0, item.quantity * item.price));
    item.discount = clampedDiscount;
    item.total = this.computeLineTotal(item.quantity, item.price, clampedDiscount);
    this.cart.set([...this.cart()]);
  }

  /** Single source of truth for a cart line's `total`, used by every place that
   *  mutates quantity/price/discount so they never drift out of sync. */
  private computeLineTotal(quantity: number, price: number, discount?: number): number {
    return Math.max(0, quantity * price - (discount ?? 0));
  }

  subtotal = computed(() =>
  this.cart().reduce((sum, item) => sum + item.total, 0)
);

  /** Live `settings/general` doc — `null` until Settings has been saved at least once
   *  (e.g. a brand-new store's first-ever admin visit), in which case `taxRate()` below
   *  falls back to the historical 12% Uzbekistan QQS (VAT) rate. */
  generalSettings = toSignal(this.settingsService.getGeneralSettings(), { initialValue: null });

  taxRate = computed(() => this.generalSettings()?.vatRate ?? 0.12);

  tax = computed(() => this.subtotal() * this.taxRate());

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
    this.dialogOpen.set(true);
    this.dialog
      .open(PosPaymentDialogComponent, {
        width: '420px',
        data: { total: this.total(), customers: this.customers() }
      })
      .afterClosed()
      .subscribe((result: PosPaymentDialogResult | undefined) => {
        this.dialogOpen.set(false);
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
      total: item.total,
      ...(item.discount && item.discount > 0 ? { discount: item.discount } : {})
    }));

    const debtPortion = this.debtAmount();
    const change = this.change();

    const discount = this.discount();

    const shift = this.activeShift();

    const sale: Omit<Sale, 'id' | 'createdAt'> = {
      items,
      subtotal: this.subtotal(),
      tax: this.tax(),
      total: this.finalTotal(),
      paymentMethod: this.selectedPaymentMethod(),
      paidAmount: this.paidAmount(),
      change,
      ...(discount > 0 ? { discount } : {}),
      ...(shift ? { shiftId: shift.id } : {})
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
        this.toast.success(
          this.translation.translate('pos.saleCompleted') + ': ' + formatNumber(change) + ' ' + this.settingsService.currencySymbol()
        );
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

  /**
   * Global capture for a USB/Bluetooth barcode-scanner gun, which types digits far
   * faster than a human and terminates with Enter. This works regardless of where
   * screen focus currently is — the cashier does not need to click into the search
   * box first. Digits/Enter that are part of a detected fast burst are prevented
   * from being inserted into whatever field currently has focus (see
   * `scanner-input.util.ts`'s `wasPartOfBurst()` doc comment for the one accepted
   * edge case: the very first character of a scan may still leak through).
   */
  @HostListener('window:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent) {
    if (this.dialogOpen()) return;

    const code = this.scannerGun.handleKey(event);
    if (this.scannerGun.wasPartOfBurst()) {
      event.preventDefault();
    }
    if (code) {
      this.cleanupLeakedCharacter(code);
      this.addProductByBarcode(code);
    }

    // Quick keyboard shortcuts (4-band). Escape works even while a text field has
    // focus (e.g. to clear the search box); the rest are suppressed while typing so
    // they don't fire off F-keys/Delete that a form field might otherwise want.
    if (event.key === 'Escape') {
      event.preventDefault();
      this.searchQuery.set('');
      return;
    }

    if (this.isTypingTarget(event)) return;

    if (event.key === 'F2') {
      event.preventDefault();
      this.searchInputRef?.nativeElement.focus();
      return;
    }

    if (event.key === 'F4') {
      event.preventDefault();
      if (this.cart().length > 0) {
        this.openPaymentDialog();
      }
      return;
    }

    if (event.key === 'F8' || event.key === 'Delete') {
      event.preventDefault();
      this.confirmClearCart();
      return;
    }
  }

  /** True when the current keyboard focus is on a form field, so global shortcuts
   *  should stand down and let normal typing happen. */
  private isTypingTarget(event: KeyboardEvent): boolean {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return false;
    if (el.isContentEditable) return true;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
  }

  /** F8/Delete: ask for confirmation before wiping out an in-progress cart. */
  private confirmClearCart() {
    if (this.cart().length === 0) return;

    this.dialogOpen.set(true);
    this.dialog
      .open(ConfirmDialogComponent, {
        data: { titleKey: 'pos.clearCart', messageKey: 'pos.clearCartConfirm' }
      })
      .afterClosed()
      .subscribe((confirmed) => {
        this.dialogOpen.set(false);
        if (confirmed) {
          this.clearCart();
        }
      });
  }

  /** Best-effort: strip a single leaked leading digit from whatever field had focus
   *  during a scan, but only on an unambiguous match — never risk corrupting it. */
  private cleanupLeakedCharacter(code: string) {
    const el = document.activeElement;
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return;
    const leaked = code[0];
    if (leaked && el.value.length > 0 && el.value.endsWith(leaked)) {
      el.value = el.value.slice(0, -1);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  async openScannerDialog() {
    this.dialogOpen.set(true);
    const { BarcodeScannerDialogComponent } = await import(
      '../shared/components/barcode-scanner-dialog/barcode-scanner-dialog.component'
    );
    this.dialog
      .open(BarcodeScannerDialogComponent, { width: '420px' })
      .afterClosed()
      .subscribe((code: string | undefined) => {
        this.dialogOpen.set(false);
        if (code) {
          this.addProductByBarcode(code);
        }
      });
  }

  private addProductByBarcode(barcode: string) {
    const product = this.products().find((p) => p.barcode === barcode);
    if (product) {
      this.addToCart(product);
      this.searchQuery.set('');
    } else {
      this.toast.error(this.translation.translate('pos.scanNotFound'));
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

  /** How many units are in a held cart — shown next to its label in the held-carts menu. */
  heldCartItemCount(held: HeldCart): number {
    return held.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  /** Suspends the current cart (e.g. the customer stepped away mid-purchase) so the
   *  cashier can serve someone else, then resume it later. Local-only (localStorage),
   *  never touches Firestore. */
  holdCart() {
    if (this.cart().length === 0) return;

    const label = window.prompt(this.translation.translate('pos.holdCartLabelPrompt'))?.trim() ?? '';

    const held: HeldCart = {
      id: crypto.randomUUID(),
      label,
      items: this.cart(),
      createdAt: new Date()
    };

    this.heldCarts.update((carts) => [...carts, held]);
    this.clearCart();
  }

  /** Restores a held cart into the active cart. If the active cart is non-empty,
   *  confirms first so resuming never silently discards in-progress work. */
  resumeCart(id: string) {
    const held = this.heldCarts().find((h) => h.id === id);
    if (!held) return;

    if (this.cart().length === 0) {
      this.applyResumedCart(held);
      return;
    }

    this.dialogOpen.set(true);
    this.dialog
      .open(ConfirmDialogComponent, {
        data: { titleKey: 'pos.resumeCart', messageKey: 'pos.resumeCartConfirm' }
      })
      .afterClosed()
      .subscribe((confirmed) => {
        this.dialogOpen.set(false);
        if (confirmed) {
          this.applyResumedCart(held);
        }
      });
  }

  private applyResumedCart(held: HeldCart) {
    this.cart.set(held.items);
    this.heldCarts.update((carts) => carts.filter((h) => h.id !== held.id));
  }

  /** Permanently removes a held cart without resuming it — confirmed first since
   *  it's destructive. */
  discardHeldCart(id: string) {
    this.dialogOpen.set(true);
    this.dialog
      .open(ConfirmDialogComponent, {
        data: { titleKey: 'pos.discardHeldCart', messageKey: 'pos.discardHeldCartConfirm' }
      })
      .afterClosed()
      .subscribe((confirmed) => {
        this.dialogOpen.set(false);
        if (confirmed) {
          this.heldCarts.update((carts) => carts.filter((h) => h.id !== id));
        }
      });
  }

  private loadHeldCartsFromStorage(): HeldCart[] {
    try {
      const raw = localStorage.getItem(HELD_CARTS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as HeldCart[];
      return parsed.map((held) => ({ ...held, createdAt: new Date(held.createdAt) }));
    } catch (err) {
      console.error('Load held carts error:', err);
      return [];
    }
  }
}

const HELD_CARTS_STORAGE_KEY = 'smartstock_pos_held_carts';

interface CartItem {
  productId: string;
  productName: string;
  categoryId: string;
  /** Always in the product's PRIMARY unit — the canonical value used for pricing
   *  and stock-reduction math, regardless of which unit the cashier is currently
   *  entering quantity in (see `useAltUnit`). */
  quantity: number;
  price: number;
  total: number;
  /** Per-line discount (12-band), absolute currency amount, default 0. Stacks
   *  additively with the cart-level `discount` signal applied at checkout —
   *  this reduces the line's own `total` (and thus `subtotal`) first. */
  discount?: number;
  unit?: string;
  altUnit?: string;
  altUnitFactor?: number;
  /** Whether this line's quantity input is currently showing/accepting values in
   *  `altUnit` (true) or the primary `unit` (false/undefined). Display-only toggle —
   *  `quantity` itself always stays in the primary unit. */
  useAltUnit?: boolean;
}

interface HeldCart {
  id: string;
  label: string;
  items: CartItem[];
  createdAt: Date;
}

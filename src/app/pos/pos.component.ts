import { Component, ElementRef, HostListener, OnInit, ViewChild, signal, inject, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, defer, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { Product, ProductService } from '../core/services/product.service';
import { CategoryService } from '../core/services/category.service';
import { PaymentMethod, Sale, SaleDebtInput, SaleItem, SalesService } from '../core/services/sales.service';
import { DebtService } from '../core/services/debt.service';
import { AuthService } from '../core/services/auth.service';
import { roleCan } from '../core/auth/permissions';
import { Shift, ShiftService, computeShiftTotals } from '../core/services/shift.service';
import { CashMovementService } from '../core/services/cash-movement.service';
import { CashMovementDialogComponent, CashMovementDialogData } from '../shared/components/cash-movement-dialog/cash-movement-dialog.component';
import { PriceTier, expiryState, hasWholesale, resolveTier, tierPrice } from '../core/utils/price-tier';
import { roundMoney } from '../core/utils/pos-math';
import { TranslationService } from '../core/services/translation.service';
import { ToastService } from '../core/services/toast.service';
import { SettingsService } from '../core/services/settings.service';
import { SumPipe } from '../core/pipes/sum.pipe';
import { CurrencyDisplayPipe } from '../core/pipes/currency-display.pipe';
import { CheckoutLineInput, calculateCheckout, generateReceiptNo, splitPayment } from '../core/utils/pos-math';
import { DEFAULT_RANGE_DAYS, daysAgo } from '../core/utils/date-range';
import { PosPaymentDialogComponent, PosPaymentDialogData, PosPaymentDialogResult } from './pos-payment-dialog/pos-payment-dialog.component';
import { PosSuccessDialogComponent, PosSuccessDialogData } from './pos-success-dialog/pos-success-dialog.component';
import { ConfirmDialogComponent } from '../shared/components/confirm-dialog/confirm-dialog.component';
import { createScannerGunDetector } from '../core/utils/scanner-input.util';
import { normalizeForSearch } from '../core/utils/uzbek-transliteration';
import { variantLabel } from '../core/utils/product-variants';
import { PRODUCT_UNITS } from '../core/constants/units';

/** Browsing without a search shows this many products at most, most-sold first. */
const BROWSE_LIMIT = 60;
const VIEW_MODE_STORAGE_KEY = 'smartstock_pos_view';

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
  /** Product id of the highlighted cart line — target of the +/- keys and the edit row. */
  selectedLineId = signal<string | null>(null);

  /** Carts a cashier has "held" mid-sale (e.g. a customer stepped away) so another
   *  customer can be served without losing the in-progress cart. Single-device
   *  convenience, so localStorage only. */
  heldCarts = signal<HeldCart[]>(this.loadHeldCartsFromStorage());

  searchQuery = signal('');
  /** null = "all categories". */
  selectedCategoryId = signal<string | null>(null);
  submitting = signal(false);

  /** Ticket-wide price tier; lines of products without a wholesale price stay retail. */
  priceTier = signal<PriceTier>('retail');
  viewMode = signal<'grid' | 'list'>(this.loadViewMode());

  private productService = inject(ProductService);
  private categoryService = inject(CategoryService);
  private salesService = inject(SalesService);
  private debtService = inject(DebtService);
  private authService = inject(AuthService);
  private shiftService = inject(ShiftService);
  private translation = inject(TranslationService);
  private toast = inject(ToastService);
  private settingsService = inject(SettingsService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private cashMovements = inject(CashMovementService);

  private scannerGun = createScannerGunDetector();
  /** Suppresses the global scanner listener while a dialog is open. */
  private dialogOpen = signal(false);

  private readonly persistHeldCartsEffect = effect(() => {
    try {
      localStorage.setItem(HELD_CARTS_STORAGE_KEY, JSON.stringify(this.heldCarts()));
    } catch (err) {
      console.error('Persist held carts error:', err);
    }
  });

  @ViewChild('searchInput') private searchInputRef?: ElementRef<HTMLInputElement>;

  categories = toSignal(this.categoryService.getCategories(), { initialValue: [] });
  /** Recent sales only drive the "most sold first" ordering of categories/products.
   *  A failing read (offline, index still building) must never break the till —
   *  toSignal rethrows errors on read — so it falls back to no ordering. */
  sales = toSignal(this.salesService.getSalesInRange(daysAgo(DEFAULT_RANGE_DAYS)).pipe(catchError(() => of([]))), { initialValue: [] });
  customers = toSignal(this.debtService.getCustomers().pipe(catchError(() => of([]))), { initialValue: [] });
  currentUser = toSignal(this.authService.currentUser$, { initialValue: null });

  /** Price overrides are a manager-level action; cashiers can still give discounts. */
  canEditPrice = computed(() => {
    return roleCan(this.currentUser()?.role, 'pos.priceOverride');
  });

  /** Soft enforcement only — checkout is never blocked by a missing shift. */
  activeShift = signal<Shift | undefined>(undefined);
  startingCashInput = signal(0);
  openingShift = signal(false);

  vatRate = this.settingsService.vatRate;
  pricesIncludeVat = this.settingsService.pricesIncludeVat;

  /** Cash the drawer should hold now: float + cash sales − cash refunds ± cash movements.
   *  Same formula as the Z-report (computeShiftTotals). */
  drawerCash = toSignal(
    toObservable(this.activeShift).pipe(
      switchMap((shift) =>
        !shift
          ? of(0)
          : // defer: a failing read must never break the till, even if it throws synchronously.
            defer(() =>
              combineLatest([
                this.shiftService.getShiftSales(shift.id),
                this.salesService.getReturnsForShift(shift.id),
                this.cashMovements.getForShift(shift.id)
              ])
            ).pipe(
              map(([sales, returns, movements]) =>
                roundMoney(shift.startingCash + computeShiftTotals(sales, returns, movements).cashDrawerDelta)
              ),
              catchError(() => of(shift.startingCash))
            )
      )
    ),
    { initialValue: 0 }
  );

  /** Only show the retail/wholesale switch when the catalog actually has wholesale prices. */
  anyWholesale = computed(() => this.products().some((p) => hasWholesale(p)));

  /** Quantity of each product already in the ticket — badges on the catalog tiles. */
  cartQty = computed(() => new Map(this.cart().map((i) => [i.productId, i.quantity])));

  totalUnits = computed(() => this.cart().reduce((s, i) => s + i.quantity, 0));

  shownPrice(product: Product): number {
    return tierPrice(product, this.priceTier() === 'wholesale' ? 'wholesale' : 'retail');
  }

  isLow(product: Product): boolean {
    return product.quantity > 0 && product.minQuantity !== undefined && product.quantity <= product.minQuantity;
  }

  expiryOf(product: Product) {
    return expiryState(product.expiryDate);
  }

  initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');
  }

  setViewMode(mode: 'grid' | 'list') {
    this.viewMode.set(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      /* storage unavailable — keep the in-memory choice */
    }
  }

  private loadViewMode(): 'grid' | 'list' {
    try {
      return localStorage.getItem(VIEW_MODE_STORAGE_KEY) === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  }

  /** Switches the whole ticket; manually overridden prices are kept as typed. */
  setPriceTier(tier: PriceTier) {
    this.priceTier.set(tier);
    this.cart.update((cart) => cart.map((item) => this.repriced(item)));
  }

  /** Re-applies the tier price to a line (ticket tier or the product's quantity threshold). */
  private repriced(item: CartItem): CartItem {
    if (item.priceOverridden) return item;
    const product = this.productById().get(item.productId) ?? {
      price: item.retailPrice,
      wholesalePrice: item.wholesalePrice,
      wholesaleMinQty: item.wholesaleMinQty
    };
    const tier = resolveTier(product, item.quantity, this.priceTier());
    return { ...item, tier, price: tierPrice(product, tier) };
  }

  openCashDialog() {
    const shift = this.activeShift();
    if (!shift) return;
    this.dialogOpen.set(true);
    const data: CashMovementDialogData = { expectedCash: this.drawerCash() };
    this.dialog
      .open(CashMovementDialogComponent, { width: '440px', maxWidth: '96vw', data })
      .afterClosed()
      .subscribe((input) => {
        this.dialogOpen.set(false);
        if (!input) return;
        this.cashMovements.add(shift.id, input).subscribe({
          next: () => this.toast.success(this.translation.translate('finance.cashMovementSaved')),
          error: (err) => {
            console.error('Cash movement error:', err);
            this.toast.error(this.translation.translate('messages.error'));
          }
        });
      });
  }

  ngOnInit() {
    this.productService.getProducts().subscribe((products) => this.products.set(products));

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
      },
      error: (err) => {
        console.error('Open shift error:', err);
        this.openingShift.set(false);
        this.toast.error(this.translation.translate('shifts.shiftOpenError'));
      }
    });
  }

  // ---------------------------------------------------------------- catalog

  private soldQty = computed(() => {
    const byProduct = new Map<string, number>();
    const byCategory = new Map<string, number>();
    for (const sale of this.sales()) {
      for (const item of sale.items) {
        byProduct.set(item.productId, (byProduct.get(item.productId) ?? 0) + item.quantity);
        if (item.categoryId) byCategory.set(item.categoryId, (byCategory.get(item.categoryId) ?? 0) + item.quantity);
      }
    }
    return { byProduct, byCategory };
  });

  sortedCategories = computed(() => {
    const counts = this.soldQty().byCategory;
    return this.categories()
      .slice()
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  });

  private productById = computed(() => new Map(this.products().map((p) => [p.id, p])));

  displayedProducts = computed(() => {
    const query = this.searchQuery().trim();
    if (query) {
      // Cross-script (Latin/Cyrillic) name match; barcode stays a plain substring match.
      const normalizedQuery = normalizeForSearch(query);
      const barcodeQuery = query.toLowerCase();
      return this.products().filter(
        (p) =>
          normalizeForSearch(p.name).includes(normalizedQuery) ||
          normalizeForSearch(`${variantLabel(p)} ${p.sku ?? ''}`).includes(normalizedQuery) ||
          p.barcode.includes(barcodeQuery) ||
          (p.searchKeywords?.some((keyword) => normalizeForSearch(keyword).includes(normalizedQuery)) ?? false)
      );
    }
    const categoryId = this.selectedCategoryId();
    const list = categoryId ? this.products().filter((p) => p.categoryId === categoryId) : this.products();
    const counts = this.soldQty().byProduct;
    return list
      .slice()
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
      .slice(0, categoryId ? undefined : BROWSE_LIMIT);
  });

  selectCategory(id: string | null) {
    this.selectedCategoryId.set(id);
    this.searchQuery.set('');
  }

  // ---------------------------------------------------------------- cart

  addToCart(product: Product) {
    const existing = this.cart().find((item) => item.productId === product.id);
    if (existing) {
      // Scans/repeat clicks always add 1 primary unit, whatever unit the line displays.
      this.setLineQuantity(product.id, existing.quantity + 1);
    } else {
      const tier = resolveTier(product, 1, this.priceTier());
      this.cart.update((cart) => [
        ...cart,
        {
          productId: product.id,
          productName: this.productDisplayName(product),
          categoryId: product.categoryId,
          quantity: 1,
          price: tierPrice(product, tier),
          retailPrice: product.price,
          wholesalePrice: product.wholesalePrice ?? undefined,
          wholesaleMinQty: product.wholesaleMinQty ?? undefined,
          tier,
          costPrice: product.cost,
          discount: 0,
          unit: product.unit,
          altUnits: product.altUnits,
          selectedUnit: product.unit
        }
      ]);
      const exp = expiryState(product.expiryDate);
      if (exp === 'expired') {
        this.toast.error(`${product.name}: ${this.translation.translate('expiry.expiredWarning')}`);
      }
    }
    this.selectedLineId.set(product.id);
    this.warnIfOverStock(product.id);
  }

  readonly variantLabel = variantLabel;

  productDisplayName(product: Product): string {
    const variant = variantLabel(product);
    return variant ? `${product.name} — ${variant}` : product.name;
  }

  removeFromCart(productId: string) {
    this.cart.update((cart) => cart.filter((item) => item.productId !== productId));
    if (this.selectedLineId() === productId) {
      const last = this.cart().at(-1);
      this.selectedLineId.set(last?.productId ?? null);
    }
  }

  /** Immutable line update — every cart mutation goes through here so computed
   *  totals always see a fresh array and fresh line objects. */
  private patchLine(productId: string, patch: Partial<CartItem>) {
    this.cart.update((cart) => cart.map((item) => (item.productId === productId ? { ...item, ...patch } : item)));
  }

  /** Stock left for a product (primary unit), or null if the product is unknown. */
  stockOf(productId: string): number | null {
    return this.productById().get(productId)?.quantity ?? null;
  }

  isOverStock(item: CartItem): boolean {
    const stock = this.stockOf(item.productId);
    return stock !== null && item.quantity > stock;
  }

  private warnIfOverStock(productId: string) {
    const item = this.cart().find((i) => i.productId === productId);
    if (item && this.isOverStock(item)) {
      this.toast.error(
        `${item.productName}: ${this.translation.translate('pos.notEnoughStock')} (${this.stockOf(productId)})`
      );
    }
  }

  private unitFactor(item: CartItem, unit: string | undefined): number {
    if (!unit || unit === item.unit) return 1;
    return item.altUnits?.find((a) => a.unit === unit)?.factor ?? 1;
  }

  cartLineUnitOptions(item: CartItem): { unit: string; factor: number }[] {
    const options: { unit: string; factor: number }[] = [];
    if (item.unit) options.push({ unit: item.unit, factor: 1 });
    if (item.altUnits) options.push(...item.altUnits);
    return options;
  }

  /** `enteredQty` is in the line's currently displayed unit; stored canonically in the primary unit. */
  updateQuantity(productId: string, enteredQty: number) {
    const item = this.cart().find((i) => i.productId === productId);
    if (!item || !(enteredQty > 0)) return;
    this.setLineQuantity(productId, enteredQty * this.unitFactor(item, item.selectedUnit));
    this.warnIfOverStock(productId);
  }

  /** Quantity change in primary units; re-evaluates the wholesale threshold. */
  private setLineQuantity(productId: string, quantity: number) {
    this.cart.update((cart) =>
      cart.map((item) => (item.productId === productId ? this.repriced({ ...item, quantity }) : item))
    );
  }

  /** +1 / −1 in the displayed unit. Dropping below one unit removes the line. */
  stepQuantity(productId: string, direction: 1 | -1) {
    const item = this.cart().find((i) => i.productId === productId);
    if (!item) return;
    const next = this.cartLineDisplayQty(item) + direction;
    if (next <= 0) {
      this.removeFromCart(productId);
      return;
    }
    this.updateQuantity(productId, next);
  }

  cartLineDisplayQty(item: CartItem): number {
    const factor = this.unitFactor(item, item.selectedUnit);
    return Math.round((item.quantity / factor) * 1000) / 1000;
  }

  cartLineUnitLabel(item: CartItem): string {
    return item.selectedUnit ?? item.unit ?? '';
  }

  /** Fixed units are translated; free-text alt units (e.g. "karobka") are shown as typed. */
  unitDisplayLabel(unit: string | undefined): string {
    if (!unit) return '';
    return (PRODUCT_UNITS as readonly string[]).includes(unit) ? this.translation.translate('units.' + unit) : unit;
  }

  setCartLineUnit(productId: string, unit: string) {
    this.patchLine(productId, { selectedUnit: unit });
  }

  updatePrice(productId: string, price: number) {
    if (!this.canEditPrice() || !(price > 0)) return;
    const item = this.cart().find((i) => i.productId === productId);
    if (!item) return;
    // Typing the tier price back clears the override, so the tier logic resumes.
    const overridden = price !== item.retailPrice && price !== item.wholesalePrice;
    this.patchLine(productId, { price, priceOverridden: overridden || undefined });
  }

  updateLineDiscount(productId: string, discount: number) {
    const item = this.cart().find((i) => i.productId === productId);
    if (!item) return;
    this.patchLine(productId, { discount: Math.max(0, Math.min(discount || 0, item.quantity * item.price)) });
  }

  // ---------------------------------------------------------------- totals

  private checkoutLines = computed<CheckoutLineInput[]>(() =>
    this.cart().map((item) => ({
      quantity: item.quantity,
      price: item.price,
      lineDiscount: item.discount,
      costPrice: item.costPrice
    }))
  );

  /** Cart totals before the cart-level discount (that one is entered at payment). */
  summary = computed(() =>
    calculateCheckout(this.checkoutLines(), 0, { vatRate: this.vatRate(), pricesIncludeVat: this.pricesIncludeVat() })
  );

  lineTotal(index: number): number {
    return this.summary().lines[index]?.total ?? 0;
  }

  itemCount = computed(() => this.cart().length);

  // ---------------------------------------------------------------- checkout

  openPaymentDialog() {
    if (this.cart().length === 0 || this.submitting()) return;

    const missing = this.cart().find((item) => !this.productById().has(item.productId));
    if (missing) {
      this.toast.error(`${missing.productName}: ${this.translation.translate('pos.productRemoved')}`);
      return;
    }

    const data: PosPaymentDialogData = {
      lines: this.checkoutLines(),
      vat: { vatRate: this.vatRate(), pricesIncludeVat: this.pricesIncludeVat() },
      customers: this.customers()
    };

    this.dialogOpen.set(true);
    this.dialog
      .open(PosPaymentDialogComponent, { width: '560px', maxWidth: '96vw', data, autoFocus: 'first-tabbable' })
      .afterClosed()
      .subscribe((result: PosPaymentDialogResult | undefined) => {
        this.dialogOpen.set(false);
        if (result) this.completeSale(result);
      });
  }

  /** Never leaves the till locked: whatever goes wrong while building or saving the
   *  sale, `submitting` is reset and the cart stays so the cashier can retry. */
  private completeSale(payment: PosPaymentDialogResult) {
    this.submitting.set(true);
    try {
      this.saveSale(payment);
    } catch (err) {
      this.saleFailed(err);
    }
  }

  private saleFailed(err: unknown) {
    console.error('Create sale error:', err);
    this.submitting.set(false);
    this.toast.error(this.translation.translate('pos.saleError'));
  }

  private saveSale(payment: PosPaymentDialogResult) {

    const cart = this.cart();
    const checkout = calculateCheckout(this.checkoutLines(), payment.discount, {
      vatRate: this.vatRate(),
      pricesIncludeVat: this.pricesIncludeVat()
    });
    const split = splitPayment(checkout.total, payment.cashTendered, payment.cardAmount);

    const items: SaleItem[] = cart.map((item, i) => {
      const line = checkout.lines[i];
      return {
        productId: item.productId,
        productName: item.productName,
        categoryId: item.categoryId,
        quantity: item.quantity,
        ...(item.unit ? { unit: item.unit } : {}),
        price: item.price,
        ...(item.tier === 'wholesale' ? { priceTier: 'wholesale' as const } : {}),
        total: line.gross - line.lineDiscount,
        ...(line.lineDiscount > 0 ? { discount: line.lineDiscount } : {}),
        finalTotal: line.total,
        itemCostPrice: item.costPrice ?? 0,
        netProfit: line.profit
      };
    });

    const paymentMethod: PaymentMethod = split.card > 0 && split.cash > 0 ? 'mixed' : split.card > 0 ? 'card' : 'cash';
    const shift = this.activeShift();
    const user = this.currentUser();
    const receiptNo = generateReceiptNo();

    const sale: Omit<Sale, 'id' | 'createdAt'> = {
      receiptNo,
      items,
      subtotal: checkout.subtotal,
      tax: checkout.vat,
      vatIncluded: this.pricesIncludeVat(),
      total: checkout.total,
      paymentMethod,
      paidAmount: split.paid,
      change: split.change,
      cashAmount: split.cash,
      cardAmount: split.card,
      ...(checkout.cartDiscount > 0 ? { discount: checkout.cartDiscount } : {}),
      ...(shift ? { shiftId: shift.id } : {}),
      ...(user ? { cashierId: user.uid, cashierName: user.displayName } : {}),
      totalNetProfit: checkout.profit
    };

    let debt: SaleDebtInput | undefined;
    if (split.debt > 0) {
      debt = payment.isNewCustomer
        ? { amount: split.debt, newCustomer: { name: payment.customerName ?? '', phone: payment.customerPhone ?? '' } }
        : { amount: split.debt, customerId: payment.customerId };
    }

    this.salesService.createSale(sale, debt).subscribe({
      next: (saleId) => {
        this.submitting.set(false);
        this.clearCart();
        this.showSuccess({ saleId, receiptNo, total: checkout.total, change: split.change, debt: split.debt });
      },
      error: (err) => this.saleFailed(err)
    });
  }

  private showSuccess(data: PosSuccessDialogData) {
    this.dialogOpen.set(true);
    this.dialog
      .open(PosSuccessDialogComponent, { width: '420px', maxWidth: '96vw', data })
      .afterClosed()
      .subscribe((action: 'print' | undefined) => {
        this.dialogOpen.set(false);
        if (action === 'print') {
          window.open(this.router.serializeUrl(this.router.createUrlTree(['/sales', data.saleId, 'receipt'])), '_blank');
        }
        this.searchInputRef?.nativeElement.focus();
      });
  }

  // ---------------------------------------------------------------- keyboard

  /**
   * Global capture for a USB/Bluetooth barcode scanner, which types digits far
   * faster than a human and ends with Enter — works wherever focus is.
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
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.searchQuery.set('');
      return;
    }

    // Function keys never collide with typing, so they work from inside the search box too.
    if (event.key === 'F2') {
      event.preventDefault();
      this.searchInputRef?.nativeElement.focus();
      return;
    }
    if (event.key === 'F4') {
      event.preventDefault();
      this.openPaymentDialog();
      return;
    }
    if (event.key === 'F8') {
      event.preventDefault();
      this.confirmClearCart();
      return;
    }
    if (event.key === 'F9') {
      event.preventDefault();
      this.holdCart();
      return;
    }
    if (event.key === 'F7' && this.anyWholesale()) {
      event.preventDefault();
      this.setPriceTier(this.priceTier() === 'wholesale' ? 'retail' : 'wholesale');
      return;
    }

    const inSearchBox = document.activeElement === this.searchInputRef?.nativeElement;

    if (event.key === 'Enter') {
      if (inSearchBox && this.searchQuery().trim()) {
        // Enter in a non-empty search adds an exact barcode match, or the only result.
        const results = this.displayedProducts();
        const exact = results.find((p) => p.barcode === this.searchQuery().trim());
        const pick = exact ?? (results.length === 1 ? results[0] : undefined);
        if (pick) {
          event.preventDefault();
          this.addToCart(pick);
          this.searchQuery.set('');
        }
        return;
      }
      if ((!this.isTypingTarget() || inSearchBox) && this.cart().length > 0) {
        event.preventDefault();
        this.openPaymentDialog();
      }
      return;
    }

    if (this.isTypingTarget()) return;

    const selected = this.selectedLineId();
    if (selected && (event.key === '+' || event.key === '-')) {
      event.preventDefault();
      this.stepQuantity(selected, event.key === '+' ? 1 : -1);
      return;
    }

    if (event.key === 'Delete') {
      event.preventDefault();
      if (selected) this.removeFromCart(selected);
      else this.confirmClearCart();
    }
  }

  private isTypingTarget(): boolean {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return false;
    if (el.isContentEditable) return true;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
  }

  confirmClearCart() {
    if (this.cart().length === 0) return;

    this.dialogOpen.set(true);
    this.dialog
      .open(ConfirmDialogComponent, { data: { titleKey: 'pos.clearCart', messageKey: 'pos.clearCartConfirm' } })
      .afterClosed()
      .subscribe((confirmed) => {
        this.dialogOpen.set(false);
        if (confirmed) this.clearCart();
      });
  }

  /** Best-effort: strip a single leaked leading digit from the focused field after a scan. */
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
        if (code) this.addProductByBarcode(code);
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
    this.selectedLineId.set(null);
    this.searchQuery.set('');
    this.priceTier.set('retail');
  }

  // ---------------------------------------------------------------- held carts

  heldCartItemCount(held: HeldCart): number {
    return held.items.length;
  }

  holdCart() {
    if (this.cart().length === 0) return;

    const label = window.prompt(this.translation.translate('pos.holdCartLabelPrompt'))?.trim() ?? '';
    const held: HeldCart = { id: crypto.randomUUID(), label, items: this.cart(), createdAt: new Date() };

    this.heldCarts.update((carts) => [...carts, held]);
    this.clearCart();
  }

  /** Confirms first when the active cart is non-empty, so resuming never discards work silently. */
  resumeCart(id: string) {
    const held = this.heldCarts().find((h) => h.id === id);
    if (!held) return;

    if (this.cart().length === 0) {
      this.applyResumedCart(held);
      return;
    }

    this.dialogOpen.set(true);
    this.dialog
      .open(ConfirmDialogComponent, { data: { titleKey: 'pos.resumeCart', messageKey: 'pos.resumeCartConfirm' } })
      .afterClosed()
      .subscribe((confirmed) => {
        this.dialogOpen.set(false);
        if (confirmed) this.applyResumedCart(held);
      });
  }

  private applyResumedCart(held: HeldCart) {
    this.cart.set(held.items.map((item) => ({ ...item })));
    this.selectedLineId.set(held.items.at(-1)?.productId ?? null);
    this.heldCarts.update((carts) => carts.filter((h) => h.id !== held.id));
  }

  discardHeldCart(id: string) {
    this.dialogOpen.set(true);
    this.dialog
      .open(ConfirmDialogComponent, {
        data: { titleKey: 'pos.discardHeldCart', messageKey: 'pos.discardHeldCartConfirm' }
      })
      .afterClosed()
      .subscribe((confirmed) => {
        this.dialogOpen.set(false);
        if (confirmed) this.heldCarts.update((carts) => carts.filter((h) => h.id !== id));
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
  /** Always in the product's PRIMARY unit, whatever unit the cashier types in. */
  quantity: number;
  /** Unit price charged on this line (tier price or a manual override). */
  price: number;
  /** Shelf (retail) and wholesale price snapshotted at add time, for tier switching. */
  retailPrice: number;
  wholesalePrice?: number;
  wholesaleMinQty?: number;
  tier?: PriceTier;
  /** Set when a manager typed a price by hand; tier changes then leave it alone. */
  priceOverridden?: boolean;
  /** Per-unit cost snapshotted at add time; only used for profit. */
  costPrice: number;
  /** Per-line discount, absolute currency. */
  discount?: number;
  unit?: string;
  altUnits?: { unit: string; factor: number }[];
  /** Display-only: which unit the quantity input currently shows. */
  selectedUnit?: string;
}

interface HeldCart {
  id: string;
  label: string;
  items: CartItem[];
  createdAt: Date;
}

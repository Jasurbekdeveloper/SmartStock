import { Component, ElementRef, HostListener, OnInit, ViewChild, signal, inject, computed, effect, untracked } from '@angular/core';
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
import { PriceTier, daysUntilExpiry, expiryState, hasWholesale, resolveTier, tierPrice } from '../core/utils/price-tier';
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
import { BatchService } from '../core/services/batch.service';
import { ProductBatchSummary, allocateFefo, batchesByProduct, isBlockedExpired, summarizeBatches } from '../core/utils/batches';
import { createScannerGunDetector } from '../core/utils/scanner-input.util';
import { normalizeForSearch } from '../core/utils/uzbek-transliteration';
import { variantLabel } from '../core/utils/product-variants';
import { PRODUCT_UNITS } from '../core/constants/units';
import { NumericInputDirective } from '../shared/directives/numeric-input.directive';
import { NumpadComponent } from '../shared/components/numpad/numpad.component';
import { OnscreenKeyboardComponent, applyTextKey } from '../shared/components/onscreen-keyboard/onscreen-keyboard.component';
import { DebtPaymentDialogComponent } from '../shared/components/debt-payment-dialog/debt-payment-dialog.component';
import { SidebarStateService } from '../layout/sidebar/sidebar-state.service';
import { TenantService } from '../core/services/tenant.service';
import { ThemeService } from '../core/services/theme.service';
import { Language } from '../core/services/translation.service';

export type NumpadMode = 'qty' | 'price' | 'discount' | 'percent';
const NUMPAD_STORAGE_KEY = 'smartstock_pos_numpad';
const OSK_STORAGE_KEY = 'smartstock_pos_osk';
/** Category tile colours (background, text) — products without a photo get one. */
const TILE_TONES: [string, string][] = [
  ['var(--brand-soft)', 'var(--brand-strong)'],
  ['var(--info-soft)', 'var(--info)'],
  ['var(--warning-soft)', 'var(--warning)'],
  ['color-mix(in srgb, #8b5cf6 14%, var(--surface))', '#7c3aed'],
  ['color-mix(in srgb, #ec4899 13%, var(--surface))', '#db2777'],
  ['var(--success-soft)', 'var(--success)']
];

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

const isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

/** Browsing without a search shows this many products at most, most-sold first. */
const BROWSE_LIMIT = 60;
const VIEW_MODE_STORAGE_KEY = 'smartstock_pos_view';

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [NumericInputDirective, NumpadComponent, OnscreenKeyboardComponent, 
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
  private batchService = inject(BatchService);
  sidebarState = inject(SidebarStateService);
  private tenantService = inject(TenantService);
  storeName = computed(() => this.tenantService.tenant()?.name ?? '');
  themeService = inject(ThemeService);

  // ------------------------------------------------------------ cashier menu (full-screen till)
  readonly languages: { code: Language; name: string }[] = [
    { code: 'uz', name: "O'zbekcha" },
    { code: 'uz-cyrillic', name: 'Ўзбекча' },
    { code: 'ru', name: 'Русский' },
    { code: 'en', name: 'English' }
  ];
  userInitials = computed(() => {
    const name = this.currentUser()?.displayName || this.currentUser()?.email || '?';
    return name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
  });
  currentLanguage(): string {
    return this.translation.getLanguage();
  }
  setLanguage(lang: Language) {
    this.translation.setLanguage(lang);
  }
  toggleTheme() {
    this.themeService.toggleTheme();
  }
  /** Sign out from the till; an unfinished cart is kept as a held cart first. */
  logout() {
    const doLogout = () => {
      if (this.cart().length > 0) this.holdCart();
      this.authService.logout();
      this.router.navigate(['/auth/login']);
    };
    if (this.cart().length === 0) {
      doLogout();
      return;
    }
    this.dialogOpen.set(true);
    this.dialog
      .open(ConfirmDialogComponent, { data: { titleKey: 'common.logout', messageKey: 'pos.logoutHoldsCart' } })
      .afterClosed()
      .subscribe((ok) => {
        this.dialogOpen.set(false);
        if (ok) doLogout();
      });
  }

  // ------------------------------------------------------------ touch: numpad & keyboard
  /** On-screen keypad under the ticket (quantity / price / discount of the selected line). */
  showNumpad = signal(readFlag(NUMPAD_STORAGE_KEY, true));
  numpadMode = signal<NumpadMode>('qty');
  /** Text typed on the keypad; while `numpadFresh`, the first key replaces the value. */
  numpadText = signal('');
  numpadFresh = signal(true);
  /** On-screen letter keyboard for the search box (default on touch screens). */
  oskEnabled = signal(readFlag(OSK_STORAGE_KEY, isTouch));
  oskOpen = signal(false);

  private readonly resetNumpad = effect(() => {
    this.selectedLineId();
    this.numpadMode();
    untracked(() => {
      this.numpadFresh.set(true);
      this.numpadText.set('');
    });
  });

  selectedLine = computed(() => this.cart().find((i) => i.productId === this.selectedLineId()));

  /** The selected line's current value in the keypad's mode. */
  numpadCurrent = computed(() => {
    const item = this.selectedLine();
    if (!item) return 0;
    switch (this.numpadMode()) {
      case 'qty':
        return this.cartLineDisplayQty(item);
      case 'price':
        return item.price;
      case 'discount':
        return item.discount ?? 0;
      case 'percent': {
        const gross = item.quantity * item.price;
        return gross > 0 ? Math.round(((item.discount ?? 0) / gross) * 1000) / 10 : 0;
      }
    }
  });

  numpadDisplay = computed(() => (this.numpadFresh() ? String(this.numpadCurrent()) : this.numpadText() || '0'));

  toggleNumpad() {
    this.showNumpad.update((v) => !v);
    writeFlag(NUMPAD_STORAGE_KEY, this.showNumpad());
  }

  toggleOsk() {
    this.oskEnabled.update((v) => !v);
    writeFlag(OSK_STORAGE_KEY, this.oskEnabled());
    this.oskOpen.set(this.oskEnabled());
  }

  selectLine(productId: string, mode: NumpadMode = 'qty') {
    if (mode === 'price' && !this.canEditPrice()) mode = 'qty';
    this.selectedLineId.set(productId);
    this.numpadMode.set(mode);
  }

  setNumpadMode(mode: NumpadMode) {
    if (mode === 'price' && !this.canEditPrice()) return;
    this.numpadMode.set(mode);
  }

  onNumpadInput(value: string) {
    this.numpadText.set(value);
    this.numpadFresh.set(false);
  }

  /** OK on the keypad: applies the typed value to the selected line. */
  commitNumpad() {
    const item = this.selectedLine();
    if (!item || this.numpadFresh()) return;
    const value = Number(this.numpadText()) || 0;
    switch (this.numpadMode()) {
      case 'qty':
        if (value > 0) this.updateQuantity(item.productId, value);
        else this.removeFromCart(item.productId);
        break;
      case 'price':
        if (value > 0) this.updatePrice(item.productId, value);
        break;
      case 'discount':
        this.updateLineDiscount(item.productId, value);
        break;
      case 'percent':
        this.updateLineDiscount(item.productId, roundMoney((item.quantity * item.price * Math.min(100, value)) / 100));
        break;
    }
    this.numpadFresh.set(true);
    this.numpadText.set('');
  }

  onSearchFocus() {
    if (this.oskEnabled()) this.oskOpen.set(true);
  }

  onOskKey(key: string) {
    this.searchQuery.set(applyTextKey(this.searchQuery(), key));
  }

  /** "Add the first result" on the on-screen keyboard. */
  addFirstResult() {
    const first = this.displayedProducts()[0];
    if (!first) return;
    this.addToCart(first);
    this.searchQuery.set('');
  }

  openDebtPayment() {
    this.dialogOpen.set(true);
    this.dialog
      .open(DebtPaymentDialogComponent, { width: '760px', maxWidth: '96vw', autoFocus: false, data: {} })
      .afterClosed()
      .subscribe(() => this.dialogOpen.set(false));
  }

  tileTone(product: Product): [string, string] {
    let h = 0;
    for (const ch of product.categoryId || product.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return TILE_TONES[h % TILE_TONES.length];
  }

  /** Days to the nearest best-before date of what is on the shelf (null: not dated). */
  expiryDays(product: Product): number | null {
    const nearest = this.batchSummaries().get(product.id)?.nearestExpiry ?? product.expiryDate ?? null;
    return daysUntilExpiry(nearest);
  }

  /** Product name split around the searched text, so the match can be highlighted. */
  nameParts(name: string): [string, string, string] {
    const q = this.searchQuery().trim();
    if (!q) return [name, '', ''];
    const i = name.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());
    if (i < 0) return [name, '', ''];
    return [name.slice(0, i), name.slice(i, i + q.length), name.slice(i + q.length)];
  }

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
  /** Dated batches of tracked products (FEFO). Like `sales`, a failed read must not
   *  break the till — the sale then just goes through without batch allocation. */
  private batches = toSignal(this.batchService.getActiveBatches().pipe(catchError(() => of([]))), { initialValue: [] });
  private batchMap = computed(() => batchesByProduct(this.batches()));
  private batchSummaries = computed(() => {
    const out = new Map<string, ProductBatchSummary>();
    for (const [productId, list] of this.batchMap()) out.set(productId, summarizeBatches(list));
    return out;
  });
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
    return this.batchSummaries().get(product.id)?.state ?? expiryState(product.expiryDate);
  }

  /** Only expired stock is left — a cashier may not sell it. */
  private blockedExpired(product: Product): boolean {
    return isBlockedExpired(product.quantity, this.batchSummaries().get(product.id));
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

  addToCart(product: Product, allowExpired = false) {
    const existing = this.cart().find((item) => item.productId === product.id);
    if (!existing && !allowExpired && this.blockedExpired(product)) {
      if (!this.canEditPrice()) {
        this.toast.error(`${product.name}: ${this.translation.translate('pos.expiredBlocked')}`);
        return;
      }
      this.dialog
        .open(ConfirmDialogComponent, { data: { titleKey: 'pos.sellExpiredTitle', messageKey: 'pos.sellExpiredConfirm' } })
        .afterClosed()
        .subscribe((ok) => {
          if (ok) this.addToCart(product, true);
        });
      return;
    }
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
          selectedUnit: product.unit,
          ...(allowExpired ? { allowExpired: true } : {})
        }
      ]);
      const exp = this.expiryOf(product);
      if (exp === 'expired' && !allowExpired) {
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
      // Tracked goods leave from the batch that expires first (FEFO); the slices
      // are stored on the line so a return can put them back.
      const batches = this.batchMap().get(item.productId);
      const allocations = batches?.length ? allocateFefo(batches, item.quantity, { allowExpired: item.allowExpired }).allocations : [];
      return {
        ...(allocations.length ? { batches: allocations } : {}),
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
  /** A manager confirmed selling expired stock on this line. */
  allowExpired?: boolean;
}

interface HeldCart {
  id: string;
  label: string;
  items: CartItem[];
  createdAt: Date;
}

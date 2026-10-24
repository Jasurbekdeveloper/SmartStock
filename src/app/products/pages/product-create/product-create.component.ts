import { ChangeDetectorRef, Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDialog } from '@angular/material/dialog';
import { Product, ProductService } from '../../../core/services/product.service';
import { CategoryService } from '../../../core/services/category.service';
import { AuthService } from '../../../core/services/auth.service';
import { roleCan } from '../../../core/auth/permissions';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { PRODUCT_UNITS } from '../../../core/constants/units';
import { parseAltUnitsInput } from '../../../core/utils/alt-units-parser.util';
import { StorageService } from '../../../core/services/storage.service';
import { firstValueFrom } from 'rxjs';
import { generateStoreBarcode, isValidMxikCode } from '../../../core/utils/product-identifiers';
import { validateProductForm } from '../../../core/utils/product-form-validation';
import { FieldErrorState } from '../../../shared/forms/field-error-state';
import { mergeKeywordsInput, parseKeywordsInput, suggestSearchKeywords } from '../../../core/utils/search-keywords';
import { priceMargin } from '../../../core/utils/price-margin';
import { formatNumber } from '../../../core/utils/format-number';
import {
  attributeCombinations, attributesKey, legacyColorSize, MAX_VARIANT_AXES, parseAxisValues, presetExamples,
  toAttributes, VARIANT_ATTRIBUTE_PRESETS, variantSkuSuffix
} from '../../../core/utils/product-variants';

interface ProductVariantDraft {
  sku: string;
  barcode: string;
  /** One value per characteristic in `axes`, in the same order. */
  values: string[];
  price: number;
  cost: number;
  quantity: number;
  imageFile?: File;
  imagePreview?: string;
}

@Component({
  selector: 'app-product-create',
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
    MatSelectModule,
    MatIconModule,
    MatTooltipModule,
    MatAutocompleteModule
  ],
  templateUrl: './product-create.component.html',
  styleUrl: './product-create.component.css'
})
export class ProductCreateComponent implements OnDestroy {
  private productService = inject(ProductService);
  private categoryService = inject(CategoryService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private cdr = inject(ChangeDetectorRef);
  private storageService = inject(StorageService);

  categories = toSignal(this.categoryService.getCategories(), { initialValue: [] });
  readonly units = PRODUCT_UNITS;

  private currentUser = toSignal(this.authService.currentUser$, { initialValue: null });
  /** Cost price is purchasing/margin data — cashiers only need the selling price. */
  canSeeCost = computed(() => roleCan(this.currentUser()?.role, 'products.viewCost'));
  readonly margin = priceMargin;
  readonly formatNumber = formatNumber;

  submitting = signal(false);
  errorKey = signal<string | null>(null);

  product: Omit<Product, 'id'> = {
    name: '',
    barcode: '',
    price: 0,
    cost: 0,
    quantity: 0,
    unit: 'dona',
    minQuantity: 0,
    categoryId: '',
    sku: ''
  };

  imageFile: File | null = null;
  imagePreview = signal<string | null>(null);
  variants: ProductVariantDraft[] = [];

  ngOnDestroy(): void {
    const preview = this.imagePreview();
    if (preview) URL.revokeObjectURL(preview);
    for (const variant of this.variants) {
      if (variant.imagePreview) URL.revokeObjectURL(variant.imagePreview);
    }
  }

  selectImage(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      this.errorKey.set('products.invalidImage');
      return;
    }
    const oldPreview = this.imagePreview();
    if (oldPreview) URL.revokeObjectURL(oldPreview);
    this.imageFile = file;
    this.imagePreview.set(URL.createObjectURL(file));
    this.errorKey.set(null);
  }

  /** Characteristics the variants differ by (Hajm, Quvvat, Rang...), each with its
   *  comma-separated values used by "Variantlarni yaratish". */
  axes: { name: string; valuesInput: string }[] = [];
  /** The main product's value for each axis. */
  baseValues: string[] = [];
  readonly maxAxes = MAX_VARIANT_AXES;
  readonly axisExamples = presetExamples;

  private axisNames(): string[] {
    return this.axes.map((a) => a.name.trim());
  }

  /** Presets not used by another axis, matching what is typed into axis `index`. */
  presetOptions(typed: string, index: number) {
    const used = new Set(this.axes.filter((_, j) => j !== index).map((a) => a.name.trim().toLowerCase()));
    const query = typed.trim().toLowerCase();
    return VARIANT_ATTRIBUTE_PRESETS.filter((p) => !used.has(p.name.toLowerCase()) && p.name.toLowerCase().includes(query));
  }

  unusedPresets() {
    const used = new Set(this.axisNames().map((n) => n.toLowerCase()));
    return VARIANT_ATTRIBUTE_PRESETS.filter((p) => !used.has(p.name.toLowerCase()));
  }

  addAxis(name = ''): void {
    if (this.axes.length >= MAX_VARIANT_AXES) return;
    this.axes = [...this.axes, { name, valuesInput: '' }];
    this.baseValues = [...this.baseValues, ''];
    this.variants = this.variants.map((v) => ({ ...v, values: [...v.values, ''] }));
  }

  removeAxis(index: number): void {
    this.axes = this.axes.filter((_, j) => j !== index);
    this.baseValues = this.baseValues.filter((_, j) => j !== index);
    this.variants = this.variants.map((v) => ({ ...v, values: v.values.filter((_, j) => j !== index) }));
  }

  /** A new category brings its default characteristics, unless some are already chosen. */
  onCategoryChange(categoryId: string): void {
    this.product.categoryId = categoryId;
    if (this.axes.length > 0) return;
    const defaults = this.categories().find((c) => c.id === categoryId)?.variantAttributes ?? [];
    for (const name of defaults.slice(0, MAX_VARIANT_AXES)) this.addAxis(name);
  }

  rowLabel(values: readonly string[]): string {
    return values.map((v) => v.trim()).filter(Boolean).join(' · ');
  }

  /** One variant per combination of the axes' values that isn't in the form yet. The
   *  main product takes the first combination if it has no values of its own. */
  generateVariants(): void {
    const combos = attributeCombinations(this.axes.map((a) => ({ name: a.name, values: parseAxisValues(a.valuesInput) })));
    if (combos.length === 0) {
      this.errorKey.set('products.noAttributeValues');
      return;
    }
    this.errorKey.set(null);
    if (!this.product.sku?.trim() && this.product.name.trim()) {
      this.product.sku = variantSkuSuffix([this.product.name]).slice(0, 16);
    }
    const baseSku = this.product.sku?.trim() ?? '';
    const present = new Set([this.baseValues, ...this.variants.map((v) => v.values)]
      .filter((values) => values.some((v) => v.trim()))
      .map(attributesKey));
    const added: ProductVariantDraft[] = [];
    for (const combo of combos) {
      const key = attributesKey(combo);
      if (present.has(key)) continue;
      present.add(key);
      if (!this.baseValues.some((v) => v.trim())) {
        this.baseValues = [...combo];
        continue;
      }
      if (this.variants.length + added.length >= 49) break;
      const suffix = variantSkuSuffix(combo);
      added.push({
        sku: baseSku ? `${baseSku}-${suffix}` : suffix,
        barcode: '',
        values: [...combo],
        price: this.product.price,
        cost: this.product.cost,
        quantity: 0
      });
    }
    this.variants = [...this.variants, ...added];
  }

  addVariant(): void {
    if (this.variants.length >= 49) return;
    this.variants = [...this.variants, {
      sku: '',
      barcode: '',
      values: this.axes.map(() => ''),
      price: this.product.price,
      cost: this.product.cost,
      quantity: 0
    }];
  }

  removeVariant(index: number): void {
    const variant = this.variants[index];
    if (variant?.imagePreview) URL.revokeObjectURL(variant.imagePreview);
    this.variants = this.variants.filter((_, i) => i !== index);
  }

  selectVariantImage(index: number, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      this.errorKey.set('products.invalidImage');
      return;
    }
    const variant = this.variants[index];
    if (variant.imagePreview) URL.revokeObjectURL(variant.imagePreview);
    this.variants[index] = { ...variant, imageFile: file, imagePreview: URL.createObjectURL(file) };
  }

  /** Free-text "unit:factor,unit:factor" input, e.g. "quti:20,karobka:100" —
   *  parsed into `product.altUnits` at submit time via `parseAltUnitsInput()`. */
  altUnitsInput = '';

  /** Free-text comma-separated synonyms/loanwords, e.g. "truba, quvur shlangi" —
   *  split/trimmed into `product.searchKeywords` at submit time. Filled automatically
   *  from the name (other script + synonyms) until the user edits it by hand. */
  searchKeywordsInput = '';
  keywordsTouched = false;

  /** MXIK (IKPU) tax classifier code; optional, saved as null when empty. */
  mxikCode = '';
  readonly mxikInvalid = (code: string) => !!code.trim() && !isValidMxikCode(code);

  generating = signal(false);

  /** SKUs/barcodes of the store's other products, loaded on submit for the duplicate check. */
  private takenIds = signal<string[]>([]);
  /** Which field is wrong, so it can be marked red (see FieldErrorState). */
  readonly fields = new FieldErrorState(() => validateProductForm(
    { ...this.product, mxikCode: this.mxikCode, values: this.baseValues },
    this.variants,
    { requireCost: this.canSeeCost(), taken: this.takenIds(), axes: this.axisNames() }
  ));

  onNameChange(name: string): void {
    this.product.name = name;
    if (!this.keywordsTouched) this.searchKeywordsInput = suggestSearchKeywords(name).join(', ');
  }

  onKeywordsChange(value: string): void {
    this.searchKeywordsInput = value;
    this.keywordsTouched = true;
  }

  /** Adds the name's suggestions to whatever the user already typed. */
  addSuggestedKeywords(): void {
    this.searchKeywordsInput = mergeKeywordsInput(this.searchKeywordsInput, suggestSearchKeywords(this.product.name));
  }

  keywordList(): string[] {
    return parseKeywordsInput(this.searchKeywordsInput);
  }

  removeKeyword(keyword: string): void {
    this.searchKeywordsInput = this.keywordList().filter((k) => k !== keyword).join(', ');
    this.keywordsTouched = true;
  }

  /** Fills an in-store EAN-13 for goods without a barcode — the main product, or the
   *  variant at `variantIndex`. Unique against the catalog and this form. */
  async generateBarcode(variantIndex?: number): Promise<void> {
    this.generating.set(true);
    try {
      const existing = await firstValueFrom(this.productService.getProducts());
      const code = generateStoreBarcode([
        ...existing.flatMap((p) => [p.barcode, p.sku]),
        this.product.barcode,
        ...this.variants.map((v) => v.barcode)
      ]);
      if (variantIndex === undefined) this.product.barcode = code;
      else this.variants[variantIndex] = { ...this.variants[variantIndex], barcode: code };
    } catch (err) {
      console.error('Generate barcode error:', err);
      this.errorKey.set('messages.error');
    } finally {
      this.generating.set(false);
      this.cdr.markForCheck();
    }
  }

  async scanBarcode() {
    const { BarcodeScannerDialogComponent } = await import(
      '../../../shared/components/barcode-scanner-dialog/barcode-scanner-dialog.component'
    );
    this.dialog
      .open(BarcodeScannerDialogComponent, { width: '420px' })
      .afterClosed()
      .subscribe((code: string | undefined) => {
        if (code) {
          this.product.barcode = code;
          this.cdr.markForCheck();
        }
      });
  }

  createProduct(): void {
    void this.createProductAsync();
  }

  private async createProductAsync(): Promise<void> {
    if (!this.fields.check()) {
      this.errorKey.set('products.fixHighlighted');
      return;
    }
    this.submitting.set(true);
    this.errorKey.set(null);

    const altUnits = parseAltUnitsInput(this.altUnitsInput);
    const searchKeywords = parseKeywordsInput(this.searchKeywordsInput);

    const familyId = crypto.randomUUID();
    try {
      const existingProducts = await firstValueFrom(this.productService.getProducts());
      this.takenIds.set(existingProducts.flatMap((p) => [p.barcode, p.sku].filter((v): v is string => !!v)));
      if (!this.fields.check()) {
        this.errorKey.set('products.fixHighlighted');
        this.submitting.set(false);
        return;
      }
      let imageUrl = this.product.imageUrl;
      try {
        if (this.imageFile) imageUrl = await firstValueFrom(this.storageService.uploadProductImage(this.imageFile));
      } catch (err) {
        console.error('Upload product image error:', err);
        this.errorKey.set('products.imageUploadFailed');
        this.submitting.set(false);
        return;
      }
      const names = this.axisNames();
      const baseAttributes = toAttributes(names, this.baseValues);
      const shared = {
        ...this.product,
        attributes: baseAttributes.length > 0 ? baseAttributes : undefined,
        ...legacyColorSize(baseAttributes),
        familyId,
        imageUrl,
        altUnits: altUnits.length > 0 ? altUnits : undefined,
        searchKeywords: searchKeywords.length > 0 ? searchKeywords : undefined,
        mxikCode: this.mxikCode.trim() || null
      };
      let variants: Omit<Product, 'id'>[];
      try {
        variants = await Promise.all(this.variants.map(async (variant) => ({
          ...shared,
          sku: variant.sku.trim() || undefined,
          barcode: variant.barcode.trim(),
          attributes: toAttributes(names, variant.values),
          ...legacyColorSize(toAttributes(names, variant.values)),
          price: Number(variant.price),
          cost: Number(variant.cost),
          quantity: Number(variant.quantity),
          imageUrl: variant.imageFile
            ? await firstValueFrom(this.storageService.uploadProductImage(variant.imageFile))
            : imageUrl
        })));
      } catch (err) {
        console.error('Upload product variant image error:', err);
        this.errorKey.set('products.imageUploadFailed');
        this.submitting.set(false);
        return;
      }
      await firstValueFrom(this.productService.addProducts([shared, ...variants]));
      await this.router.navigate(['/products/list']);
    } catch (err) {
      console.error('Create product error:', err);
      this.errorKey.set((err as Error)?.message === 'PRODUCT_LIMIT_REACHED' ? 'subscription.productLimitReached' : 'messages.error');
      this.submitting.set(false);
    }
  }
}

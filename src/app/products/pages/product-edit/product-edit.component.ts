import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
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
import { AuditLogService } from '../../../core/services/audit-log.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { PRODUCT_UNITS } from '../../../core/constants/units';
import { emptyExtras, extrasFromProduct, extrasToProductFields, validateExtras } from '../../../core/utils/product-extras';
import { ProductExtrasComponent } from '../../components/product-extras/product-extras.component';
import { ImageDropzoneComponent, isAcceptableImage } from '../../../shared/components/image-dropzone/image-dropzone.component';
import { CurrencyDisplayPipe } from '../../../core/pipes/currency-display.pipe';
import { TranslationService } from '../../../core/services/translation.service';
import { StorageService } from '../../../core/services/storage.service';
import { firstValueFrom } from 'rxjs';
import { generateStoreBarcode, isValidMxikCode } from '../../../core/utils/product-identifiers';
import { validateAttributeRows, validateProductForm } from '../../../core/utils/product-form-validation';
import {
  legacyColorSize, MAX_VARIANT_AXES, presetExamples, ProductAttribute, productAttributes, VARIANT_ATTRIBUTE_PRESETS
} from '../../../core/utils/product-variants';
import { FieldErrorState } from '../../../shared/forms/field-error-state';
import { mergeKeywordsInput, parseKeywordsInput, suggestSearchKeywords } from '../../../core/utils/search-keywords';
import { priceMargin } from '../../../core/utils/price-margin';
import { formatNumber } from '../../../core/utils/format-number';

@Component({
  selector: 'app-product-edit',
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
    MatAutocompleteModule,
    ProductExtrasComponent,
    ImageDropzoneComponent,
    CurrencyDisplayPipe
  ],
  templateUrl: './product-edit.component.html',
  styleUrl: './product-edit.component.css'
})
export class ProductEditComponent implements OnInit, OnDestroy {
  private productService = inject(ProductService);
  private categoryService = inject(CategoryService);
  private authService = inject(AuthService);
  private auditLogService = inject(AuditLogService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private storageService = inject(StorageService);

  categories = toSignal(this.categoryService.getCategories(), { initialValue: [] });
  readonly units = PRODUCT_UNITS;
  product = signal<Product | null>(null);
  /** Pristine snapshot captured right after load — `product` itself gets mutated
   *  in place by the form's `[(ngModel)]` bindings, so this is the only place the
   *  "before" values for the audit-log diff can still be read from at save time. */
  private originalProduct = signal<Product | null>(null);

  private currentUser = toSignal(this.authService.currentUser$, { initialValue: null });
  /** Cost price is purchasing/margin data — cashiers only need the selling price. */
  canSeeCost = computed(() => roleCan(this.currentUser()?.role, 'products.viewCost'));
  readonly margin = priceMargin;
  readonly formatNumber = formatNumber;

  submitting = signal(false);
  errorKey = signal<string | null>(null);


  /** Free-text comma-separated synonyms/loanwords, e.g. "truba, quvur shlangi" —
   *  pre-filled from the loaded product's `searchKeywords` (see `ngOnInit`) and
   *  split/trimmed back at save time. A signal (not a plain field) for the same
   *  zoneless reason as the other form signals here. */
  searchKeywordsInput = signal('');
  keywordList = computed(() => parseKeywordsInput(this.searchKeywordsInput()));

  readonly mxikInvalid = (code: string) => !!code.trim() && !isValidMxikCode(code);
  generating = signal(false);

  /** Characteristics of this variant (Hajm = 80 L...), edited as name/value rows.
   *  Older products get theirs from color/size (see productAttributes). */
  attributeRows = signal<ProductAttribute[]>([]);
  readonly maxAxes = MAX_VARIANT_AXES;
  readonly axisExamples = presetExamples;

  presetOptions(typed: string, index: number) {
    const used = new Set(this.attributeRows().filter((_, j) => j !== index).map((a) => a.name.trim().toLowerCase()));
    const query = typed.trim().toLowerCase();
    return VARIANT_ATTRIBUTE_PRESETS.filter((p) => !used.has(p.name.toLowerCase()) && p.name.toLowerCase().includes(query));
  }

  addAttribute(): void {
    if (this.attributeRows().length < MAX_VARIANT_AXES) this.attributeRows.update((rows) => [...rows, { name: '', value: '' }]);
  }

  removeAttribute(index: number): void {
    this.attributeRows.update((rows) => rows.filter((_, j) => j !== index));
  }

  /** SKUs/barcodes of the store's other products, loaded on submit for the duplicate check. */
  private takenIds = signal<string[]>([]);
  /** Which field is wrong, so it can be marked red (see FieldErrorState). */
  readonly fields = new FieldErrorState(() => {
    const product = this.product();
    return product
      ? {
          ...validateProductForm(product, [], { requireCost: this.canSeeCost(), taken: this.takenIds() }),
          ...validateAttributeRows(this.attributeRows())
        }
      : {};
  });

  /** Adds the name's suggestions (other script + synonyms) to the current keywords. */
  addSuggestedKeywords(): void {
    const name = this.product()?.name ?? '';
    this.searchKeywordsInput.update((input) => mergeKeywordsInput(input, suggestSearchKeywords(name)));
  }

  removeKeyword(keyword: string): void {
    this.searchKeywordsInput.set(this.keywordList().filter((k) => k !== keyword).join(', '));
  }

  /** Fills an in-store EAN-13 for goods without a barcode, unique against the catalog. */
  async generateBarcode(): Promise<void> {
    if (!this.product()) return;
    this.generating.set(true);
    try {
      const existing = await firstValueFrom(this.productService.getProducts());
      const code = generateStoreBarcode(existing.flatMap((p) => [p.barcode, p.sku]));
      this.product.update((p) => (p ? { ...p, barcode: code } : p));
    } catch (err) {
      console.error('Generate barcode error:', err);
      this.errorKey.set('messages.error');
    } finally {
      this.generating.set(false);
    }
  }
  imageFile: File | null = null;
  imagePreview = signal<string | null>(null);

  ngOnDestroy(): void {
    const preview = this.imagePreview();
    if (preview) URL.revokeObjectURL(preview);
  }

  /** Wholesale price, alternate units, expiry/batch (see ProductExtrasComponent). */
  extras = emptyExtras();
  private translation = inject(TranslationService);

  unitLabel(unit: string | undefined): string {
    if (!unit) return '';
    return (PRODUCT_UNITS as readonly string[]).includes(unit) ? this.translation.translate('units.' + unit) : unit;
  }

  selectImageFile(file: File): void {
    if (!isAcceptableImage(file)) {
      this.errorKey.set('products.invalidImage');
      return;
    }
    const oldPreview = this.imagePreview();
    if (oldPreview) URL.revokeObjectURL(oldPreview);
    this.imageFile = file;
    this.imagePreview.set(URL.createObjectURL(file));
    this.errorKey.set(null);
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.productService.getProductById(id).subscribe({
        next: (product) => {
          this.product.set(product ?? null);
          this.originalProduct.set(product ? { ...product } : null);
          this.extras = extrasFromProduct(product ?? {});
          this.searchKeywordsInput.set(product?.searchKeywords?.join(', ') ?? '');
          this.attributeRows.set(product ? productAttributes(product).map((a) => ({ ...a })) : []);
        },
        error: (err) => {
          console.error('Load product error:', err);
          this.errorKey.set('messages.error');
        }
      });
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
          this.product.update((p) => (p ? { ...p, barcode: code } : p));
        }
      });
  }

  updateProduct(): void {
    void this.updateProductAsync();
  }

  private async updateProductAsync(): Promise<void> {
    const product = this.product();
    if (!product) return;

    if (!this.fields.check()) {
      this.errorKey.set('products.fixHighlighted');
      return;
    }
    const before = this.originalProduct();

    this.submitting.set(true);
    this.errorKey.set(null);

    const extrasError = validateExtras(this.extras);
    if (extrasError) {
      this.errorKey.set(extrasError);
      this.submitting.set(false);
      return;
    }
    const searchKeywords = parseKeywordsInput(this.searchKeywordsInput());
    const attributes = this.attributeRows()
      .map((a) => ({ name: a.name.trim(), value: a.value.trim() }))
      .filter((a) => a.name && a.value);
    let payload: Product = {
      ...product,
      attributes: attributes.length > 0 ? attributes : undefined,
      ...legacyColorSize(attributes),
      ...extrasToProductFields(this.extras, product.unit),
      searchKeywords: searchKeywords.length > 0 ? searchKeywords : undefined,
      mxikCode: product.mxikCode?.trim() || null
    };

    try {
      const existing = await firstValueFrom(this.productService.getProducts());
      this.takenIds.set(existing
        .filter((item) => item.id !== product.id)
        .flatMap((item) => [item.barcode, item.sku].filter((v): v is string => !!v)));
      if (!this.fields.check()) {
        this.errorKey.set('products.fixHighlighted');
        this.submitting.set(false);
        return;
      }
      if (this.imageFile) {
        try {
          payload = { ...payload, imageUrl: await firstValueFrom(this.storageService.uploadProductImage(this.imageFile)) };
        } catch (err) {
          console.error('Upload product image error:', err);
          this.errorKey.set('products.imageUploadFailed');
          this.submitting.set(false);
          return;
        }
      }
      await firstValueFrom(this.productService.updateProduct(product.id, payload));
      this.logProductChanges(before, payload);
      await this.router.navigate(['/products/list']);
    } catch (err) {
      console.error('Update product error:', err);
      this.errorKey.set('messages.error');
      this.submitting.set(false);
    }
  }

  /** Diffs every field between the pristine "before" snapshot and the saved
   *  product; logs nothing if nothing actually changed. */
  private logProductChanges(before: Product | null, after: Product) {
    if (!before) return;

    const keys = new Set<keyof Product>([...Object.keys(before), ...Object.keys(after)] as (keyof Product)[]);
    const beforeDiff: Record<string, unknown> = {};
    const afterDiff: Record<string, unknown> = {};

    for (const key of keys) {
      // Plain !== would flag array/object fields (e.g. altUnits) as "changed" on every
      // save even when their contents are identical, since the payload is always a
      // freshly-spread object with new references — so those compare by value instead.
      const beforeVal = before[key];
      const afterVal = after[key];
      const changed =
        typeof beforeVal === 'object' && beforeVal !== null || typeof afterVal === 'object' && afterVal !== null
          ? JSON.stringify(beforeVal) !== JSON.stringify(afterVal)
          : beforeVal !== afterVal;
      if (changed) {
        beforeDiff[key as string] = beforeVal;
        afterDiff[key as string] = afterVal;
      }
    }

    if (Object.keys(afterDiff).length === 0) return;

    this.auditLogService
      .log({
        action: 'product_update',
        entityType: 'product',
        entityId: after.id,
        before: beforeDiff,
        after: afterDiff
      })
      .subscribe();
  }
}

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
import { MatDialog } from '@angular/material/dialog';
import { Product, ProductService } from '../../../core/services/product.service';
import { CategoryService } from '../../../core/services/category.service';
import { AuthService } from '../../../core/services/auth.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { PRODUCT_UNITS } from '../../../core/constants/units';
import { parseAltUnitsInput } from '../../../core/utils/alt-units-parser.util';
import { StorageService } from '../../../core/services/storage.service';
import { firstValueFrom } from 'rxjs';
import { hasDuplicateProductIdentifiers } from '../../../core/utils/product-identifiers';

interface ProductVariantDraft {
  sku: string;
  barcode: string;
  color: string;
  size: string;
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
    MatTooltipModule
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
  canSeeCost = computed(() => this.currentUser()?.role !== 'cashier');

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
    sku: '',
    color: '',
    size: ''
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

  addVariant(): void {
    if (this.variants.length >= 49) return;
    this.variants = [...this.variants, {
      sku: '',
      barcode: '',
      color: '',
      size: '',
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
   *  split/trimmed into `product.searchKeywords` at submit time. */
  searchKeywordsInput = '';

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
    if (!this.product.name.trim() || !this.product.sku?.trim() || !Number.isFinite(this.product.price) || this.product.price < 0 ||
      !Number.isFinite(this.product.quantity) || this.product.quantity < 0) {
      this.errorKey.set('products.invalidProduct');
      return;
    }
    if (this.variants.some((variant) =>
      (!variant.color.trim() && !variant.size.trim()) || !variant.sku.trim() ||
      !Number.isFinite(variant.cost) || variant.cost < 0 ||
      !Number.isFinite(variant.price) || variant.price < 0 ||
      !Number.isFinite(variant.quantity) || variant.quantity < 0
    )) {
      this.errorKey.set('products.invalidVariant');
      return;
    }
    const newProducts = [
      { sku: this.product.sku, barcode: this.product.barcode },
      ...this.variants.map(({ sku, barcode }) => ({ sku, barcode }))
    ];
    if (hasDuplicateProductIdentifiers(newProducts)) {
      this.errorKey.set('products.duplicateBarcode');
      return;
    }
    this.submitting.set(true);
    this.errorKey.set(null);

    const altUnits = parseAltUnitsInput(this.altUnitsInput);
    const searchKeywords = this.searchKeywordsInput
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    const familyId = crypto.randomUUID();
    try {
      const existingProducts = await firstValueFrom(this.productService.getProducts());
      if (hasDuplicateProductIdentifiers([...existingProducts, ...newProducts])) {
        this.errorKey.set('products.duplicateBarcode');
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
      const shared = {
        ...this.product,
        familyId,
        imageUrl,
        altUnits: altUnits.length > 0 ? altUnits : undefined,
        searchKeywords: searchKeywords.length > 0 ? searchKeywords : undefined
      };
      let variants: Omit<Product, 'id'>[];
      try {
        variants = await Promise.all(this.variants.map(async (variant) => ({
          ...shared,
          sku: variant.sku.trim() || undefined,
          barcode: variant.barcode.trim(),
          color: variant.color.trim() || undefined,
          size: variant.size.trim() || undefined,
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

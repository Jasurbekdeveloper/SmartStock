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
import { MatDialog } from '@angular/material/dialog';
import { Product, ProductService } from '../../../core/services/product.service';
import { CategoryService } from '../../../core/services/category.service';
import { AuthService } from '../../../core/services/auth.service';
import { AuditLogService } from '../../../core/services/audit-log.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { PRODUCT_UNITS } from '../../../core/constants/units';
import { formatAltUnitsForInput, parseAltUnitsInput } from '../../../core/utils/alt-units-parser.util';
import { StorageService } from '../../../core/services/storage.service';
import { firstValueFrom } from 'rxjs';
import { hasDuplicateProductIdentifiers } from '../../../core/utils/product-identifiers';

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
    MatTooltipModule
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
  canSeeCost = computed(() => this.currentUser()?.role !== 'cashier');

  submitting = signal(false);
  errorKey = signal<string | null>(null);

  /** Free-text "unit:factor,unit:factor" input, e.g. "quti:20,karobka:100" — pre-filled
   *  from the loaded product's `altUnits` (see `ngOnInit`) and parsed back via
   *  `parseAltUnitsInput()` at save time. A signal (not a plain field) so the zoneless
   *  pre-fill from the async product load actually refreshes the view. */
  altUnitsInput = signal('');

  /** Free-text comma-separated synonyms/loanwords, e.g. "truba, quvur shlangi" —
   *  pre-filled from the loaded product's `searchKeywords` (see `ngOnInit`) and
   *  split/trimmed back at save time. A signal (not a plain field) for the same
   *  zoneless reason as `altUnitsInput` above. */
  searchKeywordsInput = signal('');
  imageFile: File | null = null;
  imagePreview = signal<string | null>(null);

  ngOnDestroy(): void {
    const preview = this.imagePreview();
    if (preview) URL.revokeObjectURL(preview);
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

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.productService.getProductById(id).subscribe({
        next: (product) => {
          this.product.set(product ?? null);
          this.originalProduct.set(product ? { ...product } : null);
          this.altUnitsInput.set(formatAltUnitsForInput(product?.altUnits));
          this.searchKeywordsInput.set(product?.searchKeywords?.join(', ') ?? '');
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

    if (!product.name.trim() || !product.sku?.trim() || !Number.isFinite(product.price) || product.price < 0 ||
      !Number.isFinite(product.quantity) || product.quantity < 0) {
      this.errorKey.set('products.invalidProduct');
      return;
    }
    const before = this.originalProduct();

    this.submitting.set(true);
    this.errorKey.set(null);

    const altUnits = parseAltUnitsInput(this.altUnitsInput());
    const searchKeywords = this.searchKeywordsInput()
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    let payload: Product = {
      ...product,
      altUnits: altUnits.length > 0 ? altUnits : undefined,
      searchKeywords: searchKeywords.length > 0 ? searchKeywords : undefined
    };

    try {
      const existing = await firstValueFrom(this.productService.getProducts());
      const duplicate = hasDuplicateProductIdentifiers([
        ...existing.filter((item) => item.id !== product.id),
        payload
      ]);
      if (duplicate) {
        this.errorKey.set('products.duplicateBarcode');
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

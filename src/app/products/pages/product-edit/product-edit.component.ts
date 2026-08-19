import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
export class ProductEditComponent implements OnInit {
  private productService = inject(ProductService);
  private categoryService = inject(CategoryService);
  private authService = inject(AuthService);
  private auditLogService = inject(AuditLogService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialog = inject(MatDialog);

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

  updateProduct() {
    const product = this.product();
    if (!product) return;

    const before = this.originalProduct();

    this.submitting.set(true);
    this.errorKey.set(null);

    const altUnits = parseAltUnitsInput(this.altUnitsInput());
    const searchKeywords = this.searchKeywordsInput()
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    const payload: Product = {
      ...product,
      altUnits: altUnits.length > 0 ? altUnits : undefined,
      searchKeywords: searchKeywords.length > 0 ? searchKeywords : undefined
    };

    this.productService.updateProduct(product.id, payload).subscribe({
      next: () => {
        this.logProductChanges(before, payload);
        this.router.navigate(['/products/list']);
      },
      error: (err) => {
        console.error('Update product error:', err);
        this.errorKey.set('messages.error');
        this.submitting.set(false);
      }
    });
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

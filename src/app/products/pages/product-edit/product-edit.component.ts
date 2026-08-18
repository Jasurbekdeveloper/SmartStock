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

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.productService.getProductById(id).subscribe({
        next: (product) => {
          this.product.set(product ?? null);
          this.originalProduct.set(product ? { ...product } : null);
        },
        error: (err) => {
          console.error('Load product error:', err);
          this.errorKey.set('messages.error');
        }
      });
    }
  }

  /** Persists only when an alt unit is actually chosen — an empty selection clears
   *  both fields (updateProduct() converts the resulting `undefined` into Firestore's
   *  deleteField() sentinel so the old value is actually removed). */
  onAltUnitChange(altUnit: string | null) {
    this.product.update((p) => {
      if (!p) return p;
      if (altUnit) {
        return { ...p, altUnit };
      }
      return { ...p, altUnit: undefined, altUnitFactor: undefined };
    });
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

    this.productService.updateProduct(product.id, product).subscribe({
      next: () => {
        this.logProductChanges(before, product);
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
      if (before[key] !== after[key]) {
        beforeDiff[key as string] = before[key];
        afterDiff[key as string] = after[key];
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

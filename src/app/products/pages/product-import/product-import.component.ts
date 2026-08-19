import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Product, ProductService } from '../../../core/services/product.service';
import { CategoryService } from '../../../core/services/category.service';
import { AuditLogService } from '../../../core/services/audit-log.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { parseAltUnitsInput } from '../../../core/utils/alt-units-parser.util';
import {
  ParsedProductRow,
  PRODUCT_IMPORT_HEADERS,
  generateProductImportTemplate,
  parseProductExcelFile
} from '../../../core/utils/product-excel-import.util';

type ImportAction = 'create' | 'update';

/** One previewed row, ready to be committed on confirm. `categoryId` is already
 *  resolved from the raw category name in the file (undefined if no category
 *  matched or none was given — `categoryWarning` flags the former for the UI). */
interface PreviewRow {
  parsed: ParsedProductRow;
  action: ImportAction;
  existingId?: string;
  categoryId?: string;
  categoryWarning: boolean;
}

interface ImportResult {
  created: number;
  updated: number;
  failed: number;
  failures: string[];
}

@Component({
  selector: 'app-product-import',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    TranslatePipe,
    TranslateModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule
  ],
  templateUrl: './product-import.component.html',
  styleUrl: './product-import.component.css'
})
export class ProductImportComponent {
  private productService = inject(ProductService);
  private categoryService = inject(CategoryService);
  private auditLogService = inject(AuditLogService);
  private toastService = inject(ToastService);
  private translateService = inject(TranslateService);
  private router = inject(Router);

  /** Exposed so the template can render the documented column headers as a hint. */
  readonly headers = PRODUCT_IMPORT_HEADERS;

  categories = toSignal(this.categoryService.getCategories(), { initialValue: [] });

  fileName = signal<string | null>(null);
  parsing = signal(false);
  fileErrors = signal<string[]>([]);
  previewRows = signal<PreviewRow[]>([]);

  importing = signal(false);
  importResult = signal<ImportResult | null>(null);

  summary = computed(() => {
    const rows = this.previewRows();
    return {
      create: rows.filter((r) => r.action === 'create').length,
      update: rows.filter((r) => r.action === 'update').length,
      error: this.fileErrors().length
    };
  });

  canConfirm = computed(() => !this.importing() && !this.parsing() && this.previewRows().length > 0);

  downloadTemplate(): void {
    generateProductImportTemplate();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.fileName.set(file.name);
    this.parsing.set(true);
    this.fileErrors.set([]);
    this.previewRows.set([]);
    this.importResult.set(null);

    try {
      const [{ rows, errors }, existingProducts] = await Promise.all([
        parseProductExcelFile(file),
        firstValueFrom(this.productService.getProducts())
      ]);

      const existingByBarcode = new Map<string, Product>();
      for (const product of existingProducts) {
        if (product.barcode) existingByBarcode.set(product.barcode, product);
      }

      const categoriesByName = new Map(this.categories().map((c) => [c.name.trim().toLowerCase(), c.id]));

      const preview: PreviewRow[] = rows.map((parsed) => {
        const existing = existingByBarcode.get(parsed.barcode);
        let categoryId: string | undefined;
        let categoryWarning = false;
        if (parsed.categoryName) {
          const match = categoriesByName.get(parsed.categoryName.trim().toLowerCase());
          if (match) {
            categoryId = match;
          } else {
            categoryWarning = true;
          }
        }

        return {
          parsed,
          action: existing ? 'update' : 'create',
          existingId: existing?.id,
          categoryId,
          categoryWarning
        };
      });

      this.previewRows.set(preview);
      this.fileErrors.set(errors);
    } catch (err) {
      console.error('Product import parse error:', err);
      this.fileErrors.set(['messages.error']);
    } finally {
      this.parsing.set(false);
    }
  }

  async confirmImport(): Promise<void> {
    const rows = this.previewRows();
    if (rows.length === 0 || this.importing()) return;

    this.importing.set(true);
    this.importResult.set(null);

    let created = 0;
    let updated = 0;
    let failed = 0;
    const failures: string[] = [];

    // Sequential (not a Firestore writeBatch) — realistically a few hundred rows
    // at most for initial store setup, and this reuses ProductService's existing
    // addProduct/updateProduct methods (undefined-stripping, deleteField, etc.)
    // instead of duplicating their write logic.
    for (const row of rows) {
      const parsed = row.parsed;
      const altUnits = parsed.altUnitsRaw ? parseAltUnitsInput(parsed.altUnitsRaw) : [];
      const searchKeywords = parsed.searchKeywordsRaw
        ? parsed.searchKeywordsRaw
            .split(',')
            .map((k) => k.trim())
            .filter((k) => k.length > 0)
        : [];

      // Required columns (always present for a row to have passed parsing) are
      // always written. Optional fields are only included when the row actually
      // supplies a value — on an UPDATE, `updateProduct()` turns an explicit
      // `undefined` into Firestore's deleteField(), so blindly including e.g.
      // `minQuantity: undefined` for a row that just left that column blank
      // would silently wipe out the existing product's value. Omitting the key
      // entirely instead leaves it untouched.
      const requiredFields = {
        name: parsed.name,
        barcode: parsed.barcode,
        price: parsed.price,
        cost: parsed.cost,
        quantity: parsed.quantity,
        unit: parsed.unit
      };
      const optionalFields: Partial<Product> = {};
      if (parsed.minQuantity !== undefined) optionalFields.minQuantity = parsed.minQuantity;
      if (parsed.description !== undefined) optionalFields.description = parsed.description;
      if (altUnits.length > 0) optionalFields.altUnits = altUnits;
      if (searchKeywords.length > 0) optionalFields.searchKeywords = searchKeywords;
      if (row.categoryId !== undefined) optionalFields.categoryId = row.categoryId;

      try {
        if (row.action === 'update' && row.existingId) {
          await firstValueFrom(
            this.productService.updateProduct(row.existingId, { ...requiredFields, ...optionalFields })
          );
          updated++;
        } else {
          // A brand-new product always needs a categoryId (even if empty) since
          // it's a required field on `Product` — unlike the update path, there's
          // no existing value to preserve by omission.
          const createData: Omit<Product, 'id'> = {
            ...requiredFields,
            ...optionalFields,
            categoryId: optionalFields.categoryId ?? ''
          };
          await firstValueFrom(this.productService.addProduct(createData));
          created++;
        }
      } catch (err) {
        console.error('Product import row failed:', parsed.rowNumber, err);
        failed++;
        failures.push(`${parsed.rowNumber}: ${parsed.name || parsed.barcode}`);
      }
    }

    try {
      await firstValueFrom(
        this.auditLogService.log({
          action: 'product_bulk_import',
          entityType: 'product',
          entityId: 'bulk-import',
          after: { createdCount: created, updatedCount: updated, failedCount: failed }
        })
      );
    } catch (err) {
      console.error('Product import audit log failed:', err);
    }

    this.importing.set(false);
    this.importResult.set({ created, updated, failed, failures });
    this.previewRows.set([]);

    if (failed === 0) {
      this.toastService.success(this.translateService.instant('products.import.importComplete'));
    } else {
      this.toastService.error(this.translateService.instant('products.import.importComplete'));
    }
  }

  goToList(): void {
    this.router.navigate(['/products/list']);
  }
}

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
import { SumPipe } from '../../../core/pipes/sum.pipe';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { parseAltUnitsInput } from '../../../core/utils/alt-units-parser.util';
import { expiryFromShelfLife } from '../../../core/utils/batches';
import { BatchService, NewBatchInput } from '../../../core/services/batch.service';
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
  /** The existing product already has expiry tracking (its stock is dated by batches). */
  existingTracked?: boolean;
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
  imports: [SumPipe, 
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
  private batchService = inject(BatchService);
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

      const existingByIdentifier = new Map<string, Product>();
      for (const product of existingProducts) {
        if (product.barcode) existingByIdentifier.set(product.barcode.trim().toLocaleLowerCase(), product);
        if (product.sku) existingByIdentifier.set(product.sku.trim().toLocaleLowerCase(), product);
      }

      const categoriesByName = new Map(this.categories().map((c) => [c.name.trim().toLowerCase(), c.id]));

      const preview: PreviewRow[] = rows.map((parsed) => {
        const existing = existingByIdentifier.get((parsed.sku ?? parsed.barcode).trim().toLocaleLowerCase())
          ?? existingByIdentifier.get(parsed.barcode.trim().toLocaleLowerCase());
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
          existingTracked: !!existing?.trackExpiry,
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

    const creates: { row: PreviewRow; data: Omit<Product, 'id'>; batch?: NewBatchInput }[] = [];
    const trackedCategories = new Set(this.categories().filter((c) => c.trackExpiry).map((c) => c.id));

    for (const row of rows) {
      const parsed = row.parsed;
      const altUnits = parsed.altUnitsRaw ? parseAltUnitsInput(parsed.altUnitsRaw) : [];
      const searchKeywords = parsed.searchKeywordsRaw
        ? parsed.searchKeywordsRaw
            .split(',')
            .map((k) => k.trim())
            .filter((k) => k.length > 0)
        : [];

      // Required columns are always written. Optional fields are only included when
      // the row supplies a value — on an UPDATE, `updateProduct()` turns an explicit
      // `undefined` into deleteField(), so a blank optional column must be omitted
      // rather than wipe the existing value.
      const requiredFields = {
        name: parsed.name,
        sku: parsed.sku ?? parsed.barcode,
        barcode: parsed.barcode,
        price: parsed.price,
        cost: parsed.cost,
        quantity: parsed.quantity,
        unit: parsed.unit
      };
      const optionalFields: Partial<Product> = {};
      if (parsed.minQuantity !== undefined) optionalFields.minQuantity = parsed.minQuantity;
      if (parsed.description !== undefined) optionalFields.description = parsed.description;
      if (parsed.color !== undefined) optionalFields.color = parsed.color;
      if (parsed.size !== undefined) optionalFields.size = parsed.size;
      if (parsed.familyId !== undefined) optionalFields.familyId = parsed.familyId;
      if (parsed.imageUrl !== undefined) optionalFields.imageUrl = parsed.imageUrl;
      if (altUnits.length > 0) optionalFields.altUnits = altUnits;
      if (searchKeywords.length > 0) optionalFields.searchKeywords = searchKeywords;
      if (row.categoryId !== undefined) optionalFields.categoryId = row.categoryId;

      // Expiry columns: any date or a shelf life switches tracking on. The stock in
      // the row becomes the product's first dated batch.
      const expiry = parsed.expiryDate ?? expiryFromShelfLife(parsed.manufactureDate, parsed.shelfLifeDays) ?? undefined;
      const dated = !!expiry || parsed.shelfLifeDays !== undefined;
      if (dated) optionalFields.trackExpiry = true;
      if (parsed.shelfLifeDays !== undefined) optionalFields.shelfLifeDays = parsed.shelfLifeDays;
      const batch: NewBatchInput | undefined =
        expiry && parsed.quantity > 0
          ? {
              quantity: parsed.quantity,
              expiryDate: expiry,
              manufactureDate: parsed.manufactureDate ?? null,
              batchNo: parsed.batchNo ?? null,
              costPrice: parsed.cost || undefined
            }
          : undefined;

      if (row.action === 'update' && row.existingId) {
        try {
          await firstValueFrom(this.productService.updateProduct(row.existingId, { ...requiredFields, ...optionalFields }));
          // Date the stock only when the product had no batches yet — otherwise the
          // file's total would double-count stock already dated by earlier deliveries.
          if (batch && !row.existingTracked) await firstValueFrom(this.batchService.create(row.existingId, batch));
          updated++;
        } catch (err) {
          console.error('Product import row failed:', parsed.rowNumber, err);
          failed++;
          failures.push(`${parsed.rowNumber}: ${parsed.name || parsed.barcode}`);
        }
      } else {
        const categoryId = optionalFields.categoryId ?? '';
        creates.push({
          row,
          batch,
          data: {
            ...requiredFields,
            ...optionalFields,
            trackExpiry: optionalFields.trackExpiry ?? trackedCategories.has(categoryId),
            categoryId
          }
        });
      }
    }

    // New products go in bulk (Firestore write batches of 200) — hundreds of rows
    // import in seconds instead of one round-trip per row. If the bulk write is
    // refused (e.g. the plan's product limit), fall back to row by row so the
    // admin sees exactly which rows did not make it.
    // Each chunk of 200 is one atomic commit, so a failed chunk wrote nothing and
    // can safely be retried row by row.
    for (let start = 0; start < creates.length; start += 200) {
      const chunk = creates.slice(start, start + 200);
      try {
        await firstValueFrom(this.productService.addProducts(chunk.map((c) => c.data), chunk.map((c) => c.batch)));
        created += chunk.length;
      } catch (bulkErr) {
        console.warn('Bulk product import failed, retrying row by row:', bulkErr);
        for (const c of chunk) {
          try {
            await firstValueFrom(this.productService.addProduct(c.data, c.batch));
            created++;
          } catch (err) {
            console.error('Product import row failed:', c.row.parsed.rowNumber, err);
            failed++;
            failures.push(`${c.row.parsed.rowNumber}: ${c.row.parsed.name || c.row.parsed.barcode}`);
          }
        }
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

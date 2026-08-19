import * as XLSX from 'xlsx';

/** One row parsed from an uploaded product-import Excel file, mapped from the
 *  documented column headers (see `PRODUCT_IMPORT_HEADERS`) to Product-ish fields.
 *  `categoryName`/`altUnitsRaw`/`searchKeywordsRaw` are left as raw strings here —
 *  resolving a category name to a `categoryId` and parsing alt units/keywords needs
 *  data (the live category list) that isn't available at parse time, so that's done
 *  by the caller (`product-import.component.ts`) once it has `getCategories()`. */
export interface ParsedProductRow {
  rowNumber: number;
  name: string;
  barcode: string;
  price: number;
  cost: number;
  quantity: number;
  unit: string;
  minQuantity?: number;
  categoryName?: string;
  altUnitsRaw?: string;
  searchKeywordsRaw?: string;
  description?: string;
}

/** Documented column headers this importer expects (single sheet, first row).
 *  Uzbek (Latin) was chosen as the one consistent header language, matching the
 *  rest of this app's admin-facing text. Also drives `generateProductImportTemplate()`
 *  below, so the downloadable template and the parser can never drift apart. */
export const PRODUCT_IMPORT_HEADERS = {
  name: 'Nomi',
  barcode: 'Shtrix-kod',
  price: 'Narx',
  cost: 'Tannarx',
  quantity: 'Miqdor',
  unit: 'Birlik',
  minQuantity: 'Min. miqdor',
  category: 'Kategoriya',
  altUnits: 'Muqobil birliklar',
  searchKeywords: "Kalit so'zlar",
  description: 'Tavsif'
} as const;

function findValue(row: Record<string, unknown>, header: string): unknown {
  // Header matching is case/whitespace tolerant — a shop admin retyping headers
  // by hand shouldn't break the whole import over a capitalization difference.
  const targetKey = Object.keys(row).find((k) => k.trim().toLowerCase() === header.trim().toLowerCase());
  return targetKey !== undefined ? row[targetKey] : undefined;
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.').trim());
  return Number.isFinite(n) ? n : undefined;
}

function toText(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

/** Reads an uploaded .xlsx/.xls file and maps rows to `ParsedProductRow`s.
 *  A row with a missing/invalid required field (name, barcode, price, quantity,
 *  unit) is dropped from `rows` and instead produces a message in `errors` —
 *  one bad row doesn't abort the whole file. Fully blank rows (e.g. trailing
 *  empty rows in the sheet) are silently skipped, not reported as errors. */
export function parseProductExcelFile(file: File): Promise<{ rows: ParsedProductRow[]; errors: string[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('File read error'));
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });

        const rows: ParsedProductRow[] = [];
        const errors: string[] = [];

        rawRows.forEach((rawRow, index) => {
          // sheet_to_json rows are 0-indexed starting right after the header row
          // (spreadsheet row 1) — so the first data row is spreadsheet row 2.
          const rowNumber = index + 2;

          const name = toText(findValue(rawRow, PRODUCT_IMPORT_HEADERS.name));
          const barcode = toText(findValue(rawRow, PRODUCT_IMPORT_HEADERS.barcode));
          const price = toNumber(findValue(rawRow, PRODUCT_IMPORT_HEADERS.price));
          const cost = toNumber(findValue(rawRow, PRODUCT_IMPORT_HEADERS.cost));
          const quantity = toNumber(findValue(rawRow, PRODUCT_IMPORT_HEADERS.quantity));
          const unit = toText(findValue(rawRow, PRODUCT_IMPORT_HEADERS.unit));
          const minQuantity = toNumber(findValue(rawRow, PRODUCT_IMPORT_HEADERS.minQuantity));
          const categoryName = toText(findValue(rawRow, PRODUCT_IMPORT_HEADERS.category)) || undefined;
          const altUnitsRaw = toText(findValue(rawRow, PRODUCT_IMPORT_HEADERS.altUnits)) || undefined;
          const searchKeywordsRaw = toText(findValue(rawRow, PRODUCT_IMPORT_HEADERS.searchKeywords)) || undefined;
          const description = toText(findValue(rawRow, PRODUCT_IMPORT_HEADERS.description)) || undefined;

          const isBlank = !name && !barcode && price === undefined && quantity === undefined && !unit;
          if (isBlank) return;

          const rowErrors: string[] = [];
          if (!name) rowErrors.push(`Row ${rowNumber}: ${PRODUCT_IMPORT_HEADERS.name} is missing`);
          if (!barcode) rowErrors.push(`Row ${rowNumber}: ${PRODUCT_IMPORT_HEADERS.barcode} is missing`);
          if (price === undefined) rowErrors.push(`Row ${rowNumber}: ${PRODUCT_IMPORT_HEADERS.price} is missing or invalid`);
          if (quantity === undefined)
            rowErrors.push(`Row ${rowNumber}: ${PRODUCT_IMPORT_HEADERS.quantity} is missing or invalid`);
          if (!unit) rowErrors.push(`Row ${rowNumber}: ${PRODUCT_IMPORT_HEADERS.unit} is missing`);

          if (rowErrors.length > 0) {
            errors.push(...rowErrors);
            return;
          }

          rows.push({
            rowNumber,
            name,
            barcode,
            price: price as number,
            cost: cost ?? 0,
            quantity: quantity as number,
            unit,
            minQuantity,
            categoryName,
            altUnitsRaw,
            searchKeywordsRaw,
            description
          });
        });

        resolve({ rows, errors });
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

/** Downloads a blank .xlsx template (documented headers + one filled-in example
 *  row) so a shop admin knows exactly what format the importer expects — the
 *  single most important UX affordance for a bulk-import feature. */
export function generateProductImportTemplate(): void {
  const exampleRow: Record<string, unknown> = {
    [PRODUCT_IMPORT_HEADERS.name]: 'Sement M400',
    [PRODUCT_IMPORT_HEADERS.barcode]: '1234567890123',
    [PRODUCT_IMPORT_HEADERS.price]: 45000,
    [PRODUCT_IMPORT_HEADERS.cost]: 38000,
    [PRODUCT_IMPORT_HEADERS.quantity]: 100,
    [PRODUCT_IMPORT_HEADERS.unit]: 'dona',
    [PRODUCT_IMPORT_HEADERS.minQuantity]: 10,
    [PRODUCT_IMPORT_HEADERS.category]: 'Qurilish materiallari',
    [PRODUCT_IMPORT_HEADERS.altUnits]: 'quti:20,karobka:100',
    [PRODUCT_IMPORT_HEADERS.searchKeywords]: 'sement, tsement',
    [PRODUCT_IMPORT_HEADERS.description]: 'M400 markali sement, 50 kg qop'
  };

  const worksheet = XLSX.utils.json_to_sheet([exampleRow], { header: Object.values(PRODUCT_IMPORT_HEADERS) });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Mahsulotlar');
  XLSX.writeFile(workbook, 'mahsulotlar_shablon.xlsx');
}

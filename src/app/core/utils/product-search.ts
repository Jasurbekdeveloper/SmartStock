import { normalizeForSearch } from './uzbek-transliteration';

export interface SearchableProduct {
  name: string;
  barcode?: string | null;
  sku?: string | null;
  searchKeywords?: string[];
  altUnits?: { barcode?: string | null }[];
}

/** Product whose barcode or SKU is exactly the code (what a scanner types). */
export function findByCode<T extends SearchableProduct>(products: T[], code: string): T | undefined {
  const c = code.trim();
  if (!c) return undefined;
  // A package barcode (quti / blok) also finds its product.
  return products.find((p) => p.barcode === c || p.sku === c) ?? products.find((p) => p.altUnits?.some((a) => a.barcode === c));
}

/**
 * Products for a typed or scanned query: an exact barcode/SKU first, then name and
 * search-keyword matches (Latin or Cyrillic, any apostrophe), then barcodes that start
 * with the typed digits.
 */
export function searchProducts<T extends SearchableProduct>(products: T[], query: string, limit = 8): T[] {
  const raw = query.trim();
  const q = normalizeForSearch(raw);
  if (!q) return [];
  const exact = findByCode(products, raw);
  const out: T[] = exact ? [exact] : [];
  for (const p of products) {
    if (out.length >= limit) break;
    if (p === exact) continue;
    if (
      normalizeForSearch(p.name).includes(q) ||
      (p.searchKeywords ?? []).some((k) => normalizeForSearch(k).includes(q)) ||
      (raw.length >= 3 && (p.barcode?.startsWith(raw) || p.sku?.toLowerCase().startsWith(raw.toLowerCase())))
    ) {
      out.push(p);
    }
  }
  return out;
}

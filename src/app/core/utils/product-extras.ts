import type { Product } from '../services/product.service';
import type { AltUnit } from './alt-units-parser.util';

/** Form state for the pricing/stock extras shared by the create, edit and quick-entry
 *  screens: wholesale price, alternate units, expiry and batch. */
export interface ProductExtrasDraft {
  wholesalePrice: number | null;
  wholesaleMinQty: number | null;
  altUnits: { unit: string; factor: number | null }[];
  trackExpiry: boolean;
  /** yyyy-mm-dd from <input type="date">, '' when unset. */
  expiryDate: string;
  batchNo: string;
}

export function emptyExtras(): ProductExtrasDraft {
  return { wholesalePrice: null, wholesaleMinQty: null, altUnits: [], trackExpiry: false, expiryDate: '', batchNo: '' };
}

function toDateInput(date: Date | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** yyyy-mm-dd → local midnight Date (not UTC, so the day never shifts). */
export function fromDateInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function extrasFromProduct(p: Partial<Product>): ProductExtrasDraft {
  return {
    wholesalePrice: p.wholesalePrice ?? null,
    wholesaleMinQty: p.wholesaleMinQty ?? null,
    altUnits: (p.altUnits ?? []).map((a) => ({ ...a })),
    trackExpiry: !!p.expiryDate || !!p.batchNo,
    expiryDate: toDateInput(p.expiryDate ?? null),
    batchNo: p.batchNo ?? ''
  };
}

/** Valid alternate units: named, positive factor, unique names (last wins), not the primary unit. */
export function cleanAltUnits(rows: ProductExtrasDraft['altUnits'], primaryUnit?: string): AltUnit[] {
  const result = new Map<string, number>();
  for (const row of rows) {
    const unit = row.unit.trim();
    const factor = Number(row.factor);
    if (!unit || unit === primaryUnit || !Number.isFinite(factor) || factor <= 0) continue;
    result.set(unit, factor);
  }
  return [...result].map(([unit, factor]) => ({ unit, factor }));
}

/** Fields to merge into the product document. Cleared values become null (wholesale,
 *  expiry, batch) so an edit can remove them; empty alt units become undefined. */
export function extrasToProductFields(d: ProductExtrasDraft, primaryUnit?: string): Partial<Product> {
  const wholesale = Number(d.wholesalePrice);
  const hasWholesale = Number.isFinite(wholesale) && wholesale > 0;
  const minQty = Number(d.wholesaleMinQty);
  const altUnits = cleanAltUnits(d.altUnits, primaryUnit);
  return {
    wholesalePrice: hasWholesale ? wholesale : null,
    wholesaleMinQty: hasWholesale && Number.isFinite(minQty) && minQty > 0 ? minQty : null,
    altUnits: altUnits.length > 0 ? altUnits : undefined,
    expiryDate: d.trackExpiry ? fromDateInput(d.expiryDate) : null,
    batchNo: d.trackExpiry && d.batchNo.trim() ? d.batchNo.trim() : null
  };
}

/** i18n key of the first problem, or null. A wholesale price above retail is allowed
 *  (rare, but some stores price packs that way) — the form only warns about it. */
export function validateExtras(d: ProductExtrasDraft): string | null {
  if (d.wholesalePrice !== null && String(d.wholesalePrice) !== '' && !(Number(d.wholesalePrice) >= 0)) {
    return 'products.invalidWholesale';
  }
  if (d.wholesaleMinQty !== null && String(d.wholesaleMinQty) !== '' && !(Number(d.wholesaleMinQty) >= 0)) {
    return 'products.invalidWholesale';
  }
  if (d.altUnits.some((r) => r.unit.trim() && !(Number(r.factor) > 0))) return 'products.invalidAltUnit';
  if (d.trackExpiry && d.expiryDate && !fromDateInput(d.expiryDate)) return 'products.invalidExpiry';
  return null;
}

import { isValidMxikCode } from './product-identifiers';
import { attributesKey, ProductAttribute } from './product-variants';

/** Field key -> i18n key of the message shown under that field. Variant fields are
 *  keyed `v<index>.<field>` (e.g. "v0.price"), attribute values `base.a<axis>` /
 *  `v<index>.a<axis>`, attribute names `axis<index>`. */
export type FieldErrors = Record<string, string>;

export interface ProductFormFields {
  name: string;
  sku?: string;
  barcode?: string;
  price: number;
  cost: number;
  quantity: number;
  mxikCode?: string | null;
  /** Values of the base product for each variant axis (create form). */
  values?: string[];
}

export interface VariantFormFields {
  sku: string;
  barcode: string;
  /** One value per variant axis, in axis order. */
  values: string[];
  price: number;
  cost: number;
  quantity: number;
}

export interface ProductFormOptions {
  /** Cashiers don't see the cost field, so it can't be required from them. */
  requireCost: boolean;
  /** SKUs/barcodes already used by other products of the store. */
  taken?: Iterable<string | null | undefined>;
  /** Names of the variant characteristics (create form), e.g. ["Hajm", "Shakl"]. */
  axes?: readonly string[];
}

const positive = (v: unknown) => Number.isFinite(Number(v)) && Number(v) > 0 && v !== null && v !== '';
const nonNegative = (v: unknown) => Number.isFinite(Number(v)) && Number(v) >= 0 && v !== null && v !== '';
const norm = (v: string | null | undefined) => v?.trim().toLocaleLowerCase() ?? '';

/**
 * Validates the product create/edit form and says which field is wrong, so the form
 * can mark exactly that field red instead of showing one generic message.
 */
export function validateProductForm(
  product: ProductFormFields,
  variants: readonly VariantFormFields[],
  options: ProductFormOptions
): FieldErrors {
  const errors: FieldErrors = {};
  const set = (key: string, message: string) => { if (!errors[key]) errors[key] = message; };

  if (!product.name?.trim()) set('name', 'products.errRequired');
  if (!product.sku?.trim()) set('sku', 'products.errRequired');
  if (!positive(product.price)) set('price', 'products.errPrice');
  if (options.requireCost && !positive(product.cost)) set('cost', 'products.errCost');
  if (!nonNegative(product.quantity)) set('quantity', 'products.errQuantity');
  if (product.mxikCode?.trim() && !isValidMxikCode(product.mxikCode)) set('mxik', 'products.invalidMxik');

  variants.forEach((v, i) => {
    const k = (field: string) => `v${i}.${field}`;
    if (!v.sku?.trim()) set(k('sku'), 'products.errRequired');
    if (!positive(v.price)) set(k('price'), 'products.errPrice');
    if (options.requireCost && !positive(v.cost)) set(k('cost'), 'products.errCost');
    if (!nonNegative(v.quantity)) set(k('quantity'), 'products.errQuantity');
  });

  // Variant characteristics: named, not repeated; with variants every row needs a value
  // and no two rows may have the same set of values.
  const axes = options.axes ?? [];
  const axisNames = new Set<string>();
  axes.forEach((name, j) => {
    const key = name.trim().toLocaleLowerCase();
    if (!key) set(`axis${j}`, 'products.errRequired');
    else if (axisNames.has(key)) set(`axis${j}`, 'products.errDuplicateAxis');
    axisNames.add(key);
  });
  if (axes.length > 0) {
    const valueRows = [
      { prefix: 'base', values: product.values ?? [] },
      ...variants.map((v, i) => ({ prefix: `v${i}`, values: v.values }))
    ];
    const needsValue = variants.length > 0;
    const seenCombos = new Set<string>();
    for (const row of valueRows) {
      const values = axes.map((_, j) => row.values[j] ?? '');
      const empty = values.every((v) => !v.trim());
      const mark = (message: string) => axes.forEach((_, j) => set(`${row.prefix}.a${j}`, message));
      if (empty) {
        if (needsValue) mark('products.errVariantValue');
        continue;
      }
      const combo = attributesKey(values);
      if (seenCombos.has(combo)) mark('products.errDuplicateVariant');
      seenCombos.add(combo);
    }
  }

  // Duplicate SKU/barcode: across the products in this form and against the store.
  // One product may reuse its barcode as its SKU (same rule as hasDuplicateProductIdentifiers).
  const rows = [
    { sku: 'sku', barcode: 'barcode', values: product },
    ...variants.map((v, i) => ({ sku: `v${i}.sku`, barcode: `v${i}.barcode`, values: v }))
  ];
  const owners = new Map<string, Set<number>>();
  rows.forEach((row, index) => {
    for (const value of [norm(row.values.sku), norm(row.values.barcode)]) {
      if (!value) continue;
      if (!owners.has(value)) owners.set(value, new Set());
      owners.get(value)!.add(index);
    }
  });
  const taken = new Set([...(options.taken ?? [])].map(norm).filter(Boolean));
  rows.forEach((row) => {
    for (const field of ['sku', 'barcode'] as const) {
      const value = norm(row.values[field]);
      if (value && ((owners.get(value)?.size ?? 0) > 1 || taken.has(value))) set(row[field], 'products.errDuplicate');
    }
  });

  return errors;
}

/** Name/value rows of the edit form: a row needs both parts, or neither (then it's dropped). */
export function validateAttributeRows(rows: readonly ProductAttribute[]): FieldErrors {
  const errors: FieldErrors = {};
  const names = new Set<string>();
  rows.forEach((row, j) => {
    const name = row.name.trim();
    const value = row.value.trim();
    if (!name && !value) return;
    if (!name) errors[`attr${j}.name`] = 'products.errRequired';
    else if (names.has(name.toLocaleLowerCase())) errors[`attr${j}.name`] = 'products.errDuplicateAxis';
    if (!value) errors[`attr${j}.value`] = 'products.errRequired';
    names.add(name.toLocaleLowerCase());
  });
  return errors;
}

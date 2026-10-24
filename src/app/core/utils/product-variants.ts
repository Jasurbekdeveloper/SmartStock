import { normalizeForSearch, toLatin } from './uzbek-transliteration';

/** One characteristic that tells variants of a product apart, e.g. Hajm = "80 L". */
export interface ProductAttribute {
  name: string;
  value: string;
}

/** A characteristic chosen for a product family, with the values to build variants from. */
export interface VariantAxis {
  name: string;
  values: string[];
}

export interface AttributePreset {
  name: string;
  /** Example values, shown as a placeholder. */
  examples: string;
}

/** Characteristics that cover most building-material and household goods. Any other
 *  name can be typed in by hand. "Rang" and "O'lcham" map to the legacy color/size fields. */
export const VARIANT_ATTRIBUTE_PRESETS: readonly AttributePreset[] = [
  { name: 'Rang', examples: 'oq, qora, kulrang' },
  { name: "O'lcham", examples: '20x30, 60x60, XL' },
  { name: 'Hajm', examples: '30 L, 50 L, 80 L, 100 L' },
  { name: 'Quvvat', examples: '1.5 kW, 2 kW, 2.5 kW' },
  { name: 'Uzunlik', examples: '50 mm, 70 mm, 100 mm' },
  { name: 'Diametr', examples: '16 mm, 20 mm, 25 mm' },
  { name: 'Qalinlik', examples: '9 mm, 12 mm, 15 mm' },
  { name: 'Kesim', examples: '1.5 mm², 2.5 mm², 4 mm²' },
  { name: "Og'irlik", examples: '25 kg, 50 kg' },
  { name: 'Qadoq', examples: 'qop, paket, quti' },
  { name: 'Marka', examples: 'M400, M500' },
  { name: 'Material', examples: "plastik, metall, yog'och" },
  { name: 'Qoplama', examples: 'oddiy, oqlangan, rux' },
  { name: 'Shakl', examples: 'vertikal, gorizontal' },
  { name: 'Model', examples: 'ABS PRO, Velis' }
];

export const MAX_VARIANT_AXES = 3;

export function presetExamples(name: string): string {
  const key = normalizeForSearch(name.trim());
  return VARIANT_ATTRIBUTE_PRESETS.find((p) => normalizeForSearch(p.name) === key)?.examples ?? '';
}

/** "50 L, 80 L" -> ["50 L", "80 L"] (trimmed, empty and repeated entries dropped). */
export function parseAxisValues(input: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of input.split(',')) {
    const value = raw.trim();
    const key = normalizeForSearch(value);
    if (value && !seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  return result;
}

/** Every combination of the axes' values, in axis order (cartesian product). */
export function attributeCombinations(axes: readonly VariantAxis[], limit = 50): string[][] {
  const usable = axes.filter((a) => a.values.length > 0);
  if (usable.length === 0) return [];
  let combos: string[][] = [[]];
  for (const axis of axes) {
    const values = axis.values.length > 0 ? axis.values : [''];
    combos = combos.flatMap((combo) => values.map((v) => [...combo, v]));
    if (combos.length > limit) combos = combos.slice(0, limit);
  }
  return combos;
}

/** Pairs the axis names with one row of values, leaving out empty values. */
export function toAttributes(names: readonly string[], values: readonly string[]): ProductAttribute[] {
  return names
    .map((name, i) => ({ name: name.trim(), value: (values[i] ?? '').trim() }))
    .filter((a) => a.name && a.value);
}

/** Same values in the same axes -> same key (script/case-insensitive), for duplicate checks. */
export function attributesKey(values: readonly string[]): string {
  return values.map((v) => normalizeForSearch(v.trim())).join('|');
}

/** SKU tail from the values: "80 L", "vertikal" -> "80L-VERTIKAL". */
export function variantSkuSuffix(values: readonly string[]): string {
  return values
    .map((v) => toLatin(v).toUpperCase().replace(/[^A-Z0-9.]+/g, ''))
    .filter(Boolean)
    .join('-');
}

/** Legacy color/size fields, still read by older screens and the Excel import. */
export function legacyColorSize(attributes: readonly ProductAttribute[]): { color?: string; size?: string } {
  const find = (name: string) => attributes.find((a) => normalizeForSearch(a.name) === normalizeForSearch(name))?.value;
  return { color: find('Rang'), size: find("O'lcham") };
}

/** Attributes of a product, falling back to the legacy color/size for older records. */
export function productAttributes(product: { attributes?: ProductAttribute[]; color?: string; size?: string }): ProductAttribute[] {
  if (product.attributes?.length) return product.attributes;
  const legacy: ProductAttribute[] = [];
  if (product.color) legacy.push({ name: 'Rang', value: product.color });
  if (product.size) legacy.push({ name: "O'lcham", value: product.size });
  return legacy;
}

/** Short variant text for lists, POS tiles and receipts: "80 L · vertikal". */
export function variantLabel(product: { attributes?: ProductAttribute[]; color?: string; size?: string }): string {
  return productAttributes(product).map((a) => a.value).join(' · ');
}

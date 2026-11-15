/** A single alternate sale unit for a product (e.g. primary "dona", alt "quti",
 *  factor 20 → 1 quti = 20 dona). Stock quantity itself always stays in the
 *  product's primary unit; alt units only let staff enter/sell quantities in a
 *  more convenient unit and convert on the fly. */
export interface AltUnit {
  unit: string;
  factor: number;
  /** Own price of the whole package (1 quti = 380 000), when it differs from factor × unit price. */
  price?: number | null;
  /** Barcode printed on the package: scanning it sells one whole package. */
  barcode?: string | null;
}

/** Price of one primary unit when sold in this package, or null to use the normal price. */
export function altUnitUnitPrice(alt: AltUnit | undefined): number | null {
  return alt && alt.price && alt.price > 0 && alt.factor > 0 ? alt.price / alt.factor : null;
}

/**
 * Parses the admin-facing free-text alt-units field, e.g. `"quti:20,karobka:100"`,
 * into a structured array. This is a form input, not a strict data format — malformed
 * segments (missing colon, non-numeric or non-positive factor, empty unit name) are
 * silently skipped rather than throwing, so one typo doesn't block the whole form.
 * Repeated unit names de-duplicate, last occurrence wins.
 */
export function parseAltUnitsInput(text: string): AltUnit[] {
  if (!text) return [];

  const result = new Map<string, AltUnit>();

  // unit:factor, optionally :price and :barcode — "quti:20:380000:4780001112223".
  for (const rawSegment of text.split(',')) {
    const segment = rawSegment.trim();
    if (!segment) continue;

    const [unitText, factorText, priceText, barcodeText] = segment.split(':').map((s) => s.trim());
    const unit = unitText ?? '';
    if (!unit || !factorText) continue;

    const factor = Number(factorText);
    if (!Number.isFinite(factor) || factor <= 0) continue;

    const price = Number(priceText);
    result.set(unit, {
      unit,
      factor,
      ...(priceText && Number.isFinite(price) && price > 0 ? { price } : {}),
      ...(barcodeText ? { barcode: barcodeText } : {})
    });
  }

  return Array.from(result.values());
}

/**
 * Inverse of `parseAltUnitsInput` — joins an alt-units array back into the
 * `"quti:20,karobka:100"` text form, for pre-filling the edit form.
 */
export function formatAltUnitsForInput(altUnits: AltUnit[] | undefined): string {
  if (!altUnits || altUnits.length === 0) return '';
  return altUnits
    .map((a) => {
      const parts = [a.unit, String(a.factor)];
      if (a.price || a.barcode) parts.push(a.price ? String(a.price) : '');
      if (a.barcode) parts.push(a.barcode);
      return parts.join(':');
    })
    .join(',');
}

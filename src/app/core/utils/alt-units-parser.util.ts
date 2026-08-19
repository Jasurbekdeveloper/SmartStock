/** A single alternate sale unit for a product (e.g. primary "dona", alt "quti",
 *  factor 20 → 1 quti = 20 dona). Stock quantity itself always stays in the
 *  product's primary unit; alt units only let staff enter/sell quantities in a
 *  more convenient unit and convert on the fly. */
export interface AltUnit {
  unit: string;
  factor: number;
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

  const result = new Map<string, number>();

  for (const rawSegment of text.split(',')) {
    const segment = rawSegment.trim();
    if (!segment) continue;

    const separatorIndex = segment.indexOf(':');
    if (separatorIndex === -1) continue;

    const unit = segment.slice(0, separatorIndex).trim();
    const factorText = segment.slice(separatorIndex + 1).trim();
    if (!unit || !factorText) continue;

    const factor = Number(factorText);
    if (!Number.isFinite(factor) || factor <= 0) continue;

    result.set(unit, factor);
  }

  return Array.from(result, ([unit, factor]) => ({ unit, factor }));
}

/**
 * Inverse of `parseAltUnitsInput` — joins an alt-units array back into the
 * `"quti:20,karobka:100"` text form, for pre-filling the edit form.
 */
export function formatAltUnitsForInput(altUnits: AltUnit[] | undefined): string {
  if (!altUnits || altUnits.length === 0) return '';
  return altUnits.map((a) => `${a.unit}:${a.factor}`).join(',');
}

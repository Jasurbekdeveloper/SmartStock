export interface ProductIdentifier {
  sku?: string | null;
  barcode?: string | null;
}

export function hasDuplicateProductIdentifiers(products: readonly ProductIdentifier[]): boolean {
  const used = new Set<string>();
  for (const product of products) {
    const current = new Set(
      [product.sku, product.barcode]
        .map((value) => value?.trim().toLocaleLowerCase())
        .filter((value): value is string => !!value)
    );
    for (const identifier of current) {
      if (used.has(identifier)) return true;
    }
    for (const identifier of current) used.add(identifier);
  }
  return false;
}

/** EAN-13 check digit for the first 12 digits. */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/**
 * A new EAN-13 barcode for goods that came without one. Prefix "2" is the GS1 range
 * reserved for in-store use, so it never collides with a manufacturer's real barcode;
 * `taken` (existing barcodes/SKUs) makes it unique within the store.
 */
export function generateStoreBarcode(taken: Iterable<string | null | undefined> = [], random: () => number = Math.random): string {
  const used = new Set([...taken].map((v) => v?.trim()).filter(Boolean));
  for (;;) {
    let body = '2';
    for (let i = 0; i < 11; i++) body += Math.floor(random() * 10);
    const code = body + ean13CheckDigit(body);
    if (!used.has(code)) return code;
  }
}

/** MXIK (IKPU) — the 17-digit product code of the tax committee classifier
 *  (tasnif.soliq.uz). Optional until the tax integration exists. */
export function isValidMxikCode(code: string | null | undefined): boolean {
  return /^\d{17}$/.test(String(code ?? '').trim());
}

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

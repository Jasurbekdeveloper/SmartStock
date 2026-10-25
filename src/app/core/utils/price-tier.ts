/** Retail vs wholesale pricing for POS lines. */
export type PriceTier = 'retail' | 'wholesale';

export interface TierPricedProduct {
  price: number;
  wholesalePrice?: number | null;
  wholesaleMinQty?: number | null;
}

export function hasWholesale(p: TierPricedProduct): boolean {
  return (p.wholesalePrice ?? 0) > 0;
}

/**
 * Which tier applies to a line: the whole ticket switched to wholesale, or the line
 * reached the product's wholesale threshold. Products without a wholesale price are
 * always retail.
 */
export function resolveTier(p: TierPricedProduct, quantity: number, ticketTier: PriceTier): PriceTier {
  if (!hasWholesale(p)) return 'retail';
  if (ticketTier === 'wholesale') return 'wholesale';
  const threshold = p.wholesaleMinQty ?? 0;
  return threshold > 0 && quantity >= threshold ? 'wholesale' : 'retail';
}

export function tierPrice(p: TierPricedProduct, tier: PriceTier): number {
  return tier === 'wholesale' && hasWholesale(p) ? (p.wholesalePrice as number) : p.price;
}

/** Days until a best-before date (negative = expired), or null when not tracked. */
export function daysUntilExpiry(expiry: Date | null | undefined, now = new Date()): number | null {
  if (!expiry) return null;
  const a = new Date(expiry);
  a.setHours(0, 0, 0, 0);
  const b = new Date(now);
  b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

export type ExpiryState = 'expired' | 'soon' | 'ok' | 'none';

/** "soon" within `warnDays` (default 30). */
export function expiryState(expiry: Date | null | undefined, warnDays = 30, now = new Date()): ExpiryState {
  const days = daysUntilExpiry(expiry, now);
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  return days <= warnDays ? 'soon' : 'ok';
}

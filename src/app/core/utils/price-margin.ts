/** Profit per unit between the cost price and the selling price, for the hint under the
 * product price fields. `percent` is the markup on cost (null when there is no cost to
 * compare against); `belowCost` flags a selling price that loses money. */
export interface PriceMargin {
  profit: number;
  percent: number | null;
  belowCost: boolean;
}

export function priceMargin(cost: number | null | undefined, price: number | null | undefined): PriceMargin | null {
  const c = Number(cost);
  const p = Number(price);
  if (!Number.isFinite(c) || !Number.isFinite(p) || c <= 0 || p <= 0) return null;
  const profit = Math.round((p - c) * 100) / 100;
  return {
    profit,
    percent: Math.round((profit / c) * 1000) / 10,
    belowCost: p < c
  };
}

/** Both prices have to be filled in: a product without a cost price breaks profit reports. */
export function hasValidPrices(cost: number | null | undefined, price: number | null | undefined): boolean {
  const c = Number(cost);
  const p = Number(price);
  return Number.isFinite(c) && c > 0 && Number.isFinite(p) && p > 0;
}

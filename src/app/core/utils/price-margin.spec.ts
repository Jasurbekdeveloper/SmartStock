import { describe, expect, it } from 'vitest';
import { hasValidPrices, priceMargin } from './price-margin';

describe('priceMargin', () => {
  it('returns profit and markup on cost', () => {
    expect(priceMargin(38000, 45000)).toEqual({ profit: 7000, percent: 18.4, belowCost: false });
  });

  it('flags a selling price below cost', () => {
    expect(priceMargin(100, 90)).toEqual({ profit: -10, percent: -10, belowCost: true });
  });

  it('returns null until both prices are entered', () => {
    expect(priceMargin(0, 100)).toBeNull();
    expect(priceMargin(100, null)).toBeNull();
  });
});

describe('hasValidPrices', () => {
  it('requires both prices above zero', () => {
    expect(hasValidPrices(10, 12)).toBe(true);
    expect(hasValidPrices(0, 12)).toBe(false);
    expect(hasValidPrices(10, 0)).toBe(false);
    expect(hasValidPrices(null, 12)).toBe(false);
  });
});

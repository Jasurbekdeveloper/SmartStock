import { describe, expect, it } from 'vitest';
import { daysUntilExpiry, expiryState, resolveTier, tierPrice } from './price-tier';

const product = { price: 12_000, wholesalePrice: 10_000, wholesaleMinQty: 10 };

describe('resolveTier', () => {
  it('stays retail without a wholesale price', () => {
    expect(resolveTier({ price: 5 }, 100, 'wholesale')).toBe('retail');
  });

  it('follows the ticket tier', () => {
    expect(resolveTier(product, 1, 'wholesale')).toBe('wholesale');
    expect(resolveTier(product, 1, 'retail')).toBe('retail');
  });

  it('switches automatically at the threshold', () => {
    expect(resolveTier(product, 9, 'retail')).toBe('retail');
    expect(resolveTier(product, 10, 'retail')).toBe('wholesale');
    expect(resolveTier({ ...product, wholesaleMinQty: 0 }, 1000, 'retail')).toBe('retail');
  });
});

describe('tierPrice', () => {
  it('picks the price for the tier', () => {
    expect(tierPrice(product, 'wholesale')).toBe(10_000);
    expect(tierPrice(product, 'retail')).toBe(12_000);
    expect(tierPrice({ price: 7 }, 'wholesale')).toBe(7);
  });
});

describe('expiry', () => {
  const now = new Date(2026, 9, 25, 15);
  it('counts calendar days', () => {
    expect(daysUntilExpiry(new Date(2026, 9, 26, 1), now)).toBe(1);
    expect(daysUntilExpiry(null, now)).toBeNull();
  });

  it('classifies dates', () => {
    expect(expiryState(new Date(2026, 9, 24), 30, now)).toBe('expired');
    expect(expiryState(new Date(2026, 10, 10), 30, now)).toBe('soon');
    expect(expiryState(new Date(2027, 0, 1), 30, now)).toBe('ok');
    expect(expiryState(undefined, 30, now)).toBe('none');
  });
});

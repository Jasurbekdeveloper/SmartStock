import { describe, expect, it } from 'vitest';
import { splitReturn } from './return-split';

describe('splitReturn', () => {
  it('refunds money in full for a paid sale', () => {
    expect(splitReturn(50_000, 0, 50_000)).toEqual({ goods: 50_000, debtReduction: 0, refund: 50_000 });
  });

  it('takes a fully unpaid sale off the debt, with no money back', () => {
    expect(splitReturn(1_800_000, 1_800_000, 0)).toEqual({ goods: 1_800_000, debtReduction: 1_800_000, refund: 0 });
  });

  it('settles the debt first, then gives back what was paid', () => {
    // Bought 1.8M on credit, paid 500k since: returning everything clears 1.3M and gives 500k back.
    expect(splitReturn(1_800_000, 1_300_000, 500_000)).toEqual({ goods: 1_800_000, debtReduction: 1_300_000, refund: 500_000 });
  });

  it('only lowers the debt when the goods are worth less than it', () => {
    expect(splitReturn(900_000, 1_300_000, 500_000)).toEqual({ goods: 900_000, debtReduction: 900_000, refund: 0 });
  });

  it('never gives back more than was paid', () => {
    expect(splitReturn(100_000, 0, 30_000).refund).toBe(30_000);
  });
});

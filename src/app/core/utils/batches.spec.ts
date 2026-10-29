import { describe, expect, it } from 'vitest';
import {
  StockBatch,
  allocateFefo,
  expiryFromShelfLife,
  isBlockedExpired,
  mergeAllocations,
  subtractAllocations,
  restoreAllocation,
  summarizeBatches,
  expiryAttention
} from './batches';

const now = new Date(2026, 9, 26, 15);
const day = (offset: number) => new Date(2026, 9, 26 + offset);
const batch = (id: string, quantity: number, expiryOffset: number): StockBatch => ({
  id,
  productId: 'milk',
  quantity,
  initialQuantity: quantity,
  expiryDate: day(expiryOffset)
});

describe('expiryFromShelfLife', () => {
  it('adds the shelf life to the manufacture date', () => {
    expect(expiryFromShelfLife(new Date(2026, 9, 20, 18), 10)).toEqual(new Date(2026, 9, 30));
    expect(expiryFromShelfLife(null, 10)).toBeNull();
    expect(expiryFromShelfLife(new Date(), 0)).toBeNull();
  });
});

describe('allocateFefo', () => {
  const batches = [batch('late', 10, 20), batch('soon', 3, 2), batch('old', 5, -1), batch('empty', 0, 1)];

  it('takes the nearest fresh expiry first and skips expired batches', () => {
    const r = allocateFefo(batches, 5, { now });
    expect(r.allocations).toEqual([
      { batchId: 'soon', quantity: 3 },
      { batchId: 'late', quantity: 2 }
    ]);
    expect(r.unallocated).toBe(0);
    expect(r.usedExpired).toBe(false);
  });

  it('uses expired stock only when allowed, after fresh stock', () => {
    const r = allocateFefo(batches, 15, { now, allowExpired: true });
    expect(r.allocations.map((a) => a.batchId)).toEqual(['soon', 'late', 'old']);
    expect(r.allocations[2].quantity).toBe(2);
    expect(r.usedExpired).toBe(true);
  });

  it('reports what no batch covers', () => {
    expect(allocateFefo(batches, 20, { now }).unallocated).toBe(7);
    expect(allocateFefo([], 2, { now }).unallocated).toBe(2);
  });

  it('handles fractional quantities (kg)', () => {
    const r = allocateFefo([batch('a', 1.25, 3), batch('b', 4, 5)], 2.5, { now });
    expect(r.allocations).toEqual([
      { batchId: 'a', quantity: 1.25 },
      { batchId: 'b', quantity: 1.25 }
    ]);
  });
});

describe('restoreAllocation', () => {
  it('refills the last consumed slices first, never more than was taken', () => {
    const taken = [
      { batchId: 'soon', quantity: 3 },
      { batchId: 'late', quantity: 2 }
    ];
    expect(restoreAllocation(taken, 4)).toEqual([
      { batchId: 'late', quantity: 2 },
      { batchId: 'soon', quantity: 2 }
    ]);
    expect(restoreAllocation(taken, 9).reduce((s, a) => s + a.quantity, 0)).toBe(5);
    expect(restoreAllocation(undefined, 2)).toEqual([]);
  });
});

describe('mergeAllocations', () => {
  it('sums slices of the same batch across lines', () => {
    const m = mergeAllocations([[{ batchId: 'a', quantity: 1 }], [{ batchId: 'a', quantity: 2 }, { batchId: 'b', quantity: 1 }], undefined]);
    expect(m.get('a')).toBe(3);
    expect(m.get('b')).toBe(1);
  });
});

describe('summarizeBatches / isBlockedExpired', () => {
  it('splits fresh and expired stock', () => {
    const s = summarizeBatches([batch('a', 4, -2), batch('b', 6, 10)], 30, now);
    expect(s).toMatchObject({ freshQty: 6, expiredQty: 4, state: 'expired' });
  });

  it('blocks only when nothing sellable is left', () => {
    const onlyExpired = summarizeBatches([batch('a', 4, -2)], 30, now);
    expect(isBlockedExpired(4, onlyExpired)).toBe(true);
    // 3 units of untracked older stock are still sellable
    expect(isBlockedExpired(7, onlyExpired)).toBe(false);
    expect(isBlockedExpired(4, summarizeBatches([batch('b', 4, 3)], 30, now))).toBe(false);
    expect(isBlockedExpired(4, undefined)).toBe(false);
  });
});

describe('subtractAllocations', () => {
  it('removes what earlier returns already gave back', () => {
    const taken = [
      { batchId: 'a', quantity: 3 },
      { batchId: 'b', quantity: 2 }
    ];
    expect(subtractAllocations(taken, [{ batchId: 'b', quantity: 2 }, { batchId: 'a', quantity: 1 }])).toEqual([{ batchId: 'a', quantity: 2 }]);
    expect(subtractAllocations(undefined, [])).toEqual([]);
  });
});

describe('expiryAttention', () => {
  it('counts products by their batches, and legacy-dated products by their own date', () => {
    const products = [
      { id: 'milk', quantity: 10 },
      { id: 'old', quantity: 2, expiryDate: day(-3) },
      { id: 'nails', quantity: 50 }
    ];
    const r = expiryAttention(products, [batch('a', 4, -1), batch('b', 6, 5)], 30, now);
    expect([...r.expired].sort()).toEqual(['milk', 'old']);
    expect([...r.expiring]).toEqual(['milk']);
  });
});

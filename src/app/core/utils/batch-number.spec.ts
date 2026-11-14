import { describe, expect, it } from 'vitest';
import { batchNameTag, daysBetween, nextBatchNo, shelfLifeFromBatches } from './batch-number';

describe('batch numbers', () => {
  const day = new Date(2026, 10, 15);

  it('joins the arrival day and the product name', () => {
    expect(nextBatchNo('Qurt', day, [])).toBe('151126-QURT');
    expect(nextBatchNo('Mix 100 mm', day, [])).toBe('151126-MIX-100-MM');
  });

  it('numbers further deliveries of the same day', () => {
    expect(nextBatchNo('Qurt', day, ['151126-QURT'])).toBe('151126-QURT-2');
    expect(nextBatchNo('Qurt', day, ['151126-qurt', '151126-QURT-2', null])).toBe('151126-QURT-3');
    expect(nextBatchNo('Qurt', new Date(2026, 10, 16), ['151126-QURT'])).toBe('161126-QURT');
  });

  it('keeps Cyrillic names and shortens long ones', () => {
    expect(batchNameTag('Сут 3,2%')).toBe('СУТ-3-2');
    expect(batchNameTag('Very long product name for tags').length).toBeLessThanOrEqual(16);
    expect(batchNameTag('!!!')).toBe('P');
  });
});

describe('shelf life', () => {
  it('counts calendar days', () => {
    expect(daysBetween(new Date(2026, 0, 1), new Date(2026, 0, 31))).toBe(30);
  });

  it('takes the latest delivery that has both dates', () => {
    const batches = [
      { manufactureDate: new Date(2026, 0, 1), expiryDate: new Date(2026, 0, 11), createdAt: new Date(2026, 0, 2) },
      { manufactureDate: new Date(2026, 1, 1), expiryDate: new Date(2026, 1, 21), createdAt: new Date(2026, 1, 2) },
      { manufactureDate: null, expiryDate: new Date(2026, 2, 1), createdAt: new Date(2026, 2, 2) }
    ];
    expect(shelfLifeFromBatches(batches)).toBe(20);
    expect(shelfLifeFromBatches([])).toBeNull();
  });
});

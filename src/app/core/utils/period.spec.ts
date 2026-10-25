import { describe, expect, it } from 'vitest';
import { daysInRange, periodRange, previousRange } from './period';

const now = new Date(2026, 9, 25, 14, 30);

describe('periodRange', () => {
  it('covers whole days', () => {
    const r = periodRange('7d', now);
    expect(r.from).toEqual(new Date(2026, 9, 19));
    expect(r.to.getHours()).toBe(23);
    expect(daysInRange(r)).toBe(7);
  });

  it('handles calendar months', () => {
    expect(periodRange('month', now).from).toEqual(new Date(2026, 9, 1));
    const prev = periodRange('prevMonth', now);
    expect(prev.from).toEqual(new Date(2026, 8, 1));
    expect(prev.to.getDate()).toBe(30);
  });
});

describe('previousRange', () => {
  it('is the same length, right before', () => {
    const r = periodRange('7d', now);
    const p = previousRange(r);
    expect(p.to.getTime()).toBe(r.from.getTime() - 1);
    expect(daysInRange(p)).toBe(7);
  });
});

import { daysAgo, endOfDay, startOfDay } from './date-range';

describe('date-range', () => {
  it('daysAgo(7) covers today plus the 6 previous days', () => {
    const now = new Date(2026, 9, 20, 15, 30);
    const from = daysAgo(7, now);
    expect([from.getFullYear(), from.getMonth(), from.getDate(), from.getHours()]).toEqual([2026, 9, 14, 0]);
  });

  it('daysAgo crosses month boundaries', () => {
    const from = daysAgo(30, new Date(2026, 2, 5, 9));
    expect([from.getMonth(), from.getDate()]).toEqual([1, 4]);
  });

  it('startOfDay / endOfDay bracket the same date', () => {
    const d = new Date(2026, 9, 20, 12);
    expect(startOfDay(d).getTime()).toBeLessThan(d.getTime());
    expect(endOfDay(d).getTime()).toBeGreaterThan(d.getTime());
    expect(endOfDay(d).getDate()).toBe(20);
  });
});

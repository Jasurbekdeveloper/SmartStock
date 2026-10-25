import { describe, expect, it } from 'vitest';
import { computePnl, groupExpenses, percentChange, pnlByDay } from './finance';
import type { Sale } from '../services/sales.service';

function sale(partial: Partial<Sale>): Sale {
  return {
    id: 's',
    items: [],
    subtotal: 0,
    tax: 0,
    total: 0,
    paymentMethod: 'cash',
    paidAmount: 0,
    change: 0,
    createdAt: new Date(2026, 9, 10, 12),
    ...partial
  };
}

describe('computePnl', () => {
  it('subtracts cost of goods and expenses from revenue', () => {
    const report = computePnl(
      [sale({ total: 120_000, tax: 20_000, totalNetProfit: 30_000 }), sale({ total: 60_000, tax: 10_000, totalNetProfit: 10_000 })],
      [{ amount: 15_000, category: 'rent', date: new Date() }]
    );
    expect(report.netRevenue).toBe(180_000);
    expect(report.vat).toBe(30_000);
    expect(report.revenueExVat).toBe(150_000);
    expect(report.grossProfit).toBe(40_000);
    expect(report.cogs).toBe(110_000);
    expect(report.netProfit).toBe(25_000);
    expect(report.avgReceipt).toBe(90_000);
  });

  it('scales revenue, VAT and profit down by refunds', () => {
    const report = computePnl([sale({ total: 100_000, tax: 10_000, totalNetProfit: 20_000, refundedAmount: 50_000 })], []);
    expect(report.refunds).toBe(50_000);
    expect(report.netRevenue).toBe(50_000);
    expect(report.vat).toBe(5_000);
    expect(report.grossProfit).toBe(10_000);
  });

  it('handles an empty period without dividing by zero', () => {
    const report = computePnl([], []);
    expect(report.grossMargin).toBe(0);
    expect(report.netMargin).toBe(0);
    expect(report.avgReceipt).toBe(0);
  });
});

describe('groupExpenses', () => {
  it('sums per category, largest first, with shares', () => {
    const rows = groupExpenses([
      { amount: 10, category: 'rent', date: new Date() },
      { amount: 30, category: 'salary', date: new Date() },
      { amount: 10, category: 'rent', date: new Date() }
    ]);
    expect(rows.map((r) => r.category)).toEqual(['salary', 'rent']);
    expect(rows[1].amount).toBe(20);
    expect(rows[0].share).toBeCloseTo(0.6);
  });
});

describe('pnlByDay', () => {
  it('returns one row per day including empty days', () => {
    const from = new Date(2026, 9, 9);
    const to = new Date(2026, 9, 11, 23, 59);
    const rows = pnlByDay(
      [sale({ total: 50, totalNetProfit: 20, createdAt: new Date(2026, 9, 10, 15) })],
      [{ amount: 5, category: 'other', date: new Date(2026, 9, 10, 9) }],
      from,
      to
    );
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({ revenue: 50, grossProfit: 20, expenses: 5, netProfit: 15 });
    expect(rows[0].revenue).toBe(0);
  });
});

describe('percentChange', () => {
  it('is null without a base', () => {
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(15, 10)).toBeCloseTo(0.5);
  });
});

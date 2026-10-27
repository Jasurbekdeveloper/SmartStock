import { describe, expect, it } from 'vitest';
import { allocateDebtPayment } from './debt.service';

describe('allocateDebtPayment', () => {
  const debts = [
    { id: 'new', remainingAmount: 300000, createdAt: new Date(2026, 9, 20) },
    { id: 'old', remainingAmount: 120000, createdAt: new Date(2026, 8, 1) },
    { id: 'paid', remainingAmount: 0, createdAt: new Date(2026, 7, 1) }
  ];

  it('pays the oldest debt first and never more than is owed', () => {
    expect(allocateDebtPayment(debts, 200000)).toEqual([
      { debtId: 'old', amount: 120000 },
      { debtId: 'new', amount: 80000 }
    ]);
    expect(allocateDebtPayment(debts, 1000000).reduce((s, x) => s + x.amount, 0)).toBe(420000);
    expect(allocateDebtPayment(debts, 0)).toEqual([]);
  });
});

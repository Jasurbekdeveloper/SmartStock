import { calculateCheckout, resolveDiscount, roundMoney, splitPayment } from './pos-math';

describe('pos-math', () => {
  describe('roundMoney', () => {
    it('avoids binary float drift', () => {
      expect(roundMoney(0.1 + 0.2)).toBe(0.3);
      expect(roundMoney(1.005)).toBe(1.01);
      expect(roundMoney(NaN)).toBe(0);
    });
  });

  describe('calculateCheckout', () => {
    const lines = [
      { quantity: 10, price: 50000, costPrice: 40000 }, // 500 000
      { quantity: 100, price: 3000, costPrice: 2000 }, // 300 000
      { quantity: 20, price: 10000, costPrice: 7000 } // 200 000
    ];

    it('VAT-inclusive: total equals shelf price minus discounts, VAT is extracted', () => {
      const r = calculateCheckout(lines, 100000, { vatRate: 0.12, pricesIncludeVat: true });
      expect(r.subtotal).toBe(1000000);
      expect(r.total).toBe(900000);
      expect(r.lines.map((l) => l.cartDiscountShare)).toEqual([50000, 30000, 20000]);
      // 900 000 * 12 / 112
      expect(r.vat).toBeCloseTo(96428.57, 1);
      expect(roundMoney(r.net + r.vat)).toBe(r.total);
      expect(r.cost).toBe(400000 + 200000 + 140000);
    });

    it('VAT-exclusive: VAT is added on top of the discounted subtotal', () => {
      const r = calculateCheckout(lines, 100000, { vatRate: 0.12, pricesIncludeVat: false });
      expect(r.net).toBe(900000);
      expect(r.vat).toBe(108000);
      expect(r.total).toBe(1008000);
      expect(r.profit).toBe(900000 - 740000);
    });

    it('cart discount shares always sum exactly to the discount', () => {
      const r = calculateCheckout(
        [
          { quantity: 1, price: 333 },
          { quantity: 1, price: 333 },
          { quantity: 1, price: 334 }
        ],
        100,
        { vatRate: 0, pricesIncludeVat: true }
      );
      const sum = r.lines.reduce((s, l) => s + l.cartDiscountShare, 0);
      expect(roundMoney(sum)).toBe(100);
      expect(r.total).toBe(900);
    });

    it('stacks line discounts before the cart discount and clamps both', () => {
      const r = calculateCheckout(
        [
          { quantity: 2, price: 1000, lineDiscount: 5000 }, // clamped to 2000
          { quantity: 1, price: 1000 }
        ],
        5000,
        { vatRate: 0, pricesIncludeVat: true }
      );
      expect(r.lineDiscounts).toBe(2000);
      expect(r.subtotal).toBe(1000);
      expect(r.cartDiscount).toBe(1000);
      expect(r.total).toBe(0);
    });

    it('reports a loss when sold below cost', () => {
      const r = calculateCheckout([{ quantity: 1, price: 1000, costPrice: 1500 }], 0, {
        vatRate: 0,
        pricesIncludeVat: true
      });
      expect(r.profit).toBe(-500);
    });
  });

  describe('resolveDiscount', () => {
    it('handles percent and amount and clamps', () => {
      expect(resolveDiscount(200000, 10, 'percent')).toBe(20000);
      expect(resolveDiscount(200000, 150, 'percent')).toBe(200000);
      expect(resolveDiscount(200000, 300000, 'amount')).toBe(200000);
      expect(resolveDiscount(200000, -5, 'amount')).toBe(0);
    });
  });

  describe('splitPayment', () => {
    it('cash only with change', () => {
      expect(splitPayment(85000, 100000, 0)).toEqual({ cash: 85000, card: 0, debt: 0, change: 15000, paid: 100000 });
    });

    it('mixed card + cash', () => {
      expect(splitPayment(100000, 40000, 60000)).toEqual({ cash: 40000, card: 60000, debt: 0, change: 0, paid: 100000 });
    });

    it('card never exceeds total and never produces change', () => {
      const r = splitPayment(100000, 0, 150000);
      expect(r.card).toBe(100000);
      expect(r.change).toBe(0);
    });

    it('unpaid remainder becomes debt', () => {
      expect(splitPayment(100000, 30000, 0).debt).toBe(70000);
    });
  });
});

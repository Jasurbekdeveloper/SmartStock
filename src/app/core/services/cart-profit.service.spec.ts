import { CartProfitService, CartProfitLineInput } from './cart-profit.service';

describe('CartProfitService', () => {
  const service = new CartProfitService();

  describe('calculateCartProfit', () => {
    it('distributes the user\'s own worked example exactly (1,000,000 receipt, 100,000 discount)', () => {
      // Three items whose raw subtotals sum to exactly 1,000,000 so'm, with a flat
      // 100,000 so'm discount applied to the whole receipt at checkout.
      const lines: CartProfitLineInput[] = [
        { productId: 'a', name: 'Cement', quantity: 10, originalPrice: 50000, costPrice: 40000 }, // 500,000
        { productId: 'b', name: 'Brick', quantity: 100, originalPrice: 3000, costPrice: 2000 }, // 300,000
        { productId: 'c', name: 'Nails', quantity: 20, originalPrice: 10000, costPrice: 7000 } // 200,000
      ];

      const result = service.calculateCartProfit(lines, 100000);

      expect(result.originalTotal).toBe(1000000);
      expect(result.discountGiven).toBe(100000);

      // Proportional shares: 50%, 30%, 20% of the 100,000 discount.
      expect(result.items[0].discountAmount).toBe(50000);
      expect(result.items[1].discountAmount).toBe(30000);
      // Last line absorbs the remainder rather than being independently rounded.
      expect(result.items[2].discountAmount).toBe(20000);

      // The whole point of the remainder mechanism: the sum must be EXACT.
      const sumOfDiscounts = result.items.reduce((sum, item) => sum + item.discountAmount, 0);
      expect(sumOfDiscounts).toBe(100000);

      expect(result.items[0].totalFinal).toBe(450000);
      expect(result.items[0].finalPrice).toBe(45000);
      expect(result.items[1].totalFinal).toBe(270000);
      expect(result.items[2].totalFinal).toBe(180000);
    });

    it('puts the exact rounding remainder on the last item when shares do not divide evenly', () => {
      // 3 items with subtotals 333, 333, 334 (sum 1000) and a discount of 100 —
      // each line's naive proportional share is 33.3, 33.3, 33.4, which independently
      // rounds to 33, 33, 33 = 99, one short of 100. The remainder mechanism must
      // make up that missing 1 on the last line.
      const lines: CartProfitLineInput[] = [
        { productId: 'a', name: 'A', quantity: 1, originalPrice: 333, costPrice: 100 },
        { productId: 'b', name: 'B', quantity: 1, originalPrice: 333, costPrice: 100 },
        { productId: 'c', name: 'C', quantity: 1, originalPrice: 334, costPrice: 100 }
      ];

      const result = service.calculateCartProfit(lines, 100);

      const sumOfDiscounts = result.items.reduce((sum, item) => sum + item.discountAmount, 0);
      expect(sumOfDiscounts).toBe(100);

      // First two lines round independently (333/1000 * 100 = 33.3 -> 33 each).
      expect(result.items[0].discountAmount).toBe(33);
      expect(result.items[1].discountAmount).toBe(33);
      // Last line = 100 - 33 - 33 = 34, absorbing the leftover remainder so the
      // total distributed is exact, not 99.
      expect(result.items[2].discountAmount).toBe(34);
    });

    it('produces zero discountAmount and finalPrice === originalPrice when no discount is given', () => {
      const lines: CartProfitLineInput[] = [
        { productId: 'a', name: 'A', quantity: 2, originalPrice: 10000, costPrice: 6000 },
        { productId: 'b', name: 'B', quantity: 3, originalPrice: 5000, costPrice: 3000 }
      ];

      const result = service.calculateCartProfit(lines, 0);

      for (const item of result.items) {
        expect(item.discountAmount).toBe(0);
        expect(item.finalPrice).toBe(item.originalPrice);
      }
      expect(result.discountGiven).toBe(0);
      expect(result.vatAmount12).toBeCloseTo(result.originalTotal * 0.12, 6);
    });

    it('guards against division by zero when originalTotal is 0 (empty cart / all-free items)', () => {
      const lines: CartProfitLineInput[] = [
        { productId: 'a', name: 'Free sample', quantity: 5, originalPrice: 0, costPrice: 0 }
      ];

      const result = service.calculateCartProfit(lines, 0);

      expect(result.originalTotal).toBe(0);
      expect(result.items[0].discountAmount).toBe(0);
      expect(result.items[0].finalPrice).toBe(0);
      expect(result.items[0].totalFinal).toBe(0);
      expect(result.finalTotalWithTax).toBe(0);

      // Also guard the truly-empty-cart case.
      const emptyResult = service.calculateCartProfit([], 0);
      expect(emptyResult.items).toEqual([]);
      expect(emptyResult.originalTotal).toBe(0);
      expect(emptyResult.finalTotalWithTax).toBe(0);
    });

    it('reports a negative netProfit when a deep discount pushes the sold price below cost', () => {
      // originalPrice 1000, costPrice 900, quantity 1 -> raw subtotal 1000.
      // A steep 500 discount applied entirely to this single line means it sold
      // for 500, well below its 900 cost -> netProfit must be negative, not clamped.
      const lines: CartProfitLineInput[] = [
        { productId: 'a', name: 'Loss leader', quantity: 1, originalPrice: 1000, costPrice: 900 }
      ];

      const result = service.calculateCartProfit(lines, 500);

      expect(result.items[0].totalFinal).toBe(500);
      expect(result.items[0].netProfit).toBe(-400);
      expect(result.totalNetProfit).toBe(-400);
    });

    it('clamps a discount greater than originalTotal down to originalTotal', () => {
      const lines: CartProfitLineInput[] = [
        { productId: 'a', name: 'A', quantity: 1, originalPrice: 1000, costPrice: 500 }
      ];

      const result = service.calculateCartProfit(lines, 5000);

      expect(result.discountGiven).toBe(1000);
      expect(result.items[0].totalFinal).toBe(0);
    });

    it('clamps a negative discount up to 0', () => {
      const lines: CartProfitLineInput[] = [
        { productId: 'a', name: 'A', quantity: 1, originalPrice: 1000, costPrice: 500 }
      ];

      const result = service.calculateCartProfit(lines, -50);

      expect(result.discountGiven).toBe(0);
      expect(result.items[0].discountAmount).toBe(0);
    });

    it('computes vatAmount12 and finalTotalWithTax using the passed-in taxRate, not a hardcoded 12%', () => {
      const lines: CartProfitLineInput[] = [
        { productId: 'a', name: 'A', quantity: 1, originalPrice: 1000, costPrice: 500 }
      ];

      const result = service.calculateCartProfit(lines, 0, 0.2);

      expect(result.vatAmount12).toBe(200);
      expect(result.finalTotalWithTax).toBe(1200);
    });
  });

  describe('calculateCartProfit$', () => {
    it('emits the same result as the synchronous method', async () => {
      const lines: CartProfitLineInput[] = [
        { productId: 'a', name: 'A', quantity: 1, originalPrice: 1000, costPrice: 500 }
      ];

      const sync = service.calculateCartProfit(lines, 100);
      const observed = await new Promise((resolve) => {
        service.calculateCartProfit$(lines, 100).subscribe(resolve);
      });

      expect(observed).toEqual(sync);
    });
  });
});

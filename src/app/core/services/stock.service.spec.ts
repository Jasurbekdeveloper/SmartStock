import { StockService } from './stock.service';

describe('StockService.averageCost', () => {
  it('weights the new delivery against stock on hand', () => {
    // 10 bags at 50 000 on hand + 30 bags at 60 000 arriving → 57 500
    expect(StockService.averageCost(10, 50000, 30, 60000)).toBe(57500);
  });

  it('uses the delivery cost when nothing is on hand (or stock went negative)', () => {
    expect(StockService.averageCost(0, 50000, 20, 60000)).toBe(60000);
    expect(StockService.averageCost(-5, 50000, 20, 60000)).toBe(60000);
  });
});

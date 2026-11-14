import { describe, expect, it } from 'vitest';
import { buildStockJournal } from './stock-journal';
import type { Sale, SaleReturn } from '../services/sales.service';
import type { StockEntry } from '../services/stock.service';

describe('buildStockJournal', () => {
  it('merges deliveries, sales and returns, newest first', () => {
    const entries = [
      { id: 'e1', productId: 'p1', type: 'in', quantity: 10, previousQuantity: 0, newQuantity: 10, supplier: 'Ali', createdAt: new Date(2026, 0, 1) }
    ] as StockEntry[];
    const sales = [
      { id: 's1', receiptNo: '7', createdAt: new Date(2026, 0, 2), items: [{ productId: 'p1', quantity: 3 }] }
    ] as unknown as Sale[];
    const returns = [
      { id: 'r1', saleId: 's1', receiptNo: '7', createdAt: new Date(2026, 0, 3), items: [{ productId: 'p1', quantity: 1 }] }
    ] as unknown as SaleReturn[];

    const rows = buildStockJournal(entries, sales, returns);
    expect(rows.map((r) => [r.kind, r.change])).toEqual([
      ['return', 1],
      ['sale', -3],
      ['in', 10]
    ]);
    expect(rows[2].detail).toBe('Ali');
  });
});

import type { Sale, SaleReturn } from '../services/sales.service';
import type { StockEntry } from '../services/stock.service';

export type JournalKind = 'in' | 'out' | 'adjustment' | 'sale' | 'return';

/** One line of the stock movement journal: deliveries, write-offs, counts, sales, returns. */
export interface JournalRow {
  id: string;
  kind: JournalKind;
  productId: string;
  /** Signed change of the stock (sale −, delivery +). */
  change: number;
  /** Before → after, known for stock entries only. */
  previous?: number;
  next?: number;
  /** Translation key of the reason, or free text (supplier, receipt number). */
  reasonKey?: string;
  detail?: string;
  /** Sale or return document to open. */
  saleId?: string;
  date: Date;
}

/** Merges stock entries, sale lines and returned lines into one list, newest first. */
export function buildStockJournal(entries: StockEntry[], sales: Sale[], returns: SaleReturn[]): JournalRow[] {
  const rows: JournalRow[] = [];
  for (const e of entries) {
    rows.push({
      id: `e:${e.id}`,
      kind: e.type,
      productId: e.productId,
      change: e.newQuantity - e.previousQuantity,
      previous: e.previousQuantity,
      next: e.newQuantity,
      reasonKey: e.reason ? `stock.reason${e.reason.charAt(0).toUpperCase()}${e.reason.slice(1)}` : undefined,
      detail: e.type === 'in' ? e.supplier : e.notes,
      date: e.createdAt ? new Date(e.createdAt) : new Date()
    });
  }
  for (const s of sales) {
    s.items.forEach((item, i) => {
      rows.push({
        id: `s:${s.id}:${i}`,
        kind: 'sale',
        productId: item.productId,
        change: -item.quantity,
        detail: `№ ${s.receiptNo || s.id.slice(0, 8)}`,
        saleId: s.id,
        date: s.createdAt ? new Date(s.createdAt) : new Date()
      });
    });
  }
  for (const r of returns) {
    r.items.forEach((item, i) => {
      rows.push({
        id: `r:${r.id}:${i}`,
        kind: 'return',
        productId: item.productId,
        change: item.quantity,
        detail: r.receiptNo ? `№ ${r.receiptNo}` : r.reason,
        saleId: r.saleId,
        date: r.createdAt ? new Date(r.createdAt) : new Date()
      });
    });
  }
  return rows.sort((a, b) => b.date.getTime() - a.date.getTime());
}

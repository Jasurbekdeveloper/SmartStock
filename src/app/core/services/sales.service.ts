import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import {
  QueryConstraint,
  Timestamp,
  WriteBatch,
  collection,
  doc,
  endAt,
  increment,
  orderBy,
  query,
  serverTimestamp,
  startAt,
  where,
  writeBatch
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromCollectionQuery, fromDocRef } from '../firebase/firestore.utils';
import { roundMoney } from '../utils/pos-math';
import { AuthService } from './auth.service';
import { requireTenantId, tenantQuery, withTenant } from './tenant-data';

export interface SaleItem {
  productId: string;
  /** Snapshotted at sale time, so the receipt/history — and category
   * popularity ranking — stay accurate even if the product is later
   * renamed, recategorized, or deleted. */
  productName: string;
  categoryId: string;
  /** In the product's primary unit. */
  quantity: number;
  unit?: string;
  /** Per-unit shelf price. */
  price: number;
  /** quantity * price - discount (before the cart-level discount). */
  total: number;
  /** Per-line discount, absolute currency. */
  discount?: number;
  /** What the customer actually paid for this line after every discount, VAT
   *  included — the amount a return of this line refunds (pro rata). */
  finalTotal?: number;
  /** Per-unit cost price at sale time. */
  itemCostPrice?: number;
  /** Net-of-VAT revenue minus cost for this line. Can be negative. */
  netProfit?: number;
}

export type PaymentMethod = 'cash' | 'card' | 'mixed';

export interface Sale {
  id: string;
  /** Human-readable receipt number (see `generateReceiptNo`). Missing on old sales. */
  receiptNo?: string;
  items: SaleItem[];
  /** Sum of line totals (after per-line discounts, before the cart discount). */
  subtotal: number;
  /** VAT contained in (or added to) `total`. */
  tax: number;
  /** Whether `tax` was extracted from shelf prices (true) or added on top. */
  vatIncluded?: boolean;
  /** Cart-level discount. */
  discount?: number;
  total: number;
  paymentMethod: PaymentMethod;
  /** Cash tendered + card. */
  paidAmount: number;
  change: number;
  /** Cash that stayed in the drawer (tendered minus change). */
  cashAmount?: number;
  cardAmount?: number;
  /** Portion of `total` left unpaid and tracked as a debt (0 if paid in full). */
  debtAmount?: number;
  /** Required when debtAmount > 0 — who owes the remainder. */
  customerId?: string;
  cashierId?: string;
  cashierName?: string;
  notes?: string;
  createdAt: Date;
  /** Links this sale to the cashier's open shift, if one was active at checkout. */
  shiftId?: string;
  totalNetProfit?: number;
  /** Sum already refunded through returns (denormalized for lists). */
  refundedAmount?: number;
}

export interface SaleDebtInput {
  amount: number;
  /** Existing customer, OR... */
  customerId?: string;
  /** ...create this new customer as part of the same atomic write. */
  newCustomer?: { name: string; phone: string };
}

export interface SaleReturnItem {
  productId: string;
  productName: string;
  quantity: number;
  refund: number;
}

export interface SaleReturn {
  id: string;
  saleId: string;
  receiptNo?: string;
  items: SaleReturnItem[];
  refundAmount: number;
  refundMethod: 'cash' | 'card';
  reason?: string;
  shiftId?: string;
  cashierId?: string;
  cashierName?: string;
  createdAt: Date;
}

/** Cash a sale left in the drawer — falls back to the pre-split-payment fields for old sales. */
export function saleCashIn(sale: Sale): number {
  if (sale.cashAmount !== undefined) return sale.cashAmount;
  return sale.paymentMethod === 'cash' ? Math.max(0, sale.paidAmount - sale.change) : 0;
}

export function saleCardIn(sale: Sale): number {
  if (sale.cardAmount !== undefined) return sale.cardAmount;
  return sale.paymentMethod === 'card' ? Math.max(0, Math.min(sale.paidAmount, sale.total)) : 0;
}

/** Revenue net of any returns. */
export function saleNetTotal(sale: Sale): number {
  return roundMoney(sale.total - (sale.refundedAmount ?? 0));
}

/** Net profit scaled down by the refunded share — returns give back the margin too. */
export function saleNetProfit(sale: Sale): number {
  const profit = sale.totalNetProfit ?? 0;
  if (!sale.refundedAmount || sale.total <= 0) return profit;
  return roundMoney(profit * (saleNetTotal(sale) / sale.total));
}

/** How long to wait for the server before treating a write as queued offline. */
const OFFLINE_COMMIT_GRACE_MS = 4000;

@Injectable({
  providedIn: 'root'
})
export class SalesService {
  private firestore = inject(FIRESTORE);
  private authService = inject(AuthService);

  /**
   * Sales from `from` up to `to` (or now), newest first. There is deliberately no
   * "all sales" query: every page reads a bounded window so cost doesn't grow with
   * the store's history.
   *
   * The window is expressed as cursors on the createdAt ordering rather than
   * `where('createdAt', '>=', …)`: a sale made offline still has a pending server
   * timestamp, which a range filter skips until it syncs, while the ordering puts it
   * first — so offline sales keep showing up on the dashboard and in the POS.
   */
  getSalesInRange(from: Date, to?: Date | null): Observable<Sale[]> {
    const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];
    if (to && to.getTime() < Date.now()) {
      constraints.push(startAt(Timestamp.fromDate(to)));
    }
    constraints.push(endAt(Timestamp.fromDate(from)));
    return fromCollectionQuery<Sale>(tenantQuery(this.firestore, 'sales', requireTenantId(this.authService), ...constraints));
  }

  getSaleById(id: string): Observable<Sale | undefined> {
    return fromDocRef<Sale>(doc(this.firestore, 'sales', id));
  }

  /** A customer's purchase history, newest first. NOTE: on first real use Firestore
   *  will likely throw with a console link to auto-create the required composite
   *  index (customerId ==, createdAt desc) — that link must be followed manually,
   *  it cannot be created from code. */
  getSalesByCustomerId(customerId: string): Observable<Sale[]> {
    const salesQuery = query(
      collection(this.firestore, 'sales'),
      where('tenantId', '==', requireTenantId(this.authService)),
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc')
    );
    return fromCollectionQuery<Sale>(salesQuery);
  }


  /** Single-field filter only, so no composite index is needed. */
  getReturnsForSale(saleId: string): Observable<SaleReturn[]> {
    return fromCollectionQuery<SaleReturn>(tenantQuery(this.firestore, 'returns', requireTenantId(this.authService), where('saleId', '==', saleId)));
  }

  getReturnsForShift(shiftId: string): Observable<SaleReturn[]> {
    return fromCollectionQuery<SaleReturn>(tenantQuery(this.firestore, 'returns', requireTenantId(this.authService), where('shiftId', '==', shiftId)));
  }

  /**
   * Creates the sale, its debt (and new customer, if any) AND the stock decrement
   * for every line in one atomic batch — a sale can never exist without its stock
   * movement, nor the other way around.
   *
   * Resolves with the new sale id. With no connection Firestore keeps the batch in
   * its local queue and only resolves `commit()` once the server acks, so after a
   * short grace period we resolve anyway: the sale is already visible from the
   * local cache and will sync when the connection returns.
   */
  createSale(sale: Omit<Sale, 'id' | 'createdAt'>, debt?: SaleDebtInput): Observable<string> {
    const batch = writeBatch(this.firestore);
    const saleRef = doc(collection(this.firestore, 'sales'));
    const tenantId = requireTenantId(this.authService);

    let customerId: string | undefined = debt?.customerId;
    if (debt && debt.amount > 0 && !customerId && debt.newCustomer) {
      const customerRef = doc(collection(this.firestore, 'customers'));
      batch.set(customerRef, withTenant({ ...debt.newCustomer, createdAt: serverTimestamp() }, tenantId));
      customerId = customerRef.id;
    }

    const saleData = stripUndefined({
      ...sale,
      tenantId,
      ...(debt && debt.amount > 0 && customerId ? { customerId, debtAmount: debt.amount } : {}),
      createdAt: serverTimestamp()
    });
    batch.set(saleRef, saleData);

    if (debt && debt.amount > 0 && customerId) {
      const debtRef = doc(collection(this.firestore, 'debts'));
      batch.set(debtRef, {
        customerId,
        tenantId,
        saleId: saleRef.id,
        items: sale.items.map(({ productId, productName, quantity, price, total }) => ({
          productId,
          productName,
          quantity,
          price,
          total
        })),
        totalAmount: debt.amount,
        paidAmount: 0,
        remainingAmount: debt.amount,
        createdAt: serverTimestamp()
      });
    }

    this.adjustStockInBatch(
      batch,
      sale.items.map((item) => ({ productId: item.productId, delta: -item.quantity }))
    );

    return from(this.commit(batch).then(() => saleRef.id));
  }

  /**
   * Records a (partial) return: puts the goods back on stock, logs the refund
   * against the cashier's current shift (so the Z-report nets it out of cash),
   * and bumps the sale's denormalized `refundedAmount` — all in one batch.
   */
  createReturn(ret: Omit<SaleReturn, 'id' | 'createdAt'>): Observable<string> {
    const batch = writeBatch(this.firestore);
    const returnRef = doc(collection(this.firestore, 'returns'));
    const tenantId = requireTenantId(this.authService);

    batch.set(returnRef, stripUndefined({ ...ret, tenantId, createdAt: serverTimestamp() }));
    batch.update(doc(this.firestore, 'sales', ret.saleId), { refundedAmount: increment(ret.refundAmount) });
    this.adjustStockInBatch(
      batch,
      ret.items.map((item) => ({ productId: item.productId, delta: item.quantity }))
    );

    return from(this.commit(batch).then(() => returnRef.id));
  }

  private adjustStockInBatch(batch: WriteBatch, moves: { productId: string; delta: number }[]) {
    // Same product on two lines must become one update — a batch rejects two
    // writes to one document.
    const byProduct = new Map<string, number>();
    for (const m of moves) byProduct.set(m.productId, (byProduct.get(m.productId) ?? 0) + m.delta);
    for (const [productId, delta] of byProduct) {
      if (delta === 0) continue;
      batch.update(doc(this.firestore, 'products', productId), {
        quantity: increment(delta),
        updatedAt: serverTimestamp()
      });
    }
  }

  private commit(batch: WriteBatch): Promise<void> {
    const committed = batch.commit();
    const queued = new Promise<void>((resolve) => setTimeout(resolve, OFFLINE_COMMIT_GRACE_MS));
    committed.catch((err) => console.error('Batch commit failed after grace period:', err));
    return Promise.race([committed, queued]);
  }
}

function stripUndefined<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
  const result: Record<string, unknown> = { ...data };
  for (const key of Object.keys(result)) {
    if (result[key] === undefined) delete result[key];
  }
  return result;
}

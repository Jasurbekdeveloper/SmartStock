import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { collection, doc, orderBy, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromCollectionQuery, fromDocRef } from '../firebase/firestore.utils';

export interface SaleItem {
  productId: string;
  /** Snapshotted at sale time, so the receipt/history — and category
   * popularity ranking — stay accurate even if the product is later
   * renamed, recategorized, or deleted. */
  productName: string;
  categoryId: string;
  quantity: number;
  price: number;
  total: number;
  /** Per-line amount taken off `quantity * price` before it flows into the sale's
   *  `subtotal` (absolute currency, not a percentage — same semantics as the
   *  cart-level `Sale.discount`). Stacks additively with the cart-level discount:
   *  this reduces the line total first, then the cart-level discount applies on
   *  top of the resulting subtotal, unchanged from existing behavior. */
  discount?: number;
  /** Per-unit cost price at sale time, snapshotted from `CartProfitService`'s
   *  proportional-discount profit calculation (see `pos.component.ts`'s
   *  `completeSale()`). Optional — sales created before this field existed, or
   *  any future write path that skips the profit calculation, simply omit it. */
  itemCostPrice?: number;
  /** True net profit for this line after the FULL combined discount actually
   *  given (per-line discount + cart-level checkout discount, prorated together)
   *  — `totalFinal - (itemCostPrice * quantity)`. Can be negative (sold below
   *  cost). See `CartProfitService.calculateCartProfit` for the full computation. */
  netProfit?: number;
}

export interface Sale {
  id: string;
  items: SaleItem[];
  subtotal: number;
  tax: number;
  /** Amount taken off subtotal+tax at checkout, if the cashier applied one. */
  discount?: number;
  total: number;
  paymentMethod: 'cash' | 'card';
  paidAmount: number;
  change: number;
  /** Portion of `total` left unpaid and tracked as a debt (0 if paid in full). */
  debtAmount?: number;
  /** Required when debtAmount > 0 — who owes the remainder. */
  customerId?: string;
  notes?: string;
  createdAt: Date;
  /** Links this sale to the cashier's open shift, if one was active at checkout. */
  shiftId?: string;
  /** Sum of every item's `netProfit` — the receipt's true net profit after the
   *  full combined discount actually given (per-line + cart-level, prorated
   *  together by `CartProfitService`). Optional for the same reason as
   *  `SaleItem.netProfit` above. */
  totalNetProfit?: number;
}

export interface SaleDebtInput {
  amount: number;
  /** Existing customer, OR... */
  customerId?: string;
  /** ...create this new customer as part of the same atomic write. */
  newCustomer?: { name: string; phone: string };
}

@Injectable({
  providedIn: 'root'
})
export class SalesService {
  private firestore = inject(FIRESTORE);

  getSales(): Observable<Sale[]> {
    const salesQuery = query(collection(this.firestore, 'sales'), orderBy('createdAt', 'desc'));
    return fromCollectionQuery<Sale>(salesQuery);
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
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc')
    );
    return fromCollectionQuery<Sale>(salesQuery);
  }

  /**
   * Creates the sale and, when part of the total is left unpaid, the linked
   * debt (and the customer, if they're new) in a single atomic batch. Client-
   * generated doc IDs (doc(collection(...))) let us cross-reference them
   * without a round trip, so nothing can end up half-written: a partially
   * paid sale can never exist without its debt, and a debt is never left
   * pointing at a customer that failed to save.
   */
  createSale(sale: Omit<Sale, 'id' | 'createdAt'>, debt?: SaleDebtInput): Observable<void> {
    const batch = writeBatch(this.firestore);
    const saleRef = doc(collection(this.firestore, 'sales'));

    let customerId: string | undefined = debt?.customerId;
    if (debt && debt.amount > 0 && !customerId && debt.newCustomer) {
      const customerRef = doc(collection(this.firestore, 'customers'));
      batch.set(customerRef, { ...debt.newCustomer, createdAt: serverTimestamp() });
      customerId = customerRef.id;
    }

    const saleData: Record<string, unknown> = {
      ...sale,
      ...(debt && debt.amount > 0 && customerId ? { customerId, debtAmount: debt.amount } : {}),
      createdAt: serverTimestamp()
    };
    for (const key of Object.keys(saleData)) {
      if (saleData[key] === undefined) delete saleData[key];
    }
    batch.set(saleRef, saleData);

    if (debt && debt.amount > 0 && customerId) {
      const debtRef = doc(collection(this.firestore, 'debts'));
      batch.set(debtRef, {
        customerId,
        saleId: saleRef.id,
        items: sale.items,
        totalAmount: debt.amount,
        paidAmount: 0,
        remainingAmount: debt.amount,
        createdAt: serverTimestamp()
      });
    }

    return from(batch.commit());
  }
}

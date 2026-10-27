import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, from } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  addDoc,
  collection,
  doc,
  increment,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromCollectionQuery, fromDocRef } from '../firebase/firestore.utils';
import { Customer } from './customer.service';
import { AuthService } from './auth.service';
import { requireTenantId, tenantQuery, withTenant } from './tenant-data';
import { commitOrQueue, stripUndefined } from './sales.service';
import { roundMoney } from '../utils/pos-math';

export type DebtPaymentMethod = 'cash' | 'card' | 'bank';

/** One payment against one debt (`debtPayments/{id}`), immutable. */
export interface DebtPayment {
  id: string;
  debtId: string;
  customerId: string;
  amount: number;
  method: DebtPaymentMethod;
  /** Shift the cash went into, when taken at a till. */
  shiftId?: string;
  cashMovementId?: string;
  cashierId: string;
  cashierName: string;
  note?: string;
  createdAt: Date;
}

export interface CollectPaymentInput {
  customerId: string;
  customerName?: string;
  amount: number;
  method: DebtPaymentMethod;
  /** Open shift of the current user: cash then goes into that drawer. */
  shiftId?: string;
  /** Pay one specific debt; otherwise oldest debts are paid first. */
  debtId?: string;
  note?: string;
}

export interface CollectPaymentResult {
  /** What was actually applied (never more than the customer owes). */
  applied: number;
  paidDebts: { debtId: string; amount: number }[];
}

/** Splits a payment over open debts, oldest first. Pure — unit tested. */
export function allocateDebtPayment(
  debts: Pick<Debt, 'id' | 'remainingAmount' | 'createdAt'>[],
  amount: number
): { debtId: string; amount: number }[] {
  let left = roundMoney(amount);
  const out: { debtId: string; amount: number }[] = [];
  const open = debts
    .filter((d) => d.remainingAmount > 0.005)
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  for (const d of open) {
    if (left <= 0.005) break;
    const take = roundMoney(Math.min(d.remainingAmount, left));
    out.push({ debtId: d.id, amount: take });
    left = roundMoney(left - take);
  }
  return out;
}

// Customer now lives in customer.service.ts (its own CRUD module — see 5-band CRM
// plan); re-exported here so existing imports across pos/sale-detail/statistics/debt
// pages keep working unchanged.
export type { Customer } from './customer.service';

export interface DebtItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
}

export interface Debt {
  id: string;
  customerId: string;
  customer?: Customer;
  /** Set when this debt was opened from a POS sale's unpaid remainder. */
  saleId?: string;
  /** What was bought on credit, if this debt came from a POS sale. Manually
   * recorded debts (via the "add debt" form) have no items — that's fine. */
  items?: DebtItem[];
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  createdAt: Date;
  lastPaymentDate?: Date;
  notes?: string;
  /** Optional "pay by" date, set at debt creation. Used by the 11-band low-stock/debt-due
   *  alert check (dashboard) to flag debts that are now overdue. */
  dueDate?: Date;
}

@Injectable({
  providedIn: 'root'
})
export class DebtService {
  private firestore = inject(FIRESTORE);
  private authService = inject(AuthService);

  getDebts(): Observable<Debt[]> {
    const debtsQuery = tenantQuery(this.firestore, 'debts', requireTenantId(this.authService), orderBy('createdAt', 'desc'));
    return fromCollectionQuery<Debt>(debtsQuery);
  }

  getDebtById(id: string): Observable<Debt | undefined> {
    return fromDocRef<Debt>(doc(this.firestore, 'debts', id));
  }

  getCustomerDebts(customerId: string): Observable<Debt[]> {
    const debtsQuery = query(
      collection(this.firestore, 'debts'),
      where('tenantId', '==', requireTenantId(this.authService)),
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc')
    );
    return fromCollectionQuery<Debt>(debtsQuery);
  }

  createDebt(debt: {
    customerId: string;
    totalAmount: number;
    notes?: string;
    dueDate?: Date;
  }): Observable<void> {
    const data: Record<string, unknown> = withTenant({
      customerId: debt.customerId,
      totalAmount: debt.totalAmount,
      paidAmount: 0,
      remainingAmount: debt.totalAmount,
      createdAt: serverTimestamp()
    }, requireTenantId(this.authService));
    if (debt.notes) data['notes'] = debt.notes;
    if (debt.dueDate) data['dueDate'] = debt.dueDate;

    return from(addDoc(collection(this.firestore, 'debts'), data)).pipe(map(() => undefined));
  }

  /** Payment history of one customer, newest first. */
  getCustomerPayments(customerId: string): Observable<DebtPayment[]> {
    const q = tenantQuery(this.firestore, 'debtPayments', requireTenantId(this.authService), where('customerId', '==', customerId));
    return fromCollectionQuery<DebtPayment>(q).pipe(
      map((list) => list.slice().sort((a, b) => (b.createdAt?.getTime?.() ?? Date.now()) - (a.createdAt?.getTime?.() ?? Date.now())))
    );
  }

  /** Pays one specific debt. */
  payDebt(debtId: string, amount: number, method: DebtPaymentMethod = 'cash', shiftId?: string): Observable<CollectPaymentResult> {
    return from(
      this.getDebtOnce(debtId).then((d) =>
        d ? this.collectPaymentAsync({ customerId: d.customerId, amount, method, shiftId, debtId }) : { applied: 0, paidDebts: [] }
      )
    );
  }

  /**
   * A customer pays off debt — at the till by a cashier, or in the back office.
   * One atomic write: each debt touched gets its paid/remaining amounts moved by an
   * increment and a `debtPayments` record; cash taken during an open shift also
   * becomes a "debt payment" cash-in of that drawer, so the Z-report and the drawer
   * total include it.
   */
  collectPayment(input: CollectPaymentInput): Observable<CollectPaymentResult> {
    return from(this.collectPaymentAsync(input));
  }

  private async getDebtOnce(id: string): Promise<Debt | undefined> {
    return firstValueFrom(this.getDebtById(id));
  }

  private async collectPaymentAsync(input: CollectPaymentInput): Promise<CollectPaymentResult> {
    const tenantId = requireTenantId(this.authService);
    const user = this.authService.getCurrentUser();
    const debts = input.debtId
      ? [await this.getDebtOnce(input.debtId)].filter((d): d is Debt => !!d)
      : await firstValueFrom(this.getCustomerDebts(input.customerId));
    const slices = allocateDebtPayment(debts, input.amount);
    const applied = roundMoney(slices.reduce((s, x) => s + x.amount, 0));
    if (applied <= 0) return { applied: 0, paidDebts: [] };

    const wb = writeBatch(this.firestore);
    const cashIntoDrawer = input.method === 'cash' && !!input.shiftId;
    const movementRef = cashIntoDrawer ? doc(collection(this.firestore, 'cashMovements')) : null;

    for (const slice of slices) {
      const paymentRef = doc(collection(this.firestore, 'debtPayments'));
      wb.set(
        paymentRef,
        withTenant(
          stripUndefined({
            debtId: slice.debtId,
            customerId: input.customerId,
            amount: slice.amount,
            method: input.method,
            shiftId: input.shiftId,
            cashMovementId: movementRef?.id,
            cashierId: user?.uid ?? '',
            cashierName: user?.displayName ?? '',
            note: input.note?.trim() || undefined,
            createdAt: serverTimestamp()
          }),
          tenantId
        )
      );
      wb.update(doc(this.firestore, 'debts', slice.debtId), {
        paidAmount: increment(slice.amount),
        remainingAmount: increment(-slice.amount),
        lastPaymentDate: serverTimestamp(),
        lastPaymentId: paymentRef.id
      });
    }

    if (movementRef) {
      wb.set(
        movementRef,
        withTenant(
          stripUndefined({
            shiftId: input.shiftId,
            type: 'in',
            amount: applied,
            reason: 'debtPayment',
            note: input.customerName ? `${input.customerName}` : undefined,
            cashierId: user?.uid ?? '',
            cashierName: user?.displayName ?? '',
            createdAt: serverTimestamp()
          }),
          tenantId
        )
      );
    }
    await commitOrQueue(wb);
    return { applied, paidDebts: slices };
  }

  getCustomers(): Observable<Customer[]> {
    const customersQuery = tenantQuery(this.firestore, 'customers', requireTenantId(this.authService), orderBy('name'));
    return fromCollectionQuery<Customer>(customersQuery);
  }

  addCustomer(customer: Omit<Customer, 'id'>): Observable<string> {
    return from(
      addDoc(collection(this.firestore, 'customers'), withTenant({ ...customer, createdAt: serverTimestamp() }, requireTenantId(this.authService)))
    ).pipe(map((ref) => ref.id));
  }
}

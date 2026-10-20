import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
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
  where
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromCollectionQuery, fromDocRef } from '../firebase/firestore.utils';
import { Customer } from './customer.service';
import { AuthService } from './auth.service';
import { requireTenantId, tenantQuery, withTenant } from './tenant-data';

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

  /** Applies a relative payment without a read-then-write race. */
  payDebt(debtId: string, amount: number): Observable<void> {
    return from(
      updateDoc(doc(this.firestore, 'debts', debtId), {
        paidAmount: increment(amount),
        remainingAmount: increment(-amount),
        lastPaymentDate: serverTimestamp()
      })
    );
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

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

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string;
  email?: string;
  createdAt?: Date;
}

export interface Debt {
  id: string;
  customerId: string;
  customer?: Customer;
  /** Set when this debt was opened from a POS sale's unpaid remainder. */
  saleId?: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  createdAt: Date;
  lastPaymentDate?: Date;
  notes?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DebtService {
  private firestore = inject(FIRESTORE);

  getDebts(): Observable<Debt[]> {
    const debtsQuery = query(collection(this.firestore, 'debts'), orderBy('createdAt', 'desc'));
    return fromCollectionQuery<Debt>(debtsQuery);
  }

  getDebtById(id: string): Observable<Debt | undefined> {
    return fromDocRef<Debt>(doc(this.firestore, 'debts', id));
  }

  getCustomerDebts(customerId: string): Observable<Debt[]> {
    const debtsQuery = query(
      collection(this.firestore, 'debts'),
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc')
    );
    return fromCollectionQuery<Debt>(debtsQuery);
  }

  createDebt(debt: {
    customerId: string;
    totalAmount: number;
    notes?: string;
  }): Observable<void> {
    const data: Record<string, unknown> = {
      customerId: debt.customerId,
      totalAmount: debt.totalAmount,
      paidAmount: 0,
      remainingAmount: debt.totalAmount,
      createdAt: serverTimestamp()
    };
    if (debt.notes) data['notes'] = debt.notes;

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
    const customersQuery = query(collection(this.firestore, 'customers'), orderBy('name'));
    return fromCollectionQuery<Customer>(customersQuery);
  }

  addCustomer(customer: Omit<Customer, 'id'>): Observable<string> {
    return from(
      addDoc(collection(this.firestore, 'customers'), { ...customer, createdAt: serverTimestamp() })
    ).pipe(map((ref) => ref.id));
  }
}

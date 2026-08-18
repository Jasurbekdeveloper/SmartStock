import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromCollectionQuery, fromDocRef } from '../firebase/firestore.utils';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string;
  email?: string;
  /** Optional cap on how much debt this customer may carry at once, in currency
   *  units. Unset means no cap. Enforced client-side in the POS payment dialog
   *  when a sale would add to their outstanding debt. */
  creditLimit?: number;
  createdAt?: Date;
}

@Injectable({
  providedIn: 'root'
})
export class CustomerService {
  private firestore = inject(FIRESTORE);

  getCustomers(): Observable<Customer[]> {
    const customersQuery = query(collection(this.firestore, 'customers'), orderBy('name'));
    return fromCollectionQuery<Customer>(customersQuery);
  }

  getCustomerById(id: string): Observable<Customer | undefined> {
    return fromDocRef<Customer>(doc(this.firestore, 'customers', id));
  }

  addCustomer(customer: Omit<Customer, 'id'>): Observable<string> {
    // Optional fields (e.g. creditLimit left unset) must not reach Firestore as
    // explicit `undefined` — addDoc rejects that. Simplest for a new doc: drop them.
    const data: Record<string, unknown> = { ...customer, createdAt: serverTimestamp() };
    for (const key of Object.keys(data)) {
      if (data[key] === undefined) delete data[key];
    }
    return from(addDoc(collection(this.firestore, 'customers'), data)).pipe(map((ref) => ref.id));
  }

  updateCustomer(id: string, customer: Partial<Customer>): Observable<void> {
    // Here an explicit `undefined` (e.g. clearing creditLimit in the edit form) means
    // "remove this field" — convert it to Firestore's deleteField() sentinel so the
    // old value actually gets cleared instead of being silently skipped.
    const data: Record<string, unknown> = { ...customer };
    for (const key of Object.keys(data)) {
      if (data[key] === undefined) data[key] = deleteField();
    }
    return from(updateDoc(doc(this.firestore, 'customers', id), data));
  }

  deleteCustomer(id: string): Observable<void> {
    return from(deleteDoc(doc(this.firestore, 'customers', id)));
  }
}

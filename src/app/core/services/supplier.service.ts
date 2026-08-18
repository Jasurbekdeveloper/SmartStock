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

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  contactPerson?: string;
  notes?: string;
  createdAt?: Date;
}

@Injectable({
  providedIn: 'root'
})
export class SupplierService {
  private firestore = inject(FIRESTORE);

  getSuppliers(): Observable<Supplier[]> {
    const suppliersQuery = query(collection(this.firestore, 'suppliers'), orderBy('name'));
    return fromCollectionQuery<Supplier>(suppliersQuery);
  }

  getSupplierById(id: string): Observable<Supplier | undefined> {
    return fromDocRef<Supplier>(doc(this.firestore, 'suppliers', id));
  }

  addSupplier(supplier: Omit<Supplier, 'id'>): Observable<string> {
    // Optional fields left unset must not reach Firestore as explicit `undefined` —
    // addDoc rejects that. Simplest for a new doc: drop them.
    const data: Record<string, unknown> = { ...supplier, createdAt: serverTimestamp() };
    for (const key of Object.keys(data)) {
      if (data[key] === undefined) delete data[key];
    }
    return from(addDoc(collection(this.firestore, 'suppliers'), data)).pipe(map((ref) => ref.id));
  }

  updateSupplier(id: string, supplier: Partial<Supplier>): Observable<void> {
    // Here an explicit `undefined` (e.g. clearing a field in the edit form) means
    // "remove this field" — convert it to Firestore's deleteField() sentinel so the
    // old value actually gets cleared instead of being silently skipped.
    const data: Record<string, unknown> = { ...supplier };
    for (const key of Object.keys(data)) {
      if (data[key] === undefined) data[key] = deleteField();
    }
    return from(updateDoc(doc(this.firestore, 'suppliers', id), data));
  }

  deleteSupplier(id: string): Observable<void> {
    return from(deleteDoc(doc(this.firestore, 'suppliers', id)));
  }
}

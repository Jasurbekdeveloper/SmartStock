import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  increment,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromCollectionQuery, fromDocRef } from '../firebase/firestore.utils';

export interface Product {
  id: string;
  name: string;
  barcode: string;
  price: number;
  cost: number;
  quantity: number;
  unit: string;
  /** Optional alternate sale unit (e.g. primary "dona", alt "quti") — stock quantity
   *  itself always stays in the primary unit; this is only used to let POS/staff
   *  enter quantities in a more convenient unit and convert on the fly. */
  altUnit?: string;
  /** How many primary units make up 1 alt unit (e.g. altUnit "quti", factor 20 → 1 quti = 20 dona). */
  altUnitFactor?: number;
  minQuantity?: number;
  categoryId: string;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private firestore = inject(FIRESTORE);

  getProducts(): Observable<Product[]> {
    const productsQuery = query(collection(this.firestore, 'products'), orderBy('name'));
    return fromCollectionQuery<Product>(productsQuery);
  }

  getProductById(id: string): Observable<Product | undefined> {
    return fromDocRef<Product>(doc(this.firestore, 'products', id));
  }

  addProduct(product: Omit<Product, 'id'>): Observable<void> {
    // Optional fields (e.g. altUnit/altUnitFactor left unset) must not reach Firestore
    // as explicit `undefined` — addDoc rejects that. Simplest for a new doc: drop them.
    const data: Record<string, unknown> = {
      ...product,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    for (const key of Object.keys(data)) {
      if (data[key] === undefined) delete data[key];
    }
    return from(addDoc(collection(this.firestore, 'products'), data)).pipe(map(() => undefined));
  }

  updateProduct(id: string, product: Partial<Product>): Observable<void> {
    // Here an explicit `undefined` (e.g. clearing altUnit in the edit form) means
    // "remove this field" — convert it to Firestore's deleteField() sentinel so the
    // old value actually gets cleared instead of being silently skipped.
    const data: Record<string, unknown> = { ...product, updatedAt: serverTimestamp() };
    for (const key of Object.keys(data)) {
      if (data[key] === undefined) data[key] = deleteField();
    }
    return from(updateDoc(doc(this.firestore, 'products', id), data));
  }

  deleteProduct(id: string): Observable<void> {
    return from(deleteDoc(doc(this.firestore, 'products', id)));
  }

  /** Applies a relative quantity change (e.g. -2) without a read-then-write race. */
  adjustQuantity(id: string, delta: number): Observable<void> {
    return from(
      updateDoc(doc(this.firestore, 'products', id), {
        quantity: increment(delta),
        updatedAt: serverTimestamp()
      })
    );
  }
}

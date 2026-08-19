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
  /** Optional alternate sale units (e.g. primary "dona", alts "quti"/"karobka") — stock
   *  quantity itself always stays in the primary unit; this is only used to let POS/staff
   *  enter quantities in a more convenient unit and convert on the fly. `factor` is how
   *  many primary units make up 1 of that alt unit (e.g. unit "quti", factor 20 → 1 quti = 20 dona). */
  altUnits?: { unit: string; factor: number }[];
  /** Optional extra search terms (synonyms/loanwords/abbreviations) an admin can tag
   *  onto a product so it's also found under a name it isn't actually called — e.g. a
   *  product named "Quvur" tagged with "truba" (both mean "pipe"). Unlike
   *  `normalizeForSearch()`'s Latin/Cyrillic script matching, this covers genuinely
   *  different words with the same meaning, which has no deterministic mapping. */
  searchKeywords?: string[];
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
    // Optional fields (e.g. altUnits left unset) must not reach Firestore
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
    // Here an explicit `undefined` (e.g. clearing altUnits in the edit form) means
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

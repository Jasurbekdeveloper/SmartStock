import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  addDoc,
  collection,
  deleteDoc,
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
    return from(
      addDoc(collection(this.firestore, 'products'), {
        ...product,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
    ).pipe(map(() => undefined));
  }

  updateProduct(id: string, product: Partial<Product>): Observable<void> {
    return from(
      updateDoc(doc(this.firestore, 'products', id), { ...product, updatedAt: serverTimestamp() })
    );
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

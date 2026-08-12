import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { addDoc, collection, doc, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { fromCollectionQuery, fromDocRef } from '../firebase/firestore.utils';
import { Product } from './product.service';

export interface SaleItem {
  productId: string;
  product?: Product;
  quantity: number;
  price: number;
  total: number;
}

export interface Sale {
  id: string;
  items: SaleItem[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'debit';
  paidAmount: number;
  change: number;
  notes?: string;
  createdAt: Date;
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

  createSale(sale: Omit<Sale, 'id' | 'createdAt'>): Observable<void> {
    return from(
      addDoc(collection(this.firestore, 'sales'), {
        ...sale,
        createdAt: serverTimestamp()
      })
    ).pipe(map(() => undefined));
  }
}

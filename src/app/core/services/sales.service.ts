import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
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
  paymentMethod: 'cash' | 'card' | 'check';
  paidAmount: number;
  change: number;
  notes?: string;
  createdAt: Date;
}

@Injectable({
  providedIn: 'root'
})
export class SalesService {
  private sales$ = new BehaviorSubject<Sale[]>([]);

  constructor() {}

  getSales(): Observable<Sale[]> {
    return this.sales$.asObservable();
  }

  getSaleById(id: string): Observable<Sale | undefined> {
    return new Observable(observer => {
      observer.next(this.sales$.value.find(s => s.id === id));
      observer.complete();
    });
  }

  createSale(sale: Sale): Observable<Sale> {
    const newSale = { ...sale, id: Date.now().toString() };
    this.sales$.next([...this.sales$.value, newSale]);
    return new Observable(observer => {
      observer.next(newSale);
      observer.complete();
    });
  }
}

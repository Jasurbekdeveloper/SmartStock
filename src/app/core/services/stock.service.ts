import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface StockEntry {
  id: string;
  productId: string;
  quantity: number;
  supplier: string;
  costPrice: number;
  totalCost: number;
  notes?: string;
  createdAt: Date;
  updatedAt?: Date;
}

@Injectable({
  providedIn: 'root'
})
export class StockService {
  private stockEntries$ = new BehaviorSubject<StockEntry[]>([]);

  constructor() {}

  getStockEntries(): Observable<StockEntry[]> {
    return this.stockEntries$.asObservable();
  }

  getStockByProductId(productId: string): Observable<StockEntry[]> {
    return new Observable(observer => {
      observer.next(
        this.stockEntries$.value.filter(s => s.productId === productId)
      );
      observer.complete();
    });
  }

  addStockEntry(entry: StockEntry): Observable<StockEntry> {
    const newEntry = { ...entry, id: Date.now().toString() };
    this.stockEntries$.next([...this.stockEntries$.value, newEntry]);
    return new Observable(observer => {
      observer.next(newEntry);
      observer.complete();
    });
  }
}
